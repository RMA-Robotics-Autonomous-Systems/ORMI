import React, { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { PointsCloud, Transform } from "@workspace/ormi-core/types";
import {
	findTransformChain,
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import { RingPointBuffer } from "@workspace/utils";
import { themeShaders } from "../utils/theme-shaders";
import { PointCloudLayerConfig } from "../types/scene-3d-types";

const MAX_ROLLING_POINTS = 600000;
const TIME_RESET_SECONDS = 300;

// ============================================================================
// Transform utilities
// ============================================================================
const buildTransformMatrix = (
	transformChain: Transform[] | undefined,
): THREE.Matrix4 => {
	const matrix = new THREE.Matrix4();
	matrix.identity();

	if (!transformChain || transformChain.length === 0) {
		return matrix;
	}

	for (const transform of transformChain) {
		const convention = transform.convention ?? "THREE";
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

// ============================================================================
// Point Cloud Source Renderer
// ============================================================================
interface PointCloudSourceRendererProps extends Record<string, unknown> {
	sourceId: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	source: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	transformsTrees: any;
	config: PointCloudLayerConfig;
	targetFrame: string;
	frameTimeRef: React.MutableRefObject<number>;
}

export const PointCloudSourceRenderer: React.FC<
	PointCloudSourceRendererProps
> = ({
	sourceId,
	source,
	transformsTrees,
	config,
	targetFrame,
	frameTimeRef,
}) => {
	const { invalidate } = useThree();

	const pointsRef = useRef<THREE.Points | null>(null);
	const geometryRef = useRef<THREE.BufferGeometry | null>(null);
	const materialRef = useRef<THREE.ShaderMaterial | null>(null);

	const dataRef = useRef<{
		positions: Float32Array | null;
		colors: Float32Array | null;
		intensities: Float32Array | null;
		timestamps: Float32Array | null;
		capacity: number;
	}>({
		positions: null,
		colors: null,
		intensities: null,
		timestamps: null,
		capacity: 0,
	});
	const needsUpdateRef = useRef(false);
	const transformRef = useRef(new THREE.Matrix4());
	const rollingBufferRef = useRef<RingPointBuffer | null>(null);
	const lastProcessedIndexRef = useRef(0);
	const lastProcessedTimeRef = useRef(0);
	const startTimeRef = useRef<number>(0);

	const pointSize = config.pointSize ?? 0.05;
	const decayTime = config.decayTime ?? 0;
	const rollingBuffer = config.rollingBuffer ?? false;
	const theme = config.theme ?? "Default";
	const useTransparency = config.useTransparency ?? false;
	const customColor = config.customColor ?? "#ffffff";
	const colorMode = config.colorMode ?? "source";

	useEffect(() => {
		// Initialize start time on mount
		startTimeRef.current = Date.now();

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute([], 3),
		);
		geometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
		geometry.setAttribute(
			"intensity",
			new THREE.Float32BufferAttribute([], 1),
		);
		geometry.setAttribute(
			"timestamp",
			new THREE.Float32BufferAttribute([], 1),
		);
		geometryRef.current = geometry;

		const shaders =
			themeShaders[theme as keyof typeof themeShaders] ||
			themeShaders.Default;
		const material = new THREE.ShaderMaterial({
			uniforms: {
				pointSize: { value: pointSize },
				useTransparency: { value: useTransparency },
				customColor: { value: new THREE.Vector3(1, 1, 1) },
				useIntensity: { value: colorMode === "reflectivity" },
				pointTransform: { value: new THREE.Matrix4() },
				nowTime: { value: 0 },
				decayTime: { value: decayTime || 0 },
			},
			vertexShader: shaders.vertexShader,
			fragmentShader: shaders.fragmentShader,
			transparent: useTransparency,
			depthWrite: !useTransparency,
			depthTest: true,
			vertexColors: true,
		});
		materialRef.current = material;

		return () => {
			geometry.dispose();
			material.dispose();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (rollingBuffer) {
			rollingBufferRef.current = new RingPointBuffer(MAX_ROLLING_POINTS);
			lastProcessedIndexRef.current = 0;
			lastProcessedTimeRef.current = 0;
		} else {
			rollingBufferRef.current = null;
		}
	}, [rollingBuffer, sourceId]);

	const processData = useCallback(() => {
		const dataArray = source?.data ?? [];
		const timesArray = source?.times ?? [];
		if (dataArray.length === 0) return;

		let transformChain: ReturnType<typeof findTransformChain> | undefined =
			[];
		const refFrame = source.referenceFrameId;
		if (!targetFrame || targetFrame === "" || refFrame === targetFrame) {
			transformChain = [];
		} else {
			transformChain =
				findTransformChain(transformsTrees, refFrame, targetFrame) ??
				null;
		}

		if (targetFrame && transformChain === null) {
			return;
		}

		transformRef.current = buildTransformMatrix(
			transformChain as Transform[],
		);

		const getReceiveTimestamp = () => frameTimeRef.current;
		const nowMs = getReceiveTimestamp();
		let nowSeconds = (nowMs - startTimeRef.current) / 1000.0;
		if (rollingBufferRef.current && nowSeconds > TIME_RESET_SECONDS) {
			rollingBufferRef.current.shiftTimestamps(nowSeconds);
			startTimeRef.current = nowMs;
			nowSeconds = 0;
		}

		if (rollingBuffer) {
			if (!rollingBufferRef.current) {
				rollingBufferRef.current = new RingPointBuffer(
					MAX_ROLLING_POINTS,
				);
			}

			const startIndex = 0;
			let latestRawTime = lastProcessedTimeRef.current;
			let pushedCount = 0;

			for (let i = startIndex; i < dataArray.length; i++) {
				const cloud = dataArray[i] as PointsCloud | undefined;
				if (!cloud?.points?.length) continue;

				if (!(cloud.points instanceof Float32Array)) {
					console.warn(
						"PointsCloud expects packed Float32Array points. Skipping source",
						sourceId,
					);
					continue;
				}

				const pointCount = Math.floor(cloud.points.length / 3);
				if (pointCount === 0) continue;

				if (cloud.convention && cloud.convention !== "THREE") {
					console.warn(
						"PointsCloud convention is not THREE. Converter should output THREE coordinates.",
					);
					continue;
				}

				const hasColors =
					cloud.colors instanceof Float32Array &&
					cloud.colors.length >= pointCount * 3;
				const hasIntensities =
					cloud.intensities instanceof Float32Array &&
					cloud.intensities.length >= pointCount;

				const positions = cloud.points;
				let colors = hasColors ? cloud.colors! : null;
				let intensities = hasIntensities ? cloud.intensities! : null;

				if (!colors) {
					colors = new Float32Array(pointCount * 3);
					colors.fill(1);
				}

				if (!intensities) {
					intensities = new Float32Array(pointCount);
					intensities.fill(0);
				}

				const rawTime = Number.isFinite(timesArray[i])
					? (timesArray[i] as number)
					: i;
				if (rawTime === lastProcessedTimeRef.current) {
					continue;
				}

				const receiveTime = getReceiveTimestamp();
				const messageTimeSeconds =
					(receiveTime - startTimeRef.current) / 1000.0;

				rollingBufferRef.current.push(
					positions,
					colors,
					intensities,
					pointCount,
					messageTimeSeconds,
				);

				pushedCount++;
				latestRawTime = rawTime;
			}

			lastProcessedIndexRef.current = dataArray.length;
			if (pushedCount > 0) {
				lastProcessedTimeRef.current = latestRawTime;
			}

			const data = rollingBufferRef.current.getData();
			dataRef.current = {
				positions: data.positions,
				colors: data.colors,
				intensities: data.intensities,
				timestamps: data.timestamps,
				capacity: rollingBufferRef.current.getCapacity(),
			};
		} else {
			const latestIndex = dataArray.length - 1;
			const cloud = dataArray[latestIndex] as PointsCloud | undefined;
			if (!cloud?.points?.length) return;

			if (!(cloud.points instanceof Float32Array)) {
				console.warn(
					"PointsCloud expects packed Float32Array points. Skipping source",
					sourceId,
				);
				return;
			}

			const pointCount = Math.floor(cloud.points.length / 3);
			if (pointCount === 0) return;

			if (cloud.convention && cloud.convention !== "THREE") {
				console.warn(
					"PointsCloud convention is not THREE. Converter should output THREE coordinates.",
				);
				return;
			}

			const hasColors =
				cloud.colors instanceof Float32Array &&
				cloud.colors.length >= pointCount * 3;
			const hasIntensities =
				cloud.intensities instanceof Float32Array &&
				cloud.intensities.length >= pointCount;

			const positions = cloud.points;
			let colors = hasColors ? cloud.colors! : null;
			let intensities = hasIntensities ? cloud.intensities! : null;

			if (!colors) {
				colors = new Float32Array(pointCount * 3);
				colors.fill(1);
			}

			if (!intensities) {
				intensities = new Float32Array(pointCount);
				intensities.fill(0);
			}

			const nonRollingTimestamps = new Float32Array(pointCount);
			nonRollingTimestamps.fill(nowSeconds);

			dataRef.current = {
				positions,
				colors,
				intensities,
				timestamps: nonRollingTimestamps,
				capacity: pointCount,
			};
		}

		needsUpdateRef.current = true;
		invalidate();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		source,
		sourceId,
		targetFrame,
		rollingBuffer,
		transformsTrees,
		invalidate,
	]);

	const updateGeometry = useCallback(() => {
		if (!geometryRef.current || !needsUpdateRef.current) return;

		const data = dataRef.current;
		if (
			!data.positions ||
			!data.colors ||
			!data.intensities ||
			data.capacity === 0
		) {
			geometryRef.current.setDrawRange(0, 0);
			needsUpdateRef.current = false;
			return;
		}

		const count = data.capacity;
		const positionsView = data.positions.subarray(0, count * 3);
		const colorsView = data.colors.subarray(0, count * 3);
		const intensitiesView = data.intensities.subarray(0, count);
		const timestampsView = data.timestamps
			? data.timestamps.subarray(0, count)
			: new Float32Array(count).fill(0);

		const posAttr = geometryRef.current.getAttribute("position");

		if (!posAttr || posAttr.count !== count) {
			geometryRef.current.setAttribute(
				"position",
				new THREE.Float32BufferAttribute(positionsView, 3),
			);
			geometryRef.current.setAttribute(
				"color",
				new THREE.Float32BufferAttribute(colorsView, 3),
			);
			geometryRef.current.setAttribute(
				"intensity",
				new THREE.Float32BufferAttribute(intensitiesView, 1),
			);
			geometryRef.current.setAttribute(
				"timestamp",
				new THREE.Float32BufferAttribute(timestampsView, 1),
			);
		} else {
			const colAttr = geometryRef.current.getAttribute("color");
			const intAttr = geometryRef.current.getAttribute("intensity");
			const tsAttr = geometryRef.current.getAttribute("timestamp");

			(posAttr.array as Float32Array).set(positionsView);
			(colAttr.array as Float32Array).set(colorsView);
			(intAttr.array as Float32Array).set(intensitiesView);
			(tsAttr.array as Float32Array).set(timestampsView);
			posAttr.needsUpdate = true;
			colAttr.needsUpdate = true;
			intAttr.needsUpdate = true;
			tsAttr.needsUpdate = true;
		}

		geometryRef.current.setDrawRange(0, count);
		geometryRef.current.computeBoundingSphere();

		needsUpdateRef.current = false;
	}, []);

	const updateMaterial = useCallback(() => {
		if (!materialRef.current) return;

		const mat = materialRef.current;
		if (!mat.uniforms) return;

		if (mat.uniforms.pointSize) mat.uniforms.pointSize.value = pointSize;
		if (mat.uniforms.useTransparency)
			mat.uniforms.useTransparency.value = useTransparency;
		if (mat.uniforms.useIntensity)
			mat.uniforms.useIntensity.value = colorMode === "reflectivity";

		if (mat.uniforms.pointTransform)
			mat.uniforms.pointTransform.value.copy(transformRef.current);

		const now = frameTimeRef.current;
		const nowSeconds = (now - startTimeRef.current) / 1000.0;
		const decaySeconds = decayTime / 1000.0;
		if (mat.uniforms.nowTime) mat.uniforms.nowTime.value = nowSeconds;
		if (mat.uniforms.decayTime) mat.uniforms.decayTime.value = decaySeconds;

		const customCol = new THREE.Color(customColor);
		if (mat.uniforms.customColor)
			mat.uniforms.customColor.value.set(
				customCol.r,
				customCol.g,
				customCol.b,
			);

		const shaders =
			themeShaders[theme as keyof typeof themeShaders] ||
			themeShaders.Default;
		if (mat.vertexShader !== shaders.vertexShader) {
			mat.vertexShader = shaders.vertexShader;
			mat.fragmentShader = shaders.fragmentShader;
			mat.needsUpdate = true;
		}

		mat.transparent = useTransparency || (rollingBuffer && decayTime > 0);
		mat.depthWrite = !(useTransparency || (rollingBuffer && decayTime > 0));

		invalidate();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		pointSize,
		useTransparency,
		colorMode,
		customColor,
		theme,
		rollingBuffer,
		decayTime,
		invalidate,
	]);

	useEffect(() => {
		processData();
	}, [processData]);

	useFrame(() => {
		updateMaterial();
		updateGeometry();
	});

	if (!geometryRef.current || !materialRef.current) return null;

	return (
		<points
			ref={pointsRef}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			geometry={geometryRef.current as any}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			material={materialRef.current as any}
		/>
	);
};
