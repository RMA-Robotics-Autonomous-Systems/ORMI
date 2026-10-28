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

/** A worker reply, echoing the `id` of the request it answers. */
type WorkerResponse = { id: number } & (
	| { type: "ready" }
	| { type: "topics"; data: BagTopicInfo[] }
	| { type: "series"; topicName: string; data: TimeSeriesPoint[] }
	| { type: "gps"; topicName: string; data: GpsPoint[] }
	| ({ type: "playgroundData" } & PlaygroundData)
	| {
			type: "detectionResult";
			mad: DetectionRunResult | null;
			rsd: DetectionRunResult | null;
			cusum: DetectionRunResult | null;
	  }
	| { type: "error"; message: string }
);

/** One in-flight request, settled by the reply carrying its id. */
interface PendingCall {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

/**
 * Main-thread host for the db3 reader Web Worker.
 * All heavy SQLite and CDR work runs off the main thread.
 *
 * Every request carries an id the worker echoes, so concurrent calls of the
 * same kind each get their own reply, and every pending call is rejected when
 * the worker fails or is terminated: none is left unsettled.
 */
export class Db3ReaderHost {
	private worker: Worker;
	private pending = new Map<number, PendingCall>();
	private nextId = 0;

	constructor() {
		this.worker = new Worker(
			new URL("./db3-reader.worker", import.meta.url),
			{ type: "module" },
		);

		this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const msg = event.data;
			const call = this.pending.get(msg.id);
			if (!call) return;
			this.pending.delete(msg.id);

			if (msg.type === "error") call.reject(new Error(msg.message));
			else if (msg.type === "ready") call.resolve(undefined);
			else if (
				msg.type === "topics" ||
				msg.type === "series" ||
				msg.type === "gps"
			)
				call.resolve(msg.data);
			else call.resolve(msg);
		};

		// The worker script failed to load or threw outside a request.
		this.worker.onerror = (e) =>
			this.rejectAll(new Error(e.message || "Bag reader worker failed"));
	}

	/**
	 * Post one request and wait for the reply carrying its id.
	 * @param message - The request, without its id.
	 * @param transfer - Buffers to transfer to the worker.
	 * @returns The reply's payload.
	 */
	private request<T>(
		message: Record<string, unknown>,
		transfer: Transferable[] = [],
	): Promise<T> {
		const id = this.nextId++;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
			});
			this.worker.postMessage({ ...message, id }, transfer);
		});
	}

	/** Reject and forget every in-flight request. */
	private rejectAll(error: Error): void {
		const calls = [...this.pending.values()];
		this.pending.clear();
		for (const call of calls) call.reject(error);
	}

	/** Load a .db3 file from an ArrayBuffer. Resolves when the DB is ready. */
	openBag(buffer: ArrayBuffer): Promise<void> {
		return this.request<void>({ type: "open", buffer }, [buffer]);
	}

	/** Returns topics and message counts. */
	getTopics(): Promise<BagTopicInfo[]> {
		return this.request<BagTopicInfo[]>({ type: "topics" });
	}

	/** Reads a numeric scalar topic and returns time-series points. */
	readTopic(topicName: string): Promise<TimeSeriesPoint[]> {
		return this.request<TimeSeriesPoint[]>({ type: "read", topicName });
	}

	/** Reads a sensor_msgs/NavSatFix topic and returns GPS points. */
	readGpsTopic(topicName: string): Promise<GpsPoint[]> {
		return this.request<GpsPoint[]>({ type: "readGps", topicName });
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
		return this.request<PlaygroundData>({
			type: "readAll",
			numericTopics,
			eventTopics,
			gpsTopic,
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
		cusum: DetectionRunResult | null;
	}> {
		return this.request({
			type: "detect",
			points,
			detectionConfig: config,
		});
	}

	/** Stop the worker. Every call still in flight rejects. */
	terminate(): void {
		this.worker.terminate();
		this.rejectAll(new Error("Bag reader closed"));
	}
}
