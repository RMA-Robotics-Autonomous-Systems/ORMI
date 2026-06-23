/**
 * Imperative scene-graph engine for the 3D viewer.
 *
 * The engine owns one `THREE.Group` (`root`), mounted once under the R3F canvas
 * via `<primitive object={engine.root} />`. Layers attach their objects under
 * `root` imperatively and are never React-reconciled. R3F still drives the
 * render loop (`frameloop="demand"`); the engine only mutates scene contents and
 * requests repaints through an injected `invalidate`.
 *
 * Three planes stay disjoint so a transform bump never re-uploads data:
 * - {@link SceneEngine.ingest} routes a sample to the layers consuming its key,
 *   marks them data-dirty, and invalidates.
 * - {@link SceneEngine.applyTransforms} re-resolves every layer's transform
 *   (matrices/uniforms only) and invalidates once.
 * - {@link SceneEngine.onFrame} runs on demanded frames, flushes pending uploads,
 *   and clears dirty flags — it never invalidates.
 *
 * A single ~15 Hz ticker drives time-decay layers; it runs only while a mounted,
 * visible layer reports {@link SceneLayer.needsTick} and stops otherwise.
 */

import * as THREE from "three";
import type { TransformTable } from "@workspace/ormi-core/types";
import type { LayerSample, SceneLayer } from "./scene-layer";
import { SCENE3D } from "./scene-metrics";
import { metrics } from "@workspace/utils";

/** Host capabilities the engine needs from R3F (repaint scheduling). */
export interface SceneEngineHost {
	/** Request a repaint under the demand frameloop. */
	invalidate(): void;
}

/** Refresh-ticker cadence (~15 Hz) for time-decay layers. */
const TICK_INTERVAL_MS = 66;

export class SceneEngine {
	/** Root group mounted once under the canvas; layers attach beneath it. */
	readonly root: THREE.Group;

	private readonly host: SceneEngineHost;

	/** Layers indexed by id. */
	private readonly layersById = new Map<string, SceneLayer>();
	/** Layers indexed by the topic key they consume (for O(1) ingest dispatch). */
	private readonly layersByTopic = new Map<string, SceneLayer[]>();

	/** Layers with un-flushed data, drained each demanded frame. */
	private readonly dirtyData = new Set<SceneLayer>();

	/** Engine clock (ms); written by the ticker and refreshed each frame. */
	private _nowMs = Date.now();

	/** Active refresh-ticker handle, or null when no ticker is running. */
	private tickerHandle: ReturnType<typeof setInterval> | null = null;

	/** Set once {@link dispose} has run; guards idempotency. */
	private disposed = false;

	constructor(host: SceneEngineHost) {
		this.host = host;
		this.root = new THREE.Group();
		this.root.name = "scene-engine-root";
	}

	/** Current engine wall-clock in milliseconds. */
	get nowMs(): number {
		return this._nowMs;
	}

	/**
	 * Register a layer and attach its object under {@link root}. Idempotent: a
	 * layer already registered under the same id is ignored.
	 */
	addLayer(layer: SceneLayer): void {
		if (this.disposed) return;
		if (this.layersById.has(layer.id)) return;

		this.layersById.set(layer.id, layer);
		if (layer.topicKey !== null) {
			const list = this.layersByTopic.get(layer.topicKey);
			if (list) list.push(layer);
			else this.layersByTopic.set(layer.topicKey, [layer]);
		}
		this.root.add(layer.object3d);
		this.refreshTicker();
	}

	/**
	 * Remove and dispose a layer by id. Idempotent: an unknown id is a no-op.
	 */
	removeLayer(id: string): void {
		const layer = this.layersById.get(id);
		if (!layer) return;

		this.layersById.delete(id);
		this.dirtyData.delete(layer);
		if (layer.topicKey !== null) {
			const list = this.layersByTopic.get(layer.topicKey);
			if (list) {
				const index = list.indexOf(layer);
				if (index !== -1) list.splice(index, 1);
				if (list.length === 0)
					this.layersByTopic.delete(layer.topicKey);
			}
		}
		this.root.remove(layer.object3d);
		layer.dispose();
		this.refreshTicker();
	}

	/** Look up a layer by id. */
	getLayer(id: string): SceneLayer | undefined {
		return this.layersById.get(id);
	}

	/** Whether a layer with the given id is registered. */
	hasLayer(id: string): boolean {
		return this.layersById.has(id);
	}

	/**
	 * Route a sample to every layer consuming `topicKey`, mark them data-dirty,
	 * and request a repaint. Allocation-free.
	 */
	ingest(topicKey: string, sample: LayerSample): void {
		const list = this.layersByTopic.get(topicKey);
		if (!list || list.length === 0) return;

		let ingestedAny = false;
		for (let i = 0; i < list.length; i++) {
			const layer = list[i]!;
			if (layer.ingest(sample)) {
				this.dirtyData.add(layer);
				ingestedAny = true;
			}
		}

		if (ingestedAny) {
			metrics.add(SCENE3D.dirtyData);
			this.host.invalidate();
		}
	}

	/**
	 * Re-resolve every layer's transform against `table` (matrices/uniforms only)
	 * and request a single repaint. Never touches buffers. Allocation-free.
	 */
	applyTransforms(table: TransformTable, targetFrame: string): void {
		for (const layer of this.layersById.values()) {
			layer.resolveTransform(table, targetFrame);
		}
		metrics.add(SCENE3D.dirtyTf);
		this.host.invalidate();
	}

	/**
	 * Demanded-frame hook: refresh the engine clock, flush layers with pending
	 * data, and clear dirty flags. Never invalidates — frames are demanded by the
	 * data/transform/config paths and the refresh ticker.
	 */
	onFrame(nowMs: number): void {
		this._nowMs = nowMs;
		metrics.add(SCENE3D.frames);

		if (this.dirtyData.size > 0) {
			for (const layer of this.dirtyData) {
				layer.flush?.(nowMs);
			}
			this.dirtyData.clear();
		}
	}

	/**
	 * Start or stop the ~15 Hz refresh ticker based on whether any registered
	 * layer currently needs ticking. The ticker writes the clock and invalidates,
	 * skipping hidden documents; it fully stops when no layer needs it.
	 */
	refreshTicker(): void {
		if (this.disposed) {
			this.stopTicker();
			return;
		}

		let needsTick = false;
		for (const layer of this.layersById.values()) {
			if (layer.needsTick()) {
				needsTick = true;
				break;
			}
		}

		if (needsTick && this.tickerHandle === null) {
			this.tickerHandle = setInterval(() => {
				if (typeof document !== "undefined" && document.hidden) return;
				this._nowMs = Date.now();
				this.host.invalidate();
			}, TICK_INTERVAL_MS);
		} else if (!needsTick) {
			this.stopTicker();
		}
	}

	/** Stop and clear the refresh ticker if running. */
	private stopTicker(): void {
		if (this.tickerHandle !== null) {
			clearInterval(this.tickerHandle);
			this.tickerHandle = null;
		}
	}

	/**
	 * Tear down the engine: stop the ticker, dispose all layers, and clear the
	 * root group. Idempotent.
	 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		this.stopTicker();
		for (const layer of this.layersById.values()) {
			this.root.remove(layer.object3d);
			layer.dispose();
		}
		this.layersById.clear();
		this.layersByTopic.clear();
		this.dirtyData.clear();
		this.root.clear();
	}
}
