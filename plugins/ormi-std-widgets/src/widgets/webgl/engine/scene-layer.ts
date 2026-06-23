/**
 * Layer contract for the imperative 3D scene engine.
 *
 * A {@link SceneLayer} owns one branch of the scene graph (a `THREE.Object3D`)
 * and the typed buffers/textures behind it. The engine drives layers across
 * three disjoint planes so a transform bump never re-uploads data and a data
 * message never re-resolves transforms:
 *
 * - **data plane** — {@link SceneLayer.ingest} writes typed buffers/textures.
 * - **transform plane** — {@link SceneLayer.resolveTransform} writes only
 *   matrices/uniforms.
 * - **render plane** — {@link SceneLayer.flush} performs the partial GPU upload
 *   on demanded frames.
 *
 * Layers hold no React state; the engine calls these methods imperatively.
 */

import type * as THREE from "three";
import type { TransformTable } from "@workspace/ormi-core/types";

/** Kinds of layer the engine can host. */
export type SceneLayerKind =
	| "pointcloud"
	| "path"
	| "mapgrid"
	| "transformTree";

/** How a layer resolved its transform chain (surfaced as a status badge). */
export type LayerTransformStatus = "resolved" | "fallback" | "no-data";

/**
 * One ingest payload routed to a layer: the buffered source shape plus the
 * owning datasource id and the wall-clock the engine stamped on receipt. The
 * `receivedAtMs` replaces each renderer's per-component frame-time ref.
 */
export interface LayerSample {
	/** Buffered messages for the topic (newest last). */
	data: unknown[];
	/** Per-message times, parallel to {@link LayerSample.data}. */
	times: number[];
	/** Raw reference frame id reported by the source. */
	referenceFrameId: string;
	/** Datasource id owning the topic, used to qualify the reference frame. */
	datasourceId?: string;
	/** Engine wall-clock (ms) at ingest time. */
	receivedAtMs: number;
}

/**
 * Which planes a layer operation dirtied. Returned by config changes and tracked
 * by the engine to decide what work each demanded frame must do.
 */
export interface LayerDirty {
	/** Typed buffers/textures need a (partial) GPU upload. */
	data: boolean;
	/** Matrices/uniforms changed; no buffer work. */
	transform: boolean;
	/** Human-rate cosmetic/config change. */
	config: boolean;
}

/**
 * A self-contained branch of the scene graph driven imperatively by the engine.
 */
export interface SceneLayer {
	/** Stable layer id (matches the bridge/config key). */
	readonly id: string;
	/** Layer kind. */
	readonly kind: SceneLayerKind;
	/** Root object mounted under the engine's root group. */
	readonly object3d: THREE.Object3D;
	/** Topic key this layer consumes, or `null` for layers with no data topic. */
	readonly topicKey: string | null;

	/**
	 * Apply human-rate config. Returns the planes that became dirty; only forces
	 * `data: true` when a rebind is required (e.g. rolling buffer / capacity /
	 * colormap), never on a cosmetic or visibility change.
	 */
	setConfig(config: unknown): Partial<LayerDirty>;

	/**
	 * Ingest a data sample into typed buffers/textures. MUST NOT read the
	 * transform table. Returns whether anything was ingested. Re-resolves its own
	 * transform internally only when the reference frame or first-data state
	 * changed.
	 */
	ingest(sample: LayerSample): boolean;

	/**
	 * Resolve the frame chain to `targetFrame` and write matrices/uniforms only.
	 * MUST NOT touch buffers or textures.
	 */
	resolveTransform(
		table: TransformTable,
		targetFrame: string,
	): LayerTransformStatus;

	/** Flush pending typed-buffer writes to the GPU and refresh time uniforms. */
	flush?(nowMs: number): void;

	/** Whether this layer needs the engine's refresh ticker running. */
	needsTick(): boolean;

	/** Toggle visibility without disposing accumulated data. */
	setVisible(visible: boolean): void;

	/** Release GPU resources. */
	dispose(): void;
}
