"use client";
/**
 * Transform Atoms Store
 *
 * Event-driven transform system backed by a flat edge table.
 *
 * Architecture:
 * - `transformTable`: the authoritative, mutable, module-level source of truth — a
 *   `Map<frameId, TransformEdge>`. Updated in place (O(1) per transform), never cloned.
 * - `transformVersionAtom`: a monotonic counter bumped after each change — synchronously on the
 *   first change after a quiet period (leading edge), trailing-coalesced (~60 Hz) for rapid
 *   follow-ups. React hooks and external subscribers react to this rather than to the table
 *   identity.
 *
 * Datasources push transforms via {@link processTFMessage}; widgets read the table via
 * {@link getTransformTable} / `useTransformTable`, or higher-level selectors.
 */

import { atom, createStore } from "jotai";
import {
	CoordinateConvention,
	Transform,
	TransformEdge,
	TransformTable,
} from "../types";
import { namespaceFrame } from "./frame-namespace";

// Create a single shared store instance for transforms
// This ensures processTFMessage() and consumers use the same store
/** Shared Jotai store for transform state. */
export const transformStore = createStore();

// ============================================================================
// Authoritative state
// ============================================================================

/**
 * The authoritative flat transform table. Mutated in place; never reassigned.
 * Key is the (child) frame id.
 */
const transformTable: TransformTable = new Map();

// ============================================================================
// Core Atoms
// ============================================================================

/**
 * Monotonic version counter, bumped after each batch of table mutations.
 * Reactive consumers subscribe to this to know the table changed without the table
 * itself being a (clonable) atom value.
 */
/** Atom holding the monotonic transform-table version. */
export const transformVersionAtom = atom<number>(0);

/**
 * Atom to track which datasources have contributed transforms
 * Useful for debugging and cleanup
 */
/** Atom tracking datasource ids that contributed transforms. */
export const transformSourcesAtom = atom<Set<string>>(new Set<string>());

/**
 * Derived atom that returns the number of frames (edges) in the transform table.
 */
/** Atom computing the number of frames (edges) in the table. */
export const transformFrameCountAtom = atom((get) => {
	get(transformVersionAtom);
	return transformTable.size;
});

// ============================================================================
// Reactivity (leading-edge + trailing-coalesced version bumps)
// ============================================================================

/**
 * Schedules the trailing coalescing callback. Injectable so the async (browser) reactivity
 * path can be driven deterministically in tests.
 */
export interface FrameScheduler {
	/** Schedule `cb`; returns a handle, or `null` if it ran synchronously. */
	schedule: (cb: () => void) => number | null;
	/** Cancel a previously-returned handle. */
	cancel: (handle: number) => void;
}

/** ~60 Hz coalescing window (ms) between version bumps. */
const COALESCE_MS = 16;
/** A pending trailing bump older than this is considered stuck and is force-committed. */
const PENDING_STUCK_MS = 100;

/** Default trailing scheduler: `setTimeout` in the browser, synchronous otherwise. */
const defaultScheduler: FrameScheduler = {
	schedule: (cb) => {
		if (typeof window !== "undefined") {
			return setTimeout(cb, COALESCE_MS) as unknown as number;
		}
		cb(); // synchronous fallback (SSR / Node / bun test)
		return null;
	},
	cancel: (handle) => {
		clearTimeout(handle);
	},
};

let frameScheduler: FrameScheduler = defaultScheduler;
let pendingHandle: number | null = null;
/** Monotonic timestamp of when the pending trailing bump was scheduled. */
let pendingSince = 0;
/** Monotonic timestamp of the last committed version bump. */
let lastBumpAt = Number.NEGATIVE_INFINITY;

/**
 * Override the trailing-bump scheduler (test hook). Pass `null` to restore the default. Lets
 * tests drive the trailing path deterministically.
 */
export function __setFrameScheduler(scheduler: FrameScheduler | null): void {
	frameScheduler = scheduler ?? defaultScheduler;
	pendingHandle = null;
	pendingSince = 0;
	lastBumpAt = Number.NEGATIVE_INFINITY;
}

function commitVersionBump(): void {
	pendingHandle = null;
	lastBumpAt = monotonicNow();
	transformStore.set(transformVersionAtom, (v) => v + 1);
}

