/**
 * Imperative path layer for the 3D scene engine.
 *
 * Owns a `Line2` with a `LineGeometry` and a `LineMaterial`, plus a grow-only
 * positions scratch buffer reused across updates. The three engine planes stay
 * disjoint so a transform bump never re-uploads geometry:
 *
 * - {@link PathLayer.ingest} converts the latest path's poses into the scratch
 *   buffer and uploads them via `LineGeometry.setPositions`.
 * - {@link PathLayer.resolveTransform} resolves the frame chain and writes only
 *   `line.matrix`, never touching geometry buffers.
 *
 * `frustumCulled` is disabled, so no CPU bounding-sphere pass is needed:
 * `setPositions` already computes the bounding volumes internally on upload.
 */

import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type {
	CoordinateConvention,
	Path,
	Transform,
	TransformTable,
} from "@workspace/ormi-core/types";
import {
	convertPosition,
	findTransformChain,
} from "@workspace/ormi-core/transforms";
import { buildTransformMatrix } from "../transform-resolve";
import { qualifyFrame } from "../../components/scene-transform-context";
import type {
	LayerDirty,
	LayerSample,
	LayerTransformStatus,
	SceneLayer,
} from "../scene-layer";

const MAX_PATH_POINTS = 200000;

/**
 * Primitive, human-rate configuration for a path layer. The bridge destructures
 * these from the widget config and passes only primitives, so a change is a real
 * dependency rather than an object-identity churn.
 */
export interface PathLayerSetConfig {
	lineColor: string;
	lineWidth: number;
	lineOpacity: number;
	/** Target frame all layers resolve into (the scene's data target frame). */
	targetFrame: string;
	/** Datasource id owning the topic, used to qualify the reference frame. */
	datasourceId?: string;
	/** Optional deduped status sink for the control-panel badge. */
	onStatus?: (status: LayerTransformStatus) => void;
}

/**
 * three.js latches an instanced geometry's draw cap (`_maxInstanceCount`) on its
 * first render and never grows it afterwards. The `LineGeometry` is created once
 * and reused across path updates, and its first render is the cleared/short line —
 * so without clearing the cap the path stays permanently truncated to those
 * initial few segments. Resetting it lets the full current path redraw.
 */
function resetInstanceCap(geometry: LineGeometry): void {
	(geometry as unknown as { _maxInstanceCount?: number })._maxInstanceCount =
		undefined;
}

export class PathLayer implements SceneLayer {
	readonly id: string;
	readonly kind = "path" as const;
	readonly object3d: Line2;
	readonly topicKey: string | null;

	private readonly geometry: LineGeometry;
	private readonly material: LineMaterial;

	/** Grow-only positions scratch buffer, reused across updates. */
	private positions: Float32Array | null = null;

	private readonly transformMatrix = new THREE.Matrix4();

	// Config state (human-rate), applied by setConfig.
	private lineColor = "#3b82f6";
	private lineWidth = 0.02;
	private lineOpacity = 1;
	private targetFrame = "";
	private datasourceId: string | undefined = undefined;
	private onStatus: ((status: LayerTransformStatus) => void) | undefined;
	private lastStatus: LayerTransformStatus | null = null;

	// Latest TF inputs / reference frame, cached so ingest can re-pose on data change.
	private tableRef: TransformTable | null = null;
	private refFrame: string | null = null;

	// Message-time of the last uploaded path; dedupes a re-ingest of a latched
	// path (DataBridge re-ingests every pump) so a one-shot path doesn't re-upload.
	private lastProcessedTime = Number.NaN;

	private disposed = false;

	constructor(id: string, topicKey: string) {
		this.id = id;
		this.topicKey = topicKey;

		this.geometry = new LineGeometry();
		this.material = new LineMaterial({
			color: new THREE.Color(this.lineColor),
			linewidth: this.lineWidth,
			transparent: this.lineOpacity < 1,
			opacity: this.lineOpacity,
		});

		const line = new Line2(this.geometry, this.material);
		line.frustumCulled = false;
		line.matrixAutoUpdate = false;
		this.object3d = line;
	}

	/**
	 * Apply human-rate config to the line material (color / width / opacity).
	 * Cosmetic-only: returns `config: true` and never forces a data rebind.
	 */
	setConfig(config: PathLayerSetConfig): Partial<LayerDirty> {
		this.lineColor = config.lineColor ?? "#3b82f6";
		this.lineWidth = config.lineWidth ?? 0.02;
		this.lineOpacity = config.lineOpacity ?? 1;
		this.targetFrame = config.targetFrame ?? "";
		this.datasourceId = config.datasourceId;
		this.onStatus = config.onStatus;

		const mat = this.material;
		mat.color.set(this.lineColor);
		mat.linewidth = this.lineWidth;
		mat.opacity = this.lineOpacity;
		mat.transparent = this.lineOpacity < 1;
		(mat as unknown as { linecap?: string; linejoin?: string }).linecap =
			"round";
		(mat as unknown as { linecap?: string; linejoin?: string }).linejoin =
			"round";
		mat.needsUpdate = true;

		return { config: true };
	}

	/**
	 * Set the canvas pixel size on the line material's `resolution` uniform, which
	 * `LineMaterial` needs to size world-space line widths. Driven by the bridge
	 * from `useThree().size`; this is the one viewport coupling a layer needs.
	 */
	setViewportSize(width: number, height: number): void {
		this.material.resolution.set(width, height);
	}

