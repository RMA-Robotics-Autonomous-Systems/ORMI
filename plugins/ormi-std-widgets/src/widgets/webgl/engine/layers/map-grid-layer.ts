/**
 * Imperative map / occupancy-grid layer for the 3D scene engine.
 *
 * Owns a `THREE.Mesh` with a `PlaneGeometry`, a `MeshBasicMaterial`, and a
 * `CanvasTexture` backed by a reused canvas / `ImageData`. The three engine
 * planes stay disjoint so a transform bump never re-runs the texture pipeline (a
 * latched grid publishes once; TF publishes 12-60 Hz):
 *
 * - {@link MapGridLayer.ingest} recolors the occupancy bytes through a 256-entry
 *   RGBA LUT into the reused canvas/`ImageData`/`CanvasTexture`, reallocating only
 *   on a dimension change, and refreshes the texture in place via `needsUpdate`.
 * - {@link MapGridLayer.resolveTransform} resolves the frame chain and writes the
 *   grid's full pose (frame-to-target × map origin) into `mesh.matrix` only.
 * - The LUT is rebuilt only on a colormap/opacity/show-unknown config change.
 *
 * The texture upload is driven by `needsUpdate`, so there is no per-frame flush.
 */

import * as THREE from "three";
import type {
	MapGrid,
	Transform,
	TransformTable,
} from "@workspace/ormi-core/types";
import { findTransformChain } from "@workspace/ormi-core/transforms";
import { buildTransformMatrix } from "../transform-resolve";
import {
	buildOccupancyLut,
	recolorOccupancyRotated,
} from "../../utils/occupancy-lut";
import { qualifyFrame } from "../../components/scene-transform-context";
import type {
	LayerDirty,
	LayerSample,
	LayerTransformStatus,
	SceneLayer,
} from "../scene-layer";
import type { MapGridColorMode } from "../../types/scene-3d-types";

/** Pose inputs captured from the latest grid message, consumed by the TF pass. */
interface GridPose {
	refFrame: string;
	origin: MapGrid["origin"];
}

/**
 * Primitive, human-rate configuration for a map-grid layer. The bridge
 * destructures these from the widget config and passes only primitives, so a
 * change is a real dependency rather than an object-identity churn.
 */
export interface MapGridLayerSetConfig {
	colorMode: MapGridColorMode;
	opacity: number;
	showUnknown: boolean;
	/** Stacking index, applied as a small Y offset so layers don't z-fight. */
	layerIndex: number;
	/** Target frame all layers resolve into (the scene's data target frame). */
	targetFrame: string;
	/** Datasource id owning the topic, used to qualify the reference frame. */
	datasourceId?: string;
	/** Optional deduped status sink for the control-panel badge. */
	onStatus?: (status: LayerTransformStatus) => void;
}

export class MapGridLayer implements SceneLayer {
	readonly id: string;
	readonly kind = "mapgrid" as const;
	readonly object3d: THREE.Mesh;
	readonly topicKey: string | null;

	private readonly material: THREE.MeshBasicMaterial;

	// Geometry / pixel buffers, recreated on a dimension change only.
	private geometry: THREE.PlaneGeometry | null = null;
	private texture: THREE.CanvasTexture | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private imageData: ImageData | null = null;
	private dims: { width: number; height: number; resolution: number } | null =
		null;

	// Occupancy LUT, rebuilt on a colormap/opacity/show-unknown config change.
	private lut: Uint8ClampedArray;

	private readonly frameToTarget = new THREE.Matrix4();
	private readonly mapOriginMatrix = new THREE.Matrix4();
	private readonly originPosition = new THREE.Vector3();
	private readonly originQuaternion = new THREE.Quaternion();
	private readonly unitScale = new THREE.Vector3(1, 1, 1);

	// Config state (human-rate), applied by setConfig.
	private colorMode: MapGridColorMode = "costmap";
	private opacity = 0.85;
	private showUnknown = true;
	private layerIndex = 0;
	private targetFrame = "";
	private datasourceId: string | undefined = undefined;
	private onStatus: ((status: LayerTransformStatus) => void) | undefined;
	private lastStatus: LayerTransformStatus | null = null;

	// Latest TF inputs / pose, cached so ingest can re-resolve on first-data / frame change.
	private tableRef: TransformTable | null = null;
	private pose: GridPose | null = null;

	// Message-time of the last recolored grid; dedupes a re-ingest of a latched
	// grid (DataBridge re-ingests every pump). A colormap config change sets
	// `recolorPending` so the next ingest recolors through the new LUT regardless.
	private lastProcessedTime = Number.NaN;
	private recolorPending = false;

