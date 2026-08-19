/**
 * Where the coil rake actually comes from.
 *
 * `emi_msgs/EMICoil` has a `static_transform` field and it is tempting to read
 * the geometry off it. **Do not.** On every recorded topic — including
 * `/emi/raw` — that field is a placeholder: the five coils carry the unit basis
 * vectors `(1,0,0) (0,1,0) (-1,0,0) (0,-1,0) (0,0,1)`, which is not a rake and
 * not any part of one. `emi/config/params.yaml` says so in as many words:
 *
 * > TF IS AUTHORITATIVE. The georeference node reads the coil frames from the
 * > TF tree published by the robot bringup; it does not read this file.
 *
 * `EMI.rtk_pose` is zero-filled on the same topics for the same reason, so the
 * robot fix comes from `/teodora/xsens/gnss` rather than from the EMI message.
 *
 * The tree the recordings publish is
 *
 * ```
 * base_link ─┬─ emi_link ─── coil1_link … coil5_link
 *            ├─ xsens_link          (the GNSS antenna — the lever arm)
 *            └─ gps
 * ```
 *
 * so a coil in body frame is `base_link→emi_link` composed with
 * `emi_link→coilN_link`, and the same coil in the antenna frame is that minus
 * `base_link→xsens_link`. That difference is the lever arm, and it is exactly
 * what the georeferencing choice in the parameter rail exposes.
 */

import type { Transform } from "./emi-types";

/** One edge of the transform tree. */
export interface FrameEdge {
	parent: string;
	child: string;
	transform: Transform;
}

/** `tf2_msgs/msg/TFMessage` as decoded. */
export interface TFMessage {
	transforms: Array<{
		header: { frame_id: string };
		child_frame_id: string;
		transform: Transform;
	}>;
}

/** The resolved rake. */
export interface CoilGeometry {
	/** Coil ids in ascending order. */
	coilIds: Uint8Array;
	/** Offsets in body (`base_link`) frame, `[ncoil * 3]` as x,y,z triples. */
	offsets: Float32Array;
	/** GNSS antenna position in body frame, `[x, y]`. */
	leverArm: readonly [number, number];
	/** True when this came from `tf_static` rather than from the fallback. */
	fromTf: boolean;
	/**
	 * How many coil frames the tree actually resolved, when it was consulted.
	 *
	 * A partial resolve is reported rather than accepted: `ncoil` strides every
	 * per-coil column in a run, so a four-coil geometry filled from five-coil
	 * messages misaligns the entire run — and it would do so while claiming the
	 * geometry came from TF.
	 */
	resolvedFromTf: number;
}

/** Number of coils this robot's rake carries. */
export const EXPECTED_COILS = 5;

/**
 * Rake geometry from `emi/config/params.yaml`, used when a source publishes no
 * `tf_static`.
 *
 * The file itself calls these a mirror of the real array rather than the source
 * of truth, so a run built on them is marked `fromTf: false` and the UI says
 * the geometry is assumed.
 */
const FALLBACK_COIL_IDS = Object.freeze([1, 2, 3, 4, 5]);
// base_link→emi_link is (0.8, 0, -0.3); these offsets are composed through it.
const FALLBACK_OFFSETS = Object.freeze([
	0.6, 0.4, -0.3, 0.6, 0.0, -0.3, 0.6, -0.4, -0.3, 1.0, -0.2, -0.3, 1.0, 0.2,
	-0.3,
]);

/**
 * A fresh copy of the fallback geometry.
 *
 * A copy per call, never the same arrays: a run stores `coilIds` and `offsets`
 * by reference, so a shared constant would let one run's geometry be mutated
 * through another's — and would corrupt the fallback itself for the rest of the
 * session.
 *
 * @returns The rake from `emi/config/params.yaml`, marked as not from TF.
 */
export function fallbackGeometry(): CoilGeometry {
	return {
		coilIds: new Uint8Array(FALLBACK_COIL_IDS),
		offsets: new Float32Array(FALLBACK_OFFSETS),
		leverArm: [0.165, 0.15],
		fromTf: false,
		resolvedFromTf: 0,
	};
}

/** Frame name of a coil, as the robot publishes it. */
const COIL_FRAME = /^coil(\d+)_link$/;

/**
 * Collect transform-tree edges from any number of `tf_static` messages.
 *
 * `tf_static` is latched and arrives split across several messages, so a reader
 * that takes only the first one gets a fraction of the tree.
 *
 * @param messages - Decoded `TFMessage`s.
 * @returns One edge per `parent → child` pair, last write winning.
 */
export function collectEdges(messages: TFMessage[]): Map<string, FrameEdge> {
	const edges = new Map<string, FrameEdge>();
	for (const msg of messages) {
		for (const t of msg.transforms ?? []) {
			edges.set(t.child_frame_id, {
				parent: t.header.frame_id,
				child: t.child_frame_id,
				transform: t.transform,
			});
		}
	}
	return edges;
}

/**
 * Translation of a frame relative to an ancestor, walking up the tree.
 *
 * Translation only: every edge in the chain this walks
 * (`base_link→emi_link→coilN_link`) is an identity rotation on this robot, and
 * composing rotations here would imply a generality the caller does not have.
 *
 * @param edges - Edges from {@link collectEdges}.
 * @param frame - Frame to locate.
 * @param root - Ancestor to express it in.
 * @returns `[x, y, z]`, or null when `frame` does not descend from `root`.
 */
