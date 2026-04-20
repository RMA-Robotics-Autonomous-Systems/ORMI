/**
 * Web Worker: loads a ROS2 .db3 bag file (ArrayBuffer) using sql.js,
 * parses topic metadata and CDR message payloads, and posts results back.
 *
 * Legacy protocol (kept for backward compat):
 *   receive: { type: "open"; buffer: ArrayBuffer }
 *   receive: { type: "topics" }
 *   receive: { type: "read"; topicName: string }
 *   receive: { type: "readGps"; topicName: string }
 *   send:    { type: "ready" | "topics" | "series" | "gps" | "error" }
 *
 * Playground protocol:
 *   receive: { type: "readAll"; numericTopics: string[]; eventTopics: string[]; gpsTopic: string | null }
 *   send:    { type: "playgroundData"; lineSeries; eventSeries; gps; duration }
 */

import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { CdrReader } from "@foxglove/cdr";
import type {
	BagTopicInfo,
	GpsPoint,
	PlaygroundData,
	PlaygroundEventSeries,
	PlaygroundLineSeries,
	TimeSeriesPoint,
} from "./bag-types";
import type {
	DetectionConfig,
	DetectionRunResult,
} from "../algorithms/detection-types";
import { runMAD } from "../algorithms/mad";
import { runRSD } from "../algorithms/rsd";
import { runCUSUM } from "../algorithms/cusum";

let db: Database | null = null;

self.onmessage = async (event: MessageEvent) => {
	const msg = event.data as WorkerMessage;
	try {
		switch (msg.type) {
			case "open":
				await handleOpen(msg.buffer);
				break;
			case "topics":
				handleTopics();
				break;
			case "read":
				handleRead(msg.topicName);
				break;
			case "readGps":
				handleReadGps(msg.topicName);
				break;
			case "readAll":
				handleReadAll(msg.numericTopics, msg.eventTopics, msg.gpsTopic);
				break;
			case "detect":
				handleDetect(msg.points, msg.detectionConfig);
				break;
		}
	} catch (err) {
		self.postMessage({
			type: "error",
			message: err instanceof Error ? err.message : String(err),
		});
	}
};

async function handleOpen(buffer: ArrayBuffer): Promise<void> {
	// In a Web Worker, bare paths like "/sql-wasm.wasm" have no base origin.
	// We must build an absolute URL using self.location.origin.
	// sql.js may request "sql-wasm-browser.wasm" — map any wasm request to
	// the single file we serve from the public directory.
	const SQL = await initSqlJs({
		locateFile: (_file: string) => `${self.location.origin}/sql-wasm.wasm`,
	});
	db = new SQL.Database(new Uint8Array(buffer));
	self.postMessage({ type: "ready" });
}

function handleTopics(): void {
	if (!db) throw new Error("No bag loaded");

	const result = db.exec(
		`SELECT t.id, t.name, t.type, COUNT(m.id) as message_count
         FROM topics t
         LEFT JOIN messages m ON m.topic_id = t.id
         GROUP BY t.id`,
	);

	const topics: BagTopicInfo[] = [];
	if (result[0]) {
		for (const row of result[0].values) {
			topics.push({
				id: row[0] as number,
				name: row[1] as string,
				type: row[2] as string,
				messageCount: row[3] as number,
			});
		}
	}

	self.postMessage({ type: "topics", data: topics });
}

function handleRead(topicName: string): void {
	if (!db) throw new Error("No bag loaded");
	const topicResult = db.exec(
		`SELECT id FROM topics WHERE name = '${esc(topicName)}' LIMIT 1`,
	);
	if (!topicResult[0]?.values[0]) {
		self.postMessage({ type: "series", topicName, data: [] });
		return;
	}
	const topicId = topicResult[0].values[0][0] as number;
	const result = db.exec(
		`SELECT timestamp, data FROM messages WHERE topic_id = ${topicId} ORDER BY timestamp`,
	);
	const points: TimeSeriesPoint[] = [];
	const startTs = result[0]?.values[0]?.[0] as number | undefined;
	if (result[0]) {
		for (const row of result[0].values) {
			const ts = row[0] as number;
			const raw = row[1] as Uint8Array;
			const value = decodeSingleFloat(raw);
			if (value !== null) {
				points.push({
					timestamp: startTs !== undefined ? ts - startTs : ts,
					value,
				});
			}
		}
	}
	self.postMessage({ type: "series", topicName, data: points });
}

function handleReadGps(topicName: string): void {
	if (!db) throw new Error("No bag loaded");
	const topicResult = db.exec(
		`SELECT id FROM topics WHERE name = '${esc(topicName)}' LIMIT 1`,
	);
	if (!topicResult[0]?.values[0]) {
		self.postMessage({ type: "gps", topicName, data: [] });
		return;
	}
	const topicId = topicResult[0].values[0][0] as number;
	const result = db.exec(
		`SELECT timestamp, data FROM messages WHERE topic_id = ${topicId} ORDER BY timestamp`,
	);
	const points: GpsPoint[] = [];
	const startTs = result[0]?.values[0]?.[0] as number | undefined;
	if (result[0]) {
		for (const row of result[0].values) {
			const ts = row[0] as number;
			const raw = row[1] as Uint8Array;
			const gps = decodeNavSatFix(raw);
			if (gps !== null) {
				points.push({
					timestamp: startTs !== undefined ? ts - startTs : ts,
					...gps,
				});
			}
		}
	}
	self.postMessage({ type: "gps", topicName, data: points });
}