/** Bump the version immediately, cancelling any pending coalesced bump. */
function bumpVersionNow(): void {
	if (pendingHandle !== null) {
		frameScheduler.cancel(pendingHandle);
		pendingHandle = null;
	}
	lastBumpAt = monotonicNow();
	transformStore.set(transformVersionAtom, (v) => v + 1);
}

/**
 * Request a version bump.
 *
 * **Leading edge is synchronous**: the first change after a quiet period commits immediately —
 * no timer is involved, so no dropped/starved callback can ever strand consumers on a stale
 * snapshot. Only rapid follow-up changes (within {@link COALESCE_MS}) defer to a single trailing
 * bump, capping notifications at ~60 Hz under a high-rate TF stream.
 *
 * This deliberately replaces a pure-deferred (rAF/setTimeout-only) design: there, every
 * notification hung on one one-shot callback, and a single lost callback permanently froze the
 * version — consumers cache on the version, so the whole TF UI stuck on stale data (observed in
 * production with a stationary robot: the post-freeze messages were all epsilon-equal, so no
 * retry ever fired). See also {@link healStuckPending}.
 */
function requestVersionBump(now: number): void {
	if (pendingHandle !== null) return; // trailing bump already queued
	if (now - lastBumpAt >= COALESCE_MS) {
		lastBumpAt = now;
		transformStore.set(transformVersionAtom, (v) => v + 1);
		return;
	}
	pendingSince = now;
	pendingHandle = frameScheduler.schedule(commitVersionBump);
}

/**
 * Watchdog: force-commit a trailing bump that has overstayed {@link PENDING_STUCK_MS}.
 * Called on every incoming TF message (whether or not it changes the table), so under any
 * live TF traffic a stuck trailing timer costs at most ~100 ms — never a permanent freeze.
 */
function healStuckPending(now: number): void {
	if (pendingHandle === null || now - pendingSince <= PENDING_STUCK_MS)
		return;
	// eslint-disable-next-line no-console
	console.warn(
		"[transforms] trailing version bump overstayed; force-committing (stuck scheduler?)",
	);
	frameScheduler.cancel(pendingHandle);
	pendingHandle = null;
	lastBumpAt = now;
	transformStore.set(transformVersionAtom, (v) => v + 1);
}

/** Monotonic millisecond clock, immune to wall-clock jumps where available. */
function monotonicNow(): number {
	return typeof performance !== "undefined" && performance.now
		? performance.now()
		: Date.now();
}

// ============================================================================
// Store Access (for use outside React components)
// ============================================================================

/**
 * Get the live transform table (outside React). Treat as read-only.
 * @returns The authoritative transform edge table.
 */
export function getTransformTable(): TransformTable {
	return transformTable;
}

/** Stable empty table — the SSR snapshot and the pre-first-change client snapshot. */
const EMPTY_TABLE: TransformTable = new Map();
let snapshotVersion = -1;
let snapshotTable: TransformTable = EMPTY_TABLE;

/**
 * Version-keyed immutable snapshot of the table for React consumption.
 *
 * Returns the **same** `Map` instance while the version is unchanged and a **fresh copy** after
 * each version bump — exactly the identity contract `useSyncExternalStore` needs, and what lets
 * derived `useMemo`s key on the table value itself. Hooks must depend on this snapshot (a real
 * reactive value), never on a `void version` side-channel: the React Compiler infers memo
 * dependencies from the callback body, strips no-op version reads, and would freeze the memo on
 * its first result (observed in production — widgets stuck on the static-only table forever).
 *
 * @returns The current table snapshot (read-only).
 */
export function getTransformTableSnapshot(): TransformTable {
	const version = transformStore.get(transformVersionAtom);
	if (version !== snapshotVersion) {
		snapshotVersion = version;
		snapshotTable = new Map(transformTable);
	}
	return snapshotTable;
}

/**
 * Server-side snapshot (SSR): always the stable empty table.
 * @returns The shared empty table instance.
 */
export function getServerTransformTableSnapshot(): TransformTable {
	return EMPTY_TABLE;
}

/**
 * Subscribe to transform changes (outside React).
 * @param callback - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribeToTransforms(callback: () => void): () => void {
	return transformStore.sub(transformVersionAtom, callback);
}

// ============================================================================
// Transform Tree Helpers
// ============================================================================

/**
 * Compare two transforms to see if they're effectively equal
 */