export function resolveTranslation(
	edges: Map<string, FrameEdge>,
	frame: string,
	root: string,
): [number, number, number] | null {
	let x = 0;
	let y = 0;
	let z = 0;
	let cur = frame;
	// The tree is a dozen frames deep at most; the bound is a cycle guard.
	for (let hop = 0; hop < 64; hop++) {
		if (cur === root) return [x, y, z];
		const edge = edges.get(cur);
		if (!edge) return null;
		x += edge.transform.translation.x;
		y += edge.transform.translation.y;
		z += edge.transform.translation.z;
		cur = edge.parent;
	}
	return null;
}

/**
 * The whole transform tree, flattened onto the ground plane.
 *
 * The rake is what the *detector* needs; this is what the *reader* needs. A
 * ghost drawn from five coil offsets is five dots and a couple of invented
 * lines, and it does not look like the vehicle — the recording's tree also
 * carries the antenna, the GNSS receiver, the lidar and the camera boom, and it
 * is those that make a rake read as a robot with a front and a back. The offline
 * report draws every edge and every node for exactly that reason, so this keeps
 * the same material available.
 *
 * Two dimensions, because the map is a plan view: `z` is resolved and then
 * dropped rather than ignored, so a frame that only descends from `base_link`
 * through a vertical link still lands in the right place.
 */
export interface FrameTree {
	/** Every frame's position in the body frame, `[x, y]` metres. */
	nodes: Record<string, readonly [number, number]>;
	/** Parent/child pairs, both of which appear in {@link nodes}. */
	edges: Array<readonly [string, string]>;
}

/**
 * Flatten accumulated edges into a drawable tree.
 *
 * @param edges - Edges from {@link collectEdges}, merged across messages.
 * @param root - Frame the tree is expressed in; also its origin node.
 * @returns The tree, or null when nothing descends from `root`.
 */
export function resolveFrameTree(
	edges: Map<string, FrameEdge>,
	root = "base_link",
): FrameTree | null {
	const nodes: Record<string, readonly [number, number]> = {
		[root]: [0, 0],
	};
	for (const child of edges.keys()) {
		const xyz = resolveTranslation(edges, child, root);
		if (xyz) nodes[child] = [xyz[0], xyz[1]];
	}
	// A frame whose chain does not reach `root` is left out, and so is the edge
	// that would have drawn it — a line to a node that was never placed would be
	// drawn from the origin, which is a limb the robot does not have.
	const out: Array<readonly [string, string]> = [];
	for (const [child, edge] of edges) {
		if (nodes[child] && nodes[edge.parent]) out.push([edge.parent, child]);
	}
	return out.length > 0 ? { nodes, edges: out } : null;
}

/**
 * Resolve the coil rake and the antenna lever arm from `tf_static`.
 *
 * A tree that resolves *some* coils is treated as a failure, not as a smaller
 * rake. `ncoil` strides every per-coil column of a run, so accepting four coils
 * and then filling them from five-coil messages misaligns the whole run — and
 * it would do so while telling the UI the geometry was authoritative.
 *
 * @param messages - Every latched `tf_static` message seen so far.
 * @param expectedCoils - How many coil frames a complete tree must yield.
 * @returns The geometry, or the fallback when the tree is absent or partial.
 */
export function resolveCoilGeometry(
	messages: TFMessage[],
	expectedCoils = EXPECTED_COILS,
): CoilGeometry {
	return resolveCoilGeometryFromEdges(collectEdges(messages), expectedCoils);
}

/**
 * Resolve the rake from edges already accumulated.
 *
 * The form a long-lived reader wants: `tf_static` is latched and re-delivered in
 * full on every reconnect, so accumulating *edges* keeps memory bounded by the
 * tree while accumulating *messages* grows without bound and makes each arrival
 * cost a re-walk of every message before it.
 *
 * @param edges - Edges from {@link collectEdges}, merged across messages.
 * @param expectedCoils - How many coil frames a complete tree must yield.
 * @returns The geometry, or the fallback when the tree is absent or partial.
 */
export function resolveCoilGeometryFromEdges(
	edges: Map<string, FrameEdge>,
	expectedCoils = EXPECTED_COILS,
): CoilGeometry {
	const found: Array<{ id: number; xyz: [number, number, number] }> = [];
	for (const child of edges.keys()) {
		const m = COIL_FRAME.exec(child);
		if (!m) continue;
		const xyz = resolveTranslation(edges, child, "base_link");
		if (!xyz) continue;
		found.push({ id: Number(m[1]), xyz });
	}

	if (found.length !== expectedCoils) {
		return { ...fallbackGeometry(), resolvedFromTf: found.length };
	}

	found.sort((a, b) => a.id - b.id);
	const coilIds = new Uint8Array(found.map((f) => f.id));
	const offsets = new Float32Array(found.length * 3);
	found.forEach((f, i) => {
		offsets[i * 3] = f.xyz[0];
		offsets[i * 3 + 1] = f.xyz[1];
		offsets[i * 3 + 2] = f.xyz[2];
	});

	const antenna = resolveTranslation(edges, "xsens_link", "base_link");
	const leverArm: readonly [number, number] = antenna
		? [antenna[0], antenna[1]]
		: fallbackGeometry().leverArm;

	return {
		coilIds,
		offsets,
		leverArm,
		fromTf: true,
		resolvedFromTf: found.length,
	};
}
