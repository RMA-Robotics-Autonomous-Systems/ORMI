import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
	Path,
	CoordinateConvention,
	TransformTable,
} from "@workspace/ormi-core/types";
import {
	findTransformChain,
	convertPosition,
} from "@workspace/ormi-core/transforms";
import {
	useSceneTransforms,
	useTransformStatusReporter,
	qualifyFrame,
} from "./scene-transform-context";
import type { LayerTransformStatus } from "../types/scene-3d-types";
import { buildTransformMatrix } from "../engine/transform-resolve";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useThree } from "@react-three/fiber";

const MAX_PATH_POINTS = 200000;

type PathSource = {
	data: unknown[];
	times: number[];
	referenceFrameId: string;
};

interface PathLineRendererProps extends Record<string, unknown> {
	source?: PathSource;
	/** Datasource id of this layer's topic, used to qualify the reference frame. */
	datasourceId?: string;
	targetFrame?: string;
	lineWidth?: number;
	lineOpacity?: number;
	lineColor: string;
	/** Reports how the layer resolved its transform (for the scene status overlay). */
	onTransformStatus?: (status: LayerTransformStatus) => void;
}

/**
 * three.js latches an instanced geometry's draw cap (`_maxInstanceCount`) on its
 * first render and never grows it afterwards. This `LineGeometry` is created once
 * and reused across path updates, and its first render is the cleared/short line —
 * so without clearing the cap the path stays permanently truncated to those initial
 * few segments. Resetting it lets the renderer redraw the full current path.
 */
function resetInstanceCap(geometry: LineGeometry): void {
	(geometry as unknown as { _maxInstanceCount?: number })._maxInstanceCount =
		undefined;
}

/**
 * Resolve the frame chain and write it into the line's matrix. Matrix-only:
 * never touches geometry buffers, so it is safe to run at transform rate.
 */
function applyLinePose(
	line: Line2,
	table: TransformTable,
	refFrame: string,
	targetFrame: string | undefined,
	reportStatus: (status: LayerTransformStatus) => void,
): void {
	const hasTarget = Boolean(targetFrame && targetFrame.trim() !== "");
	const transformChain =
		hasTarget && table.size > 0
			? findTransformChain(table, refFrame, targetFrame!)
			: [];
	// `null` chain = target unreachable → identity fallback (renders in own root frame).
	reportStatus(
		hasTarget && transformChain === null ? "fallback" : "resolved",
	);

	const transformMatrix = buildTransformMatrix(transformChain ?? [], "THREE");
	line.matrixAutoUpdate = false;
	line.matrix.copy(transformMatrix);
	line.matrixWorldNeedsUpdate = true;
}

export const PathLineRenderer = ({
	source,
	datasourceId,
	targetFrame,
	lineWidth = 0.02,
	lineOpacity = 1,
	lineColor,
	onTransformStatus,
}: PathLineRendererProps) => {
	const lineRef = useRef<Line2>(null);
	const linePositionsRef = useRef<Float32Array | null>(null);
	const { table } = useSceneTransforms();
	const reportStatus = useTransformStatusReporter(onTransformStatus);
	const { size, invalidate } = useThree();

	// Reference frame of the current path data, consumed by the TF effect.
	const refFrameRef = useRef<string | null>(null);
	// Latest table for the data effect's one-shot pose apply, without making
	// the data effect depend on (and re-run at) the TF table. Kept fresh by
	// the TF effect, which is declared first so it runs before the data
	// effect on any commit where both change.
	const tableRef = useRef(table);

	// ── TF effect: matrix-only update per transform bump ─────────────────────
	useEffect(() => {
		tableRef.current = table;
		const line = lineRef.current;
		const refFrame = refFrameRef.current;
		if (!line || refFrame === null) return;
		applyLinePose(line, table, refFrame, targetFrame, reportStatus);
		invalidate();
	}, [table, targetFrame, invalidate, reportStatus]);

	const geometry = useMemo(() => new LineGeometry(), []);
	const material = useMemo(
		() =>
			new LineMaterial({
				color: new THREE.Color(lineColor),
				linewidth: lineWidth,
				transparent: lineOpacity < 1,
				opacity: lineOpacity,
			}),
		[lineColor, lineWidth, lineOpacity],
	);

	useEffect(() => {
		material.color.set(lineColor);
		material.linewidth = lineWidth;
		material.opacity = lineOpacity;
		material.transparent = lineOpacity < 1;
		(
			material as unknown as { linecap?: string; linejoin?: string }
		).linecap = "round";
		(
			material as unknown as { linecap?: string; linejoin?: string }
		).linejoin = "round";
		material.needsUpdate = true;
	}, [material, lineColor, lineWidth, lineOpacity]);

	useEffect(() => {
		material.resolution.set(size.width, size.height);
	}, [material, size.width, size.height]);

	useEffect(() => {
		if (lineRef.current) {
			lineRef.current.frustumCulled = false;
		}
		return () => {
			geometry.dispose();
			material.dispose();
			linePositionsRef.current = null;
		};
	}, [geometry, material]);

	// ── Data effect: pose conversion + GPU upload, runs per path message ─────
	// No explicit bounding-sphere pass: the line renders with
	// `frustumCulled = false` (set above) so the sphere is never used for
	// culling, and `LineSegmentsGeometry.setPositions` already computes the
	// bounding volumes internally once per data upload.
	useEffect(() => {
		const clearLine = () => {
			geometry.setPositions([0, 0, 0, 0, 0, 0]);
			geometry.setDrawRange(0, 0);
			linePositionsRef.current = null;
			refFrameRef.current = null;
			invalidate();
		};

		if (!source || !source.data || source.data.length === 0) {
			clearLine();
			reportStatus("no-data");
			return;
		}

		const pathData = source.data[source.data.length - 1] as Path;

		if (!pathData || !pathData.poses || pathData.poses.length === 0) {
			clearLine();
			reportStatus("no-data");
			return;
		}

		const sourceConvention: CoordinateConvention =
			pathData.convention || "THREE";
		const poses = pathData.poses;
		const totalPoseCount = poses.length;
		const usedPoseCount = Math.min(totalPoseCount, MAX_PATH_POINTS);
		if (usedPoseCount < 2) {
			clearLine();
			reportStatus("no-data");
			return;
		}
		const startIndex = Math.max(0, totalPoseCount - usedPoseCount);

		// Grow-only scratch buffer, reused across updates.
		let positions = linePositionsRef.current;
		const needed = usedPoseCount * 3;
		if (!positions || positions.length < needed) {
			positions = new Float32Array(needed);
			linePositionsRef.current = positions;
		}

		if (sourceConvention === "THREE") {
			// Already in the render convention — copy coordinates directly
			// instead of allocating a converted position object per pose.
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

		geometry.setPositions(positions.subarray(0, needed));
		// The point count changes every update; clear the latched instance cap so the
		// full current path renders instead of being truncated to the initial segments.
		resetInstanceCap(geometry);
		geometry.setDrawRange(0, usedPoseCount);

		// Place the new data once with the latest table; subsequent transform
		// bumps are handled matrix-only by the TF effect.
		refFrameRef.current = qualifyFrame(
			datasourceId,
			source.referenceFrameId,
		);
		if (lineRef.current) {
			applyLinePose(
				lineRef.current,
				tableRef.current,
				refFrameRef.current,
				targetFrame,
				reportStatus,
			);
		}

		invalidate();
	}, [source, datasourceId, targetFrame, geometry, invalidate, reportStatus]);

	const lineObject = useMemo(
		() => new Line2(geometry, material),
		[geometry, material],
	);

	return <primitive object={lineObject} ref={lineRef} />;
};
