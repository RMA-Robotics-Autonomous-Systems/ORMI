import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
	Path,
	CoordinateConvention,
	Transform,
} from "@workspace/ormi-core/types";
import {
	findTransformChain,
	useTransformSource,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
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
	targetFrame?: string;
	lineWidth?: number;
	lineOpacity?: number;
	lineColor: string;
}

const buildTransformMatrix = (
	transformChain: Transform[] | undefined,
	fallbackConvention: CoordinateConvention,
): THREE.Matrix4 => {
	const matrix = new THREE.Matrix4();
	matrix.identity();

	if (!transformChain || transformChain.length === 0) {
		return matrix;
	}

	for (const transform of transformChain) {
		const convention = transform.convention ?? fallbackConvention ?? "ROS";
		const position = convertPosition(
			{
				x: transform.position.x,
				y: transform.position.y,
				z: transform.position.z,
			},
			convention,
			"THREE",
		);
		const rotation = convertQuaternion(
			transform.rotation,
			convention,
			"THREE",
		);

		const transformMatrix = new THREE.Matrix4();
		transformMatrix.compose(
			new THREE.Vector3(position.x, position.y, position.z),
			new THREE.Quaternion(
				rotation.x,
				rotation.y,
				rotation.z,
				rotation.w,
			),
			new THREE.Vector3(1, 1, 1),
		);

		matrix.premultiply(transformMatrix);
	}

	return matrix;
};

export const PathLineRenderer = ({
	source,
	targetFrame,
	lineWidth = 0.02,
	lineOpacity = 1,
	lineColor,
}: PathLineRendererProps) => {
	const lineRef = useRef<Line2>(null);
	const linePositionsRef = useRef<Float32Array | null>(null);
	const { transformsTrees } = useTransformSource();
	const { size } = useThree();

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

	useEffect(() => {
		const clearLine = () => {
			geometry.setPositions([0, 0, 0, 0, 0, 0]);
			geometry.setDrawRange(0, 0);
			geometry.computeBoundingSphere();
			linePositionsRef.current = null;
		};

		if (!source || !source.data || source.data.length === 0) {
			clearLine();
			return;
		}

		const pathData = source.data[source.data.length - 1] as Path;

		if (!pathData || !pathData.poses || pathData.poses.length === 0) {
			clearLine();
			return;
		}

		const sourceConvention: CoordinateConvention =
			pathData.convention || "THREE";
		if (sourceConvention !== "THREE") {
			clearLine();
			return;
		}

		const poses = pathData.poses;
		const totalPoseCount = poses.length;
		const usedPoseCount = Math.min(totalPoseCount, MAX_PATH_POINTS);
		if (usedPoseCount < 2) {
			clearLine();
			return;
		}
		const startIndex = Math.max(0, totalPoseCount - usedPoseCount);

		let positions = linePositionsRef.current;
		if (!positions || positions.length !== MAX_PATH_POINTS * 3) {
			positions = new Float32Array(MAX_PATH_POINTS * 3);
			linePositionsRef.current = positions;
		}

		const refFrame = source.referenceFrameId;
		const transformChain =
			targetFrame && targetFrame.trim() !== "" && transformsTrees.size > 0
				? findTransformChain(transformsTrees, refFrame, targetFrame)
				: [];

		if (targetFrame && transformChain === null) {
			clearLine();
			return;
		}

		const transformMatrix = buildTransformMatrix(
			transformChain ?? [],
			"THREE",
		);
		if (lineRef.current) {
			lineRef.current.matrixAutoUpdate = false;
			lineRef.current.matrix.copy(transformMatrix);
			lineRef.current.matrixWorldNeedsUpdate = true;
		}

		for (let i = 0; i < usedPoseCount; i++) {
			const pose = poses[startIndex + i]!;
			const idx = i * 3;
			positions[idx] = pose.position.x;
			positions[idx + 1] = pose.position.y;
			positions[idx + 2] = pose.position.z;
		}

		geometry.setPositions(positions.subarray(0, usedPoseCount * 3));
		geometry.computeBoundingSphere();
	}, [source, targetFrame, transformsTrees, geometry, material]);

	const lineObject = useMemo(
		() => new Line2(geometry, material),
		[geometry, material],
	);

	return <primitive object={lineObject} ref={lineRef} />;
};