	private disposed = false;

	constructor(id: string, topicKey: string) {
		this.id = id;
		this.topicKey = topicKey;

		this.lut = buildOccupancyLut(
			this.colorMode,
			this.opacity,
			this.showUnknown,
		);

		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
		});
		this.material = material;

		const mesh = new THREE.Mesh(undefined, material);
		mesh.matrixAutoUpdate = false;
		this.object3d = mesh;
	}

	/**
	 * Apply human-rate config and rebuild the occupancy LUT when the colormap,
	 * opacity, or unknown visibility changed. Returns `data: true` in that case so
	 * the next ingest recolors through the new LUT; otherwise `config: true` only.
	 */
	setConfig(config: MapGridLayerSetConfig): Partial<LayerDirty> {
		const prevColorMode = this.colorMode;
		const prevOpacity = this.opacity;
		const prevShowUnknown = this.showUnknown;
		const prevLayerIndex = this.layerIndex;

		this.colorMode = config.colorMode ?? "costmap";
		this.opacity = config.opacity ?? 0.85;
		this.showUnknown = config.showUnknown ?? true;
		this.layerIndex = config.layerIndex ?? 0;
		this.targetFrame = config.targetFrame ?? "";
		this.datasourceId = config.datasourceId;
		this.onStatus = config.onStatus;

		// The layer index drives the Y stacking offset baked into the mesh matrix;
		// re-pose immediately when it changes so a reorder doesn't wait for a TF bump.
		if (prevLayerIndex !== this.layerIndex && this.pose && this.tableRef) {
			this.applyGridPose(this.tableRef);
		}

		const lutChanged =
			prevColorMode !== this.colorMode ||
			prevOpacity !== this.opacity ||
			prevShowUnknown !== this.showUnknown;
		if (lutChanged) {
			this.lut = buildOccupancyLut(
				this.colorMode,
				this.opacity,
				this.showUnknown,
			);
			// Force the next ingest to recolor through the new LUT even if the
			// latched grid's message time hasn't advanced.
			this.recolorPending = true;
		}

		return lutChanged ? { config: true, data: true } : { config: true };
	}

	/**
	 * Recolor the latest occupancy grid through the LUT into the reused canvas /
	 * texture, reallocating geometry + pixel buffers only on a dimension change.
	 * Captures the pose inputs and places the new data once. Never reads the
	 * transform table. Returns whether anything was ingested.
	 */
	ingest(sample: LayerSample): boolean {
		const dataArray = sample.data ?? [];
		if (dataArray.length === 0) {
			this.reportStatus("no-data");
			return false;
		}

		const latestIndex = dataArray.length - 1;
		const grid = dataArray[latestIndex] as MapGrid | undefined;
		if (!grid?.data || grid.width === 0 || grid.height === 0) {
			this.reportStatus("no-data");
			return false;
		}

		// Dedupe a re-ingest of the same latched grid (the bridge re-ingests every
		// pump). A colormap config change clears the dedupe via `recolorPending`.
		const timesArray = sample.times ?? [];
		const rawTime = Number.isFinite(timesArray[latestIndex])
			? (timesArray[latestIndex] as number)
			: Number.NaN;
		if (
			!this.recolorPending &&
			Number.isFinite(rawTime) &&
			rawTime === this.lastProcessedTime
		) {
			return false;
		}
		this.recolorPending = false;
		if (Number.isFinite(rawTime)) {
			this.lastProcessedTime = rawTime;
		}

		const { width, height, resolution, data, origin, frameId } = grid;

		// ── 1. Recreate geometry + pixel buffers only when dimensions change ──
		const dims = this.dims;
		const sizeChanged =
			!dims ||
			dims.width !== width ||
			dims.height !== height ||
			dims.resolution !== resolution;

		if (sizeChanged) {
			this.dims = { width, height, resolution };

			this.geometry?.dispose();
			// Create plane in XZ plane. The upstream ROS→Three conversion swaps
			// ROS x↔Three z and ROS y↔Three x, so the grid width spans Three-Z
			// and the grid height spans Three-X (the plane is transposed).
			const geo = new THREE.PlaneGeometry(
				height * resolution,
				width * resolution,
			);
			// Rotate to lay flat in XZ plane.
			geo.rotateX(Math.PI / 2);
			// Move corner (0,0) to world origin: offset by half the plane size.
			geo.translate(
				-(height * resolution) / 2,
				0,
				-(width * resolution) / 2,
			);
			this.geometry = geo;
			this.object3d.geometry = geo;
		}

		// ── 2. Recolor through the LUT into the reused canvas/texture ─────────
		if (sizeChanged || !this.canvas || !this.texture) {
			// The grid is drawn rotated 90° clockwise, so the canvas is
			// height×width.
			const canvas = this.canvas ?? document.createElement("canvas");
			canvas.width = height;
			canvas.height = width;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				console.error("[MapGridLayer] Could not get canvas context");
				return false;
			}
			this.canvas = canvas;
			this.ctx = ctx;
			this.imageData = ctx.createImageData(height, width);

			this.texture?.dispose();
			const tex = new THREE.CanvasTexture(canvas);
			tex.minFilter = THREE.NearestFilter;
			tex.magFilter = THREE.NearestFilter;
			this.texture = tex;

			// Material-level change (null↔texture / new texture instance) is the
			// only case that needs `material.needsUpdate`.
			this.material.map = tex;
			this.material.needsUpdate = true;
		}

		const imageData = this.imageData!;
		recolorOccupancyRotated(imageData.data, data, width, height, this.lut);
		this.ctx!.putImageData(imageData, 0, 0);
		// In-place texture refresh — never dispose-and-recreate per update.
		this.texture!.needsUpdate = true;

		// ── 3. Capture pose inputs and place the new data once ────────────────
		this.pose = {
			refFrame: qualifyFrame(
				this.datasourceId,
				sample.referenceFrameId || frameId,
			),
			origin,
		};
		if (this.tableRef) {
			this.applyGridPose(this.tableRef);
		}

		return true;
	}

	/**
	 * Resolve the frame chain to `targetFrame` and write the grid's full pose into
	 * `mesh.matrix` only. Caches the table so {@link ingest} can re-resolve on a
	 * first-data change. Never touches the texture or material.
	 */
	resolveTransform(
		table: TransformTable,
		targetFrame: string,
	): LayerTransformStatus {
		this.tableRef = table;
		this.targetFrame = targetFrame;

		if (!this.pose) {
			this.reportStatus("no-data");
			return "no-data";
		}

		return this.applyGridPose(table);
	}

	/** Write the resolved frame-to-target × map-origin pose into `mesh.matrix`. */
	private applyGridPose(table: TransformTable): LayerTransformStatus {
		const pose = this.pose!;
		const targetFrame = this.targetFrame;
		const hasTarget = Boolean(targetFrame && targetFrame.trim() !== "");
		const transformChain =
			hasTarget && table.size > 0
				? findTransformChain(table, pose.refFrame, targetFrame)
				: [];
		const status: LayerTransformStatus =
			hasTarget && transformChain === null ? "fallback" : "resolved";

		// Target-frame fallback: if this layer's frame can't reach the target frame
		// (the target doesn't exist in its tree), render it in its own root
		// (identity) instead of hiding it.
		this.frameToTarget.copy(
			buildTransformMatrix((transformChain ?? []) as Transform[]),
		);

		const { origin } = pose;
		const layerYOffset = 0.01 + this.layerIndex * 0.01;
		this.originPosition.set(
			origin.position.x,
			origin.position.y - layerYOffset,
			origin.position.z,
		);
		this.originQuaternion.set(
			origin.orientation.x,
			origin.orientation.y,
			origin.orientation.z,
			origin.orientation.w,
		);
		this.mapOriginMatrix.compose(
			this.originPosition,
			this.originQuaternion,
			this.unitScale,
		);

		const mesh = this.object3d;
		mesh.matrix.copy(this.frameToTarget).multiply(this.mapOriginMatrix);
		mesh.matrixWorldNeedsUpdate = true;

		this.reportStatus(status);
		return status;
	}

	/** The texture uploads via `needsUpdate`, so no refresh ticker is required. */
	needsTick(): boolean {
		return false;
	}

	setVisible(visible: boolean): void {
		this.object3d.visible = visible;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.geometry?.dispose();
		this.material.dispose();
		this.texture?.dispose();
	}

	/** Forward a status to the sink only when it changed since the last report. */
	private reportStatus(status: LayerTransformStatus): void {
		if (this.lastStatus === status) return;
		this.lastStatus = status;
		this.onStatus?.(status);
	}
}

/** Factory for a {@link MapGridLayer} keyed by its bridge id and topic key. */
export function makeMapGridLayer(id: string, topicKey: string): MapGridLayer {
	return new MapGridLayer(id, topicKey);
}
