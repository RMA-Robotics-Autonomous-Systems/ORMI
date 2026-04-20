"use client";

import type {
	BagSummary,
	BagTopicInfo,
	GpsPoint,
	PlaygroundData,
	TimeSeriesPoint,
} from "./bag-types";
import type {
	DetectionConfig,
	DetectionRunResult,
} from "../algorithms/detection-types";

type WorkerResponse =
	| { type: "ready" }
	| { type: "topics"; data: BagTopicInfo[] }
	| { type: "series"; topicName: string; data: TimeSeriesPoint[] }
	| { type: "gps"; topicName: string; data: GpsPoint[] }
	| ({ type: "playgroundData" } & PlaygroundData)
	| {
			type: "detectionResult";
			mad: DetectionRunResult | null;
			rsd: DetectionRunResult | null;
	  }
	| { type: "error"; message: string };

/**
 * Main-thread host for the db3 reader Web Worker.
 * All heavy SQLite and CDR work runs off the main thread.
 */
export class Db3ReaderHost {
	private worker: Worker;
	private pending = new Map<string, (value: unknown) => void>();

	constructor() {
		this.worker = new Worker(
			new URL("./db3-reader.worker.js", import.meta.url),
			{ type: "module" },
		);

		this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const msg = event.data;

			if (msg.type === "ready") {
				this.pending.get("ready")?.(undefined);
				this.pending.delete("ready");
			} else if (msg.type === "topics") {
				this.pending.get("topics")?.(msg.data);
				this.pending.delete("topics");
			} else if (msg.type === "series") {
				this.pending.get(`series:${msg.topicName}`)?.(msg.data);
				this.pending.delete(`series:${msg.topicName}`);
			} else if (msg.type === "gps") {
				this.pending.get(`gps:${msg.topicName}`)?.(msg.data);
				this.pending.delete(`gps:${msg.topicName}`);
			} else if (msg.type === "playgroundData") {
				this.pending.get("playgroundData")?.(msg);
				this.pending.delete("playgroundData");
			} else if (msg.type === "detectionResult") {
				this.pending.get("detectionResult")?.(msg);
				this.pending.delete("detectionResult");
			} else if (msg.type === "error") {
				// Reject all pending promises
				this.pending.forEach((resolve) =>
					resolve(Promise.reject(new Error(msg.message))),
				);
				this.pending.clear();
			}
		};
	}

	/** Load a .db3 file from an ArrayBuffer. Resolves when the DB is ready. */
	openBag(buffer: ArrayBuffer): Promise<void> {
		return new Promise((resolve, reject) => {
			this.pending.set("ready", resolve as (v: unknown) => void);
			this.worker.onerror = (e) => reject(new Error(e.message));
			this.worker.postMessage({ type: "open", buffer }, [buffer]);
		});
	}

	/** Returns topics and message counts. */
	getTopics(): Promise<BagTopicInfo[]> {
		return new Promise((resolve) => {
			this.pending.set("topics", resolve as (v: unknown) => void);
			this.worker.postMessage({ type: "topics" });
		});
	}

	/** Reads a numeric scalar topic and returns time-series points. */
	readTopic(topicName: string): Promise<TimeSeriesPoint[]> {
		return new Promise((resolve) => {
			this.pending.set(
				`series:${topicName}`,
				resolve as (v: unknown) => void,
			);
			this.worker.postMessage({ type: "read", topicName });
		});
	}

	/** Reads a sensor_msgs/NavSatFix topic and returns GPS points. */
	readGpsTopic(topicName: string): Promise<GpsPoint[]> {
		return new Promise((resolve) => {
			this.pending.set(
				`gps:${topicName}`,
				resolve as (v: unknown) => void,
			);
			this.worker.postMessage({ type: "readGps", topicName });
		});
	}

	/** Reads topics and computes a summary. */
	async getSummary(): Promise<BagSummary> {
		const topics = await this.getTopics();
		const messageCount = topics.reduce((s, t) => s + t.messageCount, 0);
		return { topics, messageCount, duration: 0 };
	}

	/**
	 * Reads all requested topics in a single pass and returns structured
	 * PlaygroundData. Handles scalar, Twist, Vector3Stamped, and NavSatFix types.
	 */
	readPlayground(
		numericTopics: string[],
		eventTopics: string[],
		gpsTopic: string | null,
	): Promise<PlaygroundData> {
		return new Promise((resolve) => {
			this.pending.set("playgroundData", resolve as (v: unknown) => void);
			this.worker.postMessage({
				type: "readAll",
				numericTopics,
				eventTopics,
				gpsTopic,
			});
		});
	}

	/**
	 * Runs MAD and/or RSD detection off the main thread.
	 * Returns null for an algorithm if it is disabled in the config.
	 */
	runDetection(
		points: TimeSeriesPoint[],
		config: DetectionConfig,
	): Promise<{
		mad: DetectionRunResult | null;
		rsd: DetectionRunResult | null;
	}> {
		return new Promise((resolve) => {
			this.pending.set(
				"detectionResult",
				resolve as (v: unknown) => void,
			);
			this.worker.postMessage({
				type: "detect",
				points,
				detectionConfig: config,
			});
		});
	}

	terminate(): void {
		this.worker.terminate();
	}
}