function transformsEqual(a: Transform, b: Transform): boolean {
	const EPSILON = 0.0001;
	return (
		Math.abs(a.position.x - b.position.x) < EPSILON &&
		Math.abs(a.position.y - b.position.y) < EPSILON &&
		Math.abs(a.position.z - b.position.z) < EPSILON &&
		Math.abs(a.rotation.x - b.rotation.x) < EPSILON &&
		Math.abs(a.rotation.y - b.rotation.y) < EPSILON &&
		Math.abs(a.rotation.z - b.rotation.z) < EPSILON &&
		Math.abs(a.rotation.w - b.rotation.w) < EPSILON
	);
}

/**
 * Detect whether adding edge `childId -> parentId` would create a cycle, by walking
 * the existing parent chain upward from `parentId`. O(depth).
 */
function wouldCreateCycle(childId: string, parentId: string): boolean {
	let cursor = parentId;
	let steps = 0;
	const limit = transformTable.size + 1;
	while (cursor !== "" && steps <= limit) {
		if (cursor === childId) return true;
		const edge = transformTable.get(cursor);
		if (!edge) return false; // reached a virtual/unknown root — no cycle
		cursor = edge.parentId;
		steps++;
	}
	return false;
}

// ============================================================================
// Transform Update Functions
// ============================================================================

/** Single transform entry in a TF message. */
export interface TFTransform {
	header: {
		frame_id: string;
		/** ROS time. ROS2 uses `nanosec`; `nsec` is accepted for ROS1-style sources. */
		stamp?: { sec: number; nanosec?: number; nsec?: number };
	};
	child_frame_id: string;
	transform: {
		translation: { x: number; y: number; z: number };
		rotation: { x: number; y: number; z: number; w: number };
		convention?: CoordinateConvention;
	};
}

/** TF message payload containing one or more transforms. */
export interface TFMessage {
	transforms: TFTransform[];
}

/** Options for {@link processTFMessage}. */
export interface ProcessTFOptions {
	/** Whether these transforms came from a latched static topic (e.g. `/tf_static`). */
	isStatic?: boolean;
}

/**
 * Process a TF message and update the transform table.
 * This is the main entry point for datasources to push transforms.
 *
 * Updates are O(1) per transform: each edge is upserted by child frame id, so re-parenting
 * (a changed `header.frame_id`) just works, and repeated static delivery is idempotent.
 *
 * @param datasourceId - Unique ID of the datasource (also tags each edge).
 * @param message - TF message containing transforms.
 * @param options - Optional flags (e.g. `isStatic`).
 */
export function processTFMessage(
	datasourceId: string,
	message: TFMessage,
	options?: ProcessTFOptions,
): void {
	if (!message?.transforms || !Array.isArray(message.transforms)) {
		return;
	}

	// Always track datasource, even if no changes are made
	const sources = transformStore.get(transformSourcesAtom);
	if (!sources.has(datasourceId)) {
		const newSources = new Set(sources);
		newSources.add(datasourceId);
		transformStore.set(transformSourcesAtom, newSources);
	}

	const isStatic = options?.isStatic ?? false;
	const now = monotonicNow();
	let changed = false;

	// Self-healing: any TF traffic flushes a trailing bump that a broken/parked timer dropped.
	healStuckPending(now);

	for (const tf of message.transforms) {
		// Validate transform data to prevent crashes on malformed messages
		if (!tf?.child_frame_id || !tf?.header?.frame_id) {
			continue; // Skip malformed transform
		}
		if (!tf?.transform?.translation || !tf?.transform?.rotation) {
			continue; // Skip transform without translation/rotation data
		}

		const rawChildId = tf.child_frame_id;
		const rawParentId = tf.header.frame_id;
		// Namespace keys by source so two datasources with identical bare frame names stay in
		// independent trees. Raw names are kept on the edge for display / legacy resolution.
		const childId = namespaceFrame(datasourceId, rawChildId);
		const parentId = namespaceFrame(datasourceId, rawParentId);

		// Reject self-loops and cycles before mutating the table.
		if (childId === parentId || wouldCreateCycle(childId, parentId)) {
			continue;
		}

		const convention = tf.transform.convention ?? "THREE";
		const transform: Transform = {
			position: {
				x: tf.transform.translation.x ?? 0,
				y: tf.transform.translation.y ?? 0,
				z: tf.transform.translation.z ?? 0,
				w: 1,
			},
			rotation: {
				x: tf.transform.rotation.x ?? 0,
				y: tf.transform.rotation.y ?? 0,
				z: tf.transform.rotation.z ?? 0,
				w: tf.transform.rotation.w ?? 1,
			},
			convention,
		};
		const stamp = tf.header.stamp
			? tf.header.stamp.sec +
				(tf.header.stamp.nanosec ?? tf.header.stamp.nsec ?? 0) * 1e-9
			: undefined;

		const prev = transformTable.get(childId);
		// A material change is a new edge, a re-parent, or a pose change beyond epsilon.
		if (
			!prev ||
			prev.parentId !== parentId ||
			!transformsEqual(prev.transform, transform)
		) {
			changed = true;
		}

		const edge: TransformEdge = {
			frameId: childId,
			rawFrameId: rawChildId,
			parentId,
			source: datasourceId,
			transform,
			stamp,
			receivedAt: now,
			isStatic,
			parentObserved: transformTable.has(parentId),
		};
		// Always upsert so receivedAt/stamp stay fresh even when the pose is unchanged
		// (a still-broadcasting frame must not be treated as stale).
		transformTable.set(childId, edge);
	}

	if (changed) {
		requestVersionBump(now);
	}
}

