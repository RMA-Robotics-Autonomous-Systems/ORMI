import type { PointsCloud } from "@workspace/ormi-core/types";
import type { LoadgenGenerator } from "./index";

/**
 * Transport-agnostic generation + decode core for the loadgen datasource.
 *
 * Both transports — the Web Worker (`loadgen.worker.ts`) and the main-thread
 * coalescer provider (`loadgen-main-thread-source.tsx`) — drive their payloads
 * through this ONE module, so a benchmark measured on either transport exercises
 * the same production and decode cost. Nothing here touches worker or DOM
 * globals; every mutable bit of per-topic state is threaded through the
 * {@link GeneratorState} argument, mirroring the discipline of `resolveGenerators`.
 *
 * The split models a real datasource pipeline:
 *
 * - {@link produceRaw} is the cheap "bytes off the socket" step: it emits a JSON
 *   **string** (scalar/object/malformed) or a packed **ArrayBuffer** (pointcloud)
 *   sized by `payloadBytes`, and stamps the production time.
 * - {@link decodeFrame} is the expensive step: `JSON.parse` + materialize, or an
 *   O(points) buffer→PointsCloud transform.
 *
 * The decode step is a representative **proxy** for CDR/JSON decode cost, not a
 * real CDR decoder: absolute milliseconds differ from Foxglove/rosbridge, but the
 * pipeline *behaviour* is faithful — decode cost scales with `payloadBytes`, the
 * coalesce-to-latest and per-topic decode cap apply identically, and shed frames
 * are counted honestly rather than hidden.
 */

/** A produced-but-not-yet-decoded frame: raw "wire" bytes plus its production time. */
export interface RawFrame {
	/** JSON string (scalar/object/malformed) or packed Float32 buffer (pointcloud). */
	bytes: string | ArrayBuffer;
	/** `Date.now()` at production — the latency stamp for the whole pipeline. */
	time: number;
}

interface Vec3 {
	x: number;
	y: number;
	z: number;
}

interface Quat extends Vec3 {
	w: number;
}

/** Odom-like nested message; fields are optional so the malformed generator can omit them. */
interface OdomMessage {
	pose: { position?: Vec3; orientation?: Quat };
	velocity: { linear?: Vec3; angular?: Vec3 };
	pad: string;
}

/** Random-walk odom state shared by the object/malformed generators. */
interface OdomWalk {
	position: Vec3;
	yaw: number;
	velocity: Vec3;
}

/**
 * Per-topic mutable generation state. Created once per subscribed topic via
 * {@link createGeneratorState} and passed to every {@link produceRaw} call so the
 * function itself stays pure.
 */
export type GeneratorState =
	| { type: "scalar"; value: number; pad: string }
	| { type: "object"; walk: OdomWalk; pad: string; publishSeq: number }
	| { type: "malformed"; walk: OdomWalk; pad: string; publishSeq: number }
	| {
			type: "pointcloud";
			numPoints: number;
			base: Float32Array;
			phases: Float32Array;
			colors: Float32Array;
	  };

/** Fresh odom random-walk state at the origin. */
const makeOdomState = (): OdomWalk => ({
	position: { x: 0, y: 0, z: 0 },
	yaw: 0,
	velocity: { x: 0, y: 0, z: 0 },
});

/** Advance the odom random walk by one 33 ms-ish step (mutates in place). */
const walkOdomState = (state: OdomWalk): void => {
	state.velocity.x += (Math.random() - 0.5) * 0.1;
	state.velocity.y += (Math.random() - 0.5) * 0.1;
	state.velocity.z += (Math.random() - 0.5) * 0.02;
	state.position.x += state.velocity.x * 0.033;
	state.position.y += state.velocity.y * 0.033;
	state.position.z += state.velocity.z * 0.033;
	state.yaw += (Math.random() - 0.5) * 0.05;
};

/** Build a fresh odom-like message from a random-walk state. */
const makeOdomMessage = (state: OdomWalk, pad: string): OdomMessage => ({
	pose: {
		position: { ...state.position },
		orientation: {
			x: 0,
			y: 0,
			z: Math.sin(state.yaw / 2),
			w: Math.cos(state.yaw / 2),
		},
	},
	velocity: {
		linear: { ...state.velocity },
		angular: { x: 0, y: 0, z: (Math.random() - 0.5) * 0.2 },
	},
	pad,
});