	/**
	 * Convert the latest path's poses into the scratch buffer and upload them.
	 * Captures the reference frame and poses the line once with the cached table.
	 * Never reads the transform table directly. Returns whether anything was
	 * ingested.
	 */
	ingest(sample: LayerSample): boolean {
		const dataArray = sample.data ?? [];

		if (dataArray.length === 0) {
			const cleared = this.clearLine();
			this.reportStatus("no-data");
			return cleared;
		}

		const latestIndex = dataArray.length - 1;
		const pathData = dataArray[latestIndex] as Path | undefined;
		if (!pathData?.poses || pathData.poses.length === 0) {
			const cleared = this.clearLine();
			this.reportStatus("no-data");
			return cleared;
		}

		const sourceConvention: CoordinateConvention =
			pathData.convention || "THREE";
		const poses = pathData.poses;
		const totalPoseCount = poses.length;
		const usedPoseCount = Math.min(totalPoseCount, MAX_PATH_POINTS);
		if (usedPoseCount < 2) {
			const cleared = this.clearLine();
			this.reportStatus("no-data");
			return cleared;
		}

		// Dedupe a re-ingest of the same latched path (the bridge re-ingests every
		// pump). A new message time forces a re-upload.
		const timesArray = sample.times ?? [];
		const rawTime = Number.isFinite(timesArray[latestIndex])
			? (timesArray[latestIndex] as number)
			: Number.NaN;
		if (Number.isFinite(rawTime) && rawTime === this.lastProcessedTime) {
			return false;
		}
		if (Number.isFinite(rawTime)) {
			this.lastProcessedTime = rawTime;
		}

		const startIndex = Math.max(0, totalPoseCount - usedPoseCount);

		// Grow-only scratch buffer, reused across updates.
		let positions = this.positions;
		const needed = usedPoseCount * 3;
		if (!positions || positions.length < needed) {
			positions = new Float32Array(needed);
			this.positions = positions;
		}

		if (sourceConvention === "THREE") {
			// Already in the render convention — copy coordinates directly instead
			// of allocating a converted position object per pose.
			for (let i = 0; i < usedPoseCount; i++) {
				const position = poses[startIndex + i]!.position;
				const idx = i * 3;
				positions[idx] = position.x;
				positions[idx + 1] = position.y;
				positions[idx + 2] = position.z;
			}
		} else {
			for (let i = 0; i < usedPoseCount; i++) {
				const idx = i * 3;
				const convertedPosition = convertPosition(
					poses[startIndex + i]!.position,
					sourceConvention,
					"THREE",
				);
				positions[idx] = convertedPosition.x;
				positions[idx + 1] = convertedPosition.y;
				positions[idx + 2] = convertedPosition.z;
			}
		}

		this.geometry.setPositions(positions.subarray(0, needed));
		// The point count changes every update; clear the latched instance cap so
		// the full current path renders instead of being truncated to the initial
		// segments.
		resetInstanceCap(this.geometry);
		this.geometry.setDrawRange(0, usedPoseCount);

		// Place the new data once with the latest table; subsequent transform bumps
		// are handled matrix-only by resolveTransform.
		this.refFrame = qualifyFrame(
			this.datasourceId,
			sample.referenceFrameId,
		);
		if (this.tableRef) {
			this.applyLinePose(this.tableRef);
		}

		return true;
	}

	/**
	 * Resolve the frame chain to `targetFrame` and write only `line.matrix`.
	 * Caches the table so {@link ingest} can re-pose on a data change. Never
	 * touches geometry buffers.
	 */
	resolveTransform(
		table: TransformTable,
		targetFrame: string,
	): LayerTransformStatus {
		this.tableRef = table;
		this.targetFrame = targetFrame;

		if (this.refFrame === null) {
			this.reportStatus("no-data");
			return "no-data";
		}

		return this.applyLinePose(table);
	}

	/** Write the resolved frame-to-target matrix into `line.matrix`. */
	private applyLinePose(table: TransformTable): LayerTransformStatus {
		const refFrame = this.refFrame!;
		const targetFrame = this.targetFrame;
		const hasTarget = Boolean(targetFrame && targetFrame.trim() !== "");
		const transformChain =
			hasTarget && table.size > 0
				? findTransformChain(table, refFrame, targetFrame)
				: [];
		// `null` chain = target unreachable → identity fallback (renders in own root).
		const status: LayerTransformStatus =
			hasTarget && transformChain === null ? "fallback" : "resolved";

		this.transformMatrix.copy(
			buildTransformMatrix(
				(transformChain ?? []) as Transform[],
				"THREE",
			),
		);
		const line = this.object3d;
		line.matrix.copy(this.transformMatrix);
		line.matrixWorldNeedsUpdate = true;

		this.reportStatus(status);
		return status;
	}

	/**
	 * Reset the geometry to an empty line and forget the reference frame. Returns
	 * whether the line actually held data before (so a persistently empty topic
	 * doesn't re-invalidate every pump).
	 */
	private clearLine(): boolean {
		if (this.refFrame === null && this.positions === null) return false;
		this.geometry.setPositions([0, 0, 0, 0, 0, 0]);
		this.geometry.setDrawRange(0, 0);
		this.positions = null;
		this.refFrame = null;
		this.lastProcessedTime = Number.NaN;
		return true;
	}

	needsTick(): boolean {
		return false;
	}

	setVisible(visible: boolean): void {
		this.object3d.visible = visible;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
		this.positions = null;
	}

	/** Forward a status to the sink only when it changed since the last report. */
	private reportStatus(status: LayerTransformStatus): void {
		if (this.lastStatus === status) return;
		this.lastStatus = status;
		this.onStatus?.(status);
	}
}

/** Factory for a {@link PathLayer} keyed by its bridge id and topic key. */
export function makePathLayer(id: string, topicKey: string): PathLayer {
	return new PathLayer(id, topicKey);
}