// ---------------------------------------------------------------------------
// Playground: read all topics in a single SQL pass
// ---------------------------------------------------------------------------

function handleReadAll(
	numericTopics: string[],
	eventTopics: string[],
	gpsTopic: string | null,
): void {
	if (!db) throw new Error("No bag loaded");

	const allTopics = [
		...new Set([
			...numericTopics,
			...eventTopics,
			...(gpsTopic ? [gpsTopic] : []),
		]),
	];
	if (allTopics.length === 0) {
		postPlayground({
			lineSeries: [],
			eventSeries: [],
			gps: [],
			duration: 0,
		});
		return;
	}

	const numericSet = new Set(numericTopics);
	const eventSet = new Set(eventTopics);
	const namesStr = allTopics.map((n) => `'${esc(n)}'`).join(", ");

	const infoResult = db.exec(
		`SELECT id, name, type FROM topics WHERE name IN (${namesStr})`,
	);
	const topicTypes = new Map<string, string>();
	const topicIds: number[] = [];
	if (infoResult[0]) {
		for (const row of infoResult[0].values) {
			topicIds.push(row[0] as number);
			topicTypes.set(row[1] as string, row[2] as string);
		}
	}
	if (topicIds.length === 0) {
		postPlayground({
			lineSeries: [],
			eventSeries: [],
			gps: [],
			duration: 0,
		});
		return;
	}

	const msgResult = db.exec(
		`SELECT t.name, t.type, m.timestamp, m.data
         FROM messages m
         JOIN topics t ON t.id = m.topic_id
         WHERE m.topic_id IN (${topicIds.join(", ")})
         ORDER BY m.timestamp`,
	);

	const lineMap = new Map<
		string,
		{
			topic: string;
			name: string;
			axisKey: string;
			points: TimeSeriesPoint[];
		}
	>();
	const eventMap = new Map<string, number[]>();
	for (const t of eventTopics) eventMap.set(t, []);
	const gpsPoints: GpsPoint[] = [];
	let bagStart: number | null = null;
	let bagEnd = 0;

	if (!msgResult[0]) {
		postPlayground({
			lineSeries: [],
			eventSeries: [],
			gps: [],
			duration: 0,
		});
		return;
	}

	for (const row of msgResult[0].values) {
		const topicName = row[0] as string;
		const msgType = row[1] as string;
		const ts = row[2] as number;
		const raw = row[3] as Uint8Array;

		if (bagStart === null) bagStart = ts;
		bagEnd = ts;
		const relTs = ts - bagStart;

		if (topicName === gpsTopic) {
			const gps = decodeNavSatFix(raw);
			if (gps) gpsPoints.push({ timestamp: relTs, ...gps });
		}

		if (eventSet.has(topicName)) {
			eventMap.get(topicName)!.push(relTs);
		}

		if (numericSet.has(topicName)) {
			if (msgType === "geometry_msgs/msg/Twist") {
				const d = decodeTwist(raw);
				if (d) {
					ensureLine(
						lineMap,
						`${topicName}∥lx`,
						topicName,
						`${topicName} linear.x`,
						topicName,
					);
					ensureLine(
						lineMap,
						`${topicName}∥az`,
						topicName,
						`${topicName} angular.z`,
						topicName,
					);
					lineMap
						.get(`${topicName}∥lx`)!
						.points.push({ timestamp: relTs, value: d.linearX });
					lineMap
						.get(`${topicName}∥az`)!
						.points.push({ timestamp: relTs, value: d.angularZ });
				}
			} else if (msgType === "geometry_msgs/msg/Vector3Stamped") {
				const d = decodeVector3Stamped(raw);
				if (d) {
					ensureLine(
						lineMap,
						`${topicName}∥x`,
						topicName,
						`${topicName} x`,
						topicName,
					);
					ensureLine(
						lineMap,
						`${topicName}∥y`,
						topicName,
						`${topicName} y`,
						topicName,
					);
					ensureLine(
						lineMap,
						`${topicName}∥z`,
						topicName,
						`${topicName} z`,
						topicName,
					);
					lineMap
						.get(`${topicName}∥x`)!
						.points.push({ timestamp: relTs, value: d.x });
					lineMap
						.get(`${topicName}∥y`)!
						.points.push({ timestamp: relTs, value: d.y });
					lineMap
						.get(`${topicName}∥z`)!
						.points.push({ timestamp: relTs, value: d.z });
				}
			} else {
				const value = decodeScalar(raw, msgType);
				if (value !== null) {
					ensureLine(
						lineMap,
						topicName,
						topicName,
						topicName,
						topicName,
					);
					lineMap
						.get(topicName)!
						.points.push({ timestamp: relTs, value });
				}
			}
		}
	}

	const duration = bagStart !== null ? bagEnd - bagStart : 0;
	const lineSeries: PlaygroundLineSeries[] = [...lineMap.values()];
	const eventSeries: PlaygroundEventSeries[] = [...eventMap.entries()].map(
		([topic, timestamps]) => ({ name: topic, topic, timestamps }),
	);
	postPlayground({ lineSeries, eventSeries, gps: gpsPoints, duration });
}