/** Padding string so a serialized message with the given base JSON hits ~payloadBytes. */
const makePadForBase = (payloadBytes: number, baseJson: string): string =>
	"x".repeat(Math.max(0, payloadBytes - baseJson.length));

/** Padding string sized so the serialized odom message is roughly `payloadBytes`. */
export const makePad = (payloadBytes: number): string =>
	makePadForBase(
		payloadBytes,
		JSON.stringify(makeOdomMessage(makeOdomState(), "")),
	);

/** Point budget for a pointcloud generator (12 bytes/point: 3×f32 pos + 3×f32 color). */
export const pointCountFor = (generator: LoadgenGenerator): number =>
	Math.max(1, Math.floor(generator.payloadBytes / 12));

/**
 * Allocate the per-topic generation state for a generator. Called once when a
 * topic is first subscribed; the returned object is mutated in place by
 * {@link produceRaw} so steady-state production allocates only the frame itself.
 */
export function createGeneratorState(
	generator: LoadgenGenerator,
): GeneratorState {
	switch (generator.type) {
		case "scalar":
			return {
				type: "scalar",
				value: Math.random(),
				pad: makePadForBase(
					generator.payloadBytes,
					JSON.stringify({ v: 0, pad: "" }),
				),
			};
		case "object":
			return {
				type: "object",
				walk: makeOdomState(),
				pad: makePad(generator.payloadBytes),
				publishSeq: 0,
			};
		case "malformed":
			return {
				type: "malformed",
				walk: makeOdomState(),
				pad: makePad(generator.payloadBytes),
				publishSeq: 0,
			};
		case "pointcloud": {
			const numPoints = pointCountFor(generator);
			const base = new Float32Array(numPoints * 3);
			const phases = new Float32Array(numPoints);
			const colors = new Float32Array(numPoints * 3);
			for (let i = 0; i < numPoints; i++) {
				const idx = i * 3;
				base[idx] = (Math.random() - 0.5) * 2;
				base[idx + 1] = (Math.random() - 0.5) * 2;
				base[idx + 2] = (Math.random() - 0.5) * 2;
				phases[i] = Math.random() * Math.PI * 2;
				colors[idx] = Math.random();
				colors[idx + 1] = Math.random();
				colors[idx + 2] = Math.random();
			}
			return { type: "pointcloud", numPoints, base, phases, colors };
		}
	}
}

/**
 * Produce one raw frame — the cheap "bytes off the socket" step. Scalar, object
 * and malformed payloads serialize to a JSON string sized to `payloadBytes`;
 * pointcloud payloads pack animated positions + colors into a single Float32
 * `ArrayBuffer`. `time` is stamped to `Date.now()` at production so it carries
 * the full pipeline latency (coalescer hold + decode + fanout).
 *
 * @param generator - The generator definition (drives shape and size).
 * @param state - The generator's mutable per-topic state (advanced in place).
 * @returns The raw frame to hand to the coalescer / worker publish.
 */
export function produceRaw(
	generator: LoadgenGenerator,
	state: GeneratorState,
): RawFrame {
	const time = Date.now();

	switch (state.type) {
		case "scalar": {
			state.value += Math.random() * 0.1 - 0.05;
			return {
				bytes: JSON.stringify({ v: state.value, pad: state.pad }),
				time,
			};
		}
		case "object": {
			walkOdomState(state.walk);
			return {
				bytes: JSON.stringify(makeOdomMessage(state.walk, state.pad)),
				time,
			};
		}
		case "malformed": {
			walkOdomState(state.walk);
			const message = makeOdomMessage(state.walk, state.pad);
			state.publishSeq++;
			// Every 10th frame drops one field. The payload still parses; the
			// decoded object simply lacks a member — exercises consumers that
			// must tolerate partial messages.
			if (state.publishSeq % 10 === 0) {
				const omissions: ReadonlyArray<() => void> = [
					() => delete message.pose.position,
					() => delete message.pose.orientation,
					() => delete message.velocity.linear,
					() => delete message.velocity.angular,
				];
				omissions[Math.floor(Math.random() * omissions.length)]!();
			}
			return { bytes: JSON.stringify(message), time };
		}
		case "pointcloud": {
			const numPoints = state.numPoints;
			const buffer = new ArrayBuffer(numPoints * 3 * 4 * 2);
			const positions = new Float32Array(buffer, 0, numPoints * 3);
			const colors = new Float32Array(
				buffer,
				numPoints * 3 * 4,
				numPoints * 3,
			);
			const t = time / 1000;
			const amplitude = 0.05;
			for (let i = 0; i < numPoints; i++) {
				const idx = i * 3;
				const phase = state.phases[i]!;
				positions[idx] =
					state.base[idx]! + Math.sin(t + phase) * amplitude;
				positions[idx + 1] =
					state.base[idx + 1]! +
					Math.sin(t + phase * 1.3) * amplitude;
				positions[idx + 2] =
					state.base[idx + 2]! +
					Math.sin(t + phase * 1.7) * amplitude;
			}
			colors.set(state.colors);
			return { bytes: buffer, time };
		}
	}
}