/**
 * Clear transforms contributed by a datasource.
 *
 * By default only **dynamic** edges are dropped; static edges (from latched topics like
 * `/tf_static`) are retained so a transform-widget remount doesn't lose its static frames
 * and leave dynamic edges referencing missing parents. Pass `{ includeStatic: true }` for a
 * full disconnect.
 *
 * @param datasourceId - Datasource id.
 * @param options - `includeStatic` drops static edges too.
 */
export function clearTransformsFromDatasource(
	datasourceId: string,
	options?: { includeStatic?: boolean },
): void {
	const includeStatic = options?.includeStatic ?? false;

	let removed = false;
	for (const [key, edge] of transformTable) {
		if (edge.source === datasourceId && (includeStatic || !edge.isStatic)) {
			transformTable.delete(key);
			removed = true;
		}
	}

	const sources = transformStore.get(transformSourcesAtom);
	if (sources.has(datasourceId)) {
		// Drop the source tag only once it owns no remaining edges.
		let stillOwnsEdges = false;
		for (const edge of transformTable.values()) {
			if (edge.source === datasourceId) {
				stillOwnsEdges = true;
				break;
			}
		}
		if (!stillOwnsEdges) {
			const newSources = new Set(sources);
			newSources.delete(datasourceId);
			transformStore.set(transformSourcesAtom, newSources);
		}
	}

	if (removed) {
		bumpVersionNow();
	}
}

/**
 * Reconcile the table against the datasources currently configured in the dashboard.
 *
 * Any transform source **not** in `liveSourceIds` is fully cleared (including static edges) —
 * a datasource that left the dashboard (dashboard switch, deletion) takes its frames with it,
 * instead of leaking or colliding with a later datasource that reuses the same frame names. A
 * transiently disconnected datasource that is still configured keeps its frames (its id is still
 * in `liveSourceIds`), so staleness — not removal — handles a dropped connection.
 *
 * This is the **single, automatic** TF-disposal path: datasource plugins no longer clear their
 * own transforms on unmount (which couldn't tell a genuine removal from a transient remount).
 * The core datasource provider drives this from the live datasource set.
 *
 * @param liveSourceIds - Datasource ids currently configured in the dashboard.
 */
export function reconcileTransformSources(liveSourceIds: Set<string>): void {
	// `transformSourcesAtom` is replaced (not mutated) by clearTransformsFromDatasource, so
	// iterating this snapshot is safe.
	const sources = transformStore.get(transformSourcesAtom);
	for (const sourceId of sources) {
		if (!liveSourceIds.has(sourceId)) {
			clearTransformsFromDatasource(sourceId, { includeStatic: true });
		}
	}
}

/**
 * Completely clear all transforms
 */
/** Clear all transforms and sources. */
export function clearAllTransforms(): void {
	transformTable.clear();
	transformStore.set(transformSourcesAtom, new Set());
	bumpVersionNow();
}