function ensureLine(
	map: Map<
		string,
		{
			topic: string;
			name: string;
			axisKey: string;
			points: TimeSeriesPoint[];
		}
	>,
	key: string,
	topic: string,
	name: string,
	axisKey: string,
): void {
	if (!map.has(key)) map.set(key, { topic, name, axisKey, points: [] });
}

function postPlayground(data: PlaygroundData): void {
	self.postMessage({ type: "playgroundData", ...data });
}

/**
 * Decodes a sensor_msgs/NavSatFix CDR blob.
 */
function decodeNavSatFix(
	raw: Uint8Array,
): { latitude: number; longitude: number; altitude: number | null } | null {
	try {
		const r = new CdrReader(raw);
		r.uint32(); // sec
		r.uint32(); // nanosec
		r.uint8Array(r.uint32()); // frame_id (length includes null terminator)
		r.int8(); // status
		r.uint16(); // service
		return {
			latitude: r.float64(),
			longitude: r.float64(),
			altitude: r.float64(),
		};
	} catch {
		return null;
	}
}

/** SQL single-quote escape */
function esc(s: string): string {
	return s.replace(/'/g, "''");
}

/** Legacy scalar: try float64, fall back to float32. */
function decodeSingleFloat(raw: Uint8Array): number | null {
	try {
		return new CdrReader(raw).float64();
	} catch {
		try {
			return new CdrReader(raw).float32();
		} catch {
			return null;
		}
	}
}

/**
 * Type-aware scalar decoder. CdrReader starts at offset 4 and handles CDR
 * alignment automatically on each read call.
 */
function decodeScalar(raw: Uint8Array, msgType: string): number | null {
	try {
		const r = new CdrReader(raw);
		if (msgType === "std_msgs/msg/Float32") return r.float32();
		if (msgType === "std_msgs/msg/Int32") return r.int32();
		if (msgType === "std_msgs/msg/Int64") return Number(r.int64());
		return r.float64();
	} catch {
		return null;
	}
}

/**
 * geometry_msgs/msg/Twist (unstamped).
 * [linear.x, linear.y, linear.z, angular.x, angular.y, angular.z] × float64.
 * First float64 aligns from offset 4 → skips 4 padding bytes.
 */
function decodeTwist(
	raw: Uint8Array,
): { linearX: number; angularZ: number } | null {
	try {
		const r = new CdrReader(raw);
		const linearX = r.float64();
		r.float64();
		r.float64(); // linear y, z
		r.float64();
		r.float64(); // angular x, y
		return { linearX, angularZ: r.float64() };
	} catch {
		return null;
	}
}

/**
 * geometry_msgs/msg/Vector3Stamped.
 * Header (sec u32, nanosec u32, frame_id string) then Vector3 (x/y/z f64).
 */
function decodeVector3Stamped(
	raw: Uint8Array,
): { x: number; y: number; z: number } | null {
	try {
		const r = new CdrReader(raw);
		r.uint32();
		r.uint32(); // sec, nanosec
		r.uint8Array(r.uint32()); // frame_id
		return { x: r.float64(), y: r.float64(), z: r.float64() };
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Detection — runs MAD and/or RSD off the main thread
// ---------------------------------------------------------------------------
function handleDetect(
	points: TimeSeriesPoint[],
	config: DetectionConfig,
): void {
	const mad =
		config.enabled && config.mad.enabled
			? runMAD(points, config.mad, config)
			: null;
	const rsd =
		config.enabled && config.rsd.enabled
			? runRSD(points, config.rsd, config)
			: null;
	const cusum =
		config.enabled && config.cusum.enabled
			? runCUSUM(points, config.cusum, config)
			: null;
	self.postMessage({ type: "detectionResult", mad, rsd, cusum } as {
		type: "detectionResult";
		mad: DetectionRunResult | null;
		rsd: DetectionRunResult | null;
		cusum: DetectionRunResult | null;
	});
}

// ---------------------------------------------------------------------------
// Worker message types
// ---------------------------------------------------------------------------
type WorkerMessage =
	| { type: "open"; buffer: ArrayBuffer }
	| { type: "topics" }
	| { type: "read"; topicName: string }
	| { type: "readGps"; topicName: string }
	| {
			type: "readAll";
			numericTopics: string[];
			eventTopics: string[];
			gpsTopic: string | null;
	  }
	| {
			type: "detect";
			points: TimeSeriesPoint[];
			detectionConfig: DetectionConfig;
	  };