/**
 * Decode one raw frame into the webapp value — the expensive step, a proxy for
 * CDR/JSON decode cost (see the module doc). Scalar/object/malformed run
 * `JSON.parse` and materialize the value (a malformed frame is still valid JSON,
 * just missing a field); pointcloud wraps the packed buffer in Float32 views and
 * runs an O(points) transform loop that materializes a fresh {@link PointsCloud}.
 *
 * @param raw - The frame from {@link produceRaw}.
 * @param generator - The generator definition (selects the decode path).
 * @returns The decoded webapp value published on the datasource's `-published` hook.
 */
export function decodeFrame(
	raw: RawFrame,
	generator: LoadgenGenerator,
): unknown {
	switch (generator.type) {
		case "scalar": {
			const parsed = JSON.parse(raw.bytes as string) as { v: number };
			return parsed.v;
		}
		case "object":
		case "malformed":
			return JSON.parse(raw.bytes as string) as OdomMessage;
		case "pointcloud": {
			const buffer = raw.bytes as ArrayBuffer;
			const numPoints = pointCountFor(generator);
			const posView = new Float32Array(buffer, 0, numPoints * 3);
			const colView = new Float32Array(
				buffer,
				numPoints * 3 * 4,
				numPoints * 3,
			);
			// Materialize into fresh arrays — the O(points) decode work that a
			// real CDR PointCloud2 decode would perform.
			const points = new Float32Array(numPoints * 3);
			const colors = new Float32Array(numPoints * 3);
			for (let i = 0, n = numPoints * 3; i < n; i++) {
				points[i] = posView[i]!;
				colors[i] = colView[i]!;
			}
			return { points, colors } as PointsCloud;
		}
	}
}

/** Advertised webapp topic type for a generator's payload shape. */
export function topicTypeFor(generator: LoadgenGenerator): string {
	switch (generator.type) {
		case "scalar":
			return "number";
		case "pointcloud":
			return "PointsCloud";
		default:
			return "object";
	}
}

/**
 * Resolve a generator topic name (`<topicPrefix>/<index>`) back to its generator
 * definition within a resolved generator list, or `undefined` if it matches none.
 *
 * @param topicName - The fully-qualified topic name.
 * @param generators - The resolved generator list (from `resolveGenerators`).
 */
export function getGeneratorForTopic(
	topicName: string,
	generators: LoadgenGenerator[],
): LoadgenGenerator | undefined {
	for (const generator of generators) {
		const prefix = `${generator.topicPrefix}/`;
		if (!topicName.startsWith(prefix)) continue;
		const index = Number(topicName.slice(prefix.length));
		if (
			Number.isInteger(index) &&
			index >= 0 &&
			index < generator.topicCount
		) {
			return generator;
		}
	}
	return undefined;
}

/**
 * Coalescer mode for a generator's topic. All loadgen payloads are state-like
 * (latest supersedes older), so every topic is lossy-latest for now.
 */
export function losslessFor(_generator: LoadgenGenerator): boolean {
	return false;
}

/** Point-cloud decode-rate cap, matching the Foxglove/rosbridge main-thread paths. */
const POINTCLOUD_DECODE_HZ_CAP = 12;

/**
 * Minimum ms between decodes for a generator's topic (0 = decode at full drain
 * rate). Only pointcloud payloads are capped, so a burst above nominal rate
 * coalesces to LATEST instead of starving the fanout loop.
 */
export function decodeCapMsFor(generator: LoadgenGenerator): number {
	return generator.type === "pointcloud"
		? 1000 / POINTCLOUD_DECODE_HZ_CAP
		: 0;
}

/**
 * True when a burst generator's duty-cycle window is currently open (always true
 * when no burst is configured).
 */
export function burstOpen(burst?: {
	periodMs: number;
	dutyPct: number;
}): boolean {
	return (
		!burst ||
		Date.now() % burst.periodMs < (burst.periodMs * burst.dutyPct) / 100
	);
}
