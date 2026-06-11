/**
 * 3D Map / Occupancy Grid Renderer
 *
 * Renders a MapGrid as a simple textured plane in the XZ plane at origin.
 * Uses THREE.MeshBasicMaterial with pre-colored RGBA texture.
 *
 * Approach:
 * • Latest MapGrid from source.data is rendered
 * • Uint8Array data is converted to RGBA on CPU
 * • Geometry recreated only when dimensions change
 * • Plane positioned at (0,0,0)
 */

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { CoordinateConvention, MapGrid } from "@workspace/ormi-core/types";
import {
	convertPosition,
	convertQuaternion,
	findTransformChain,
} from "@workspace/ormi-core/transforms";
import {
	LayerTransformStatus,
	MapGridColorMode,
	MapGridLayerConfig,
} from "../types/scene-3d-types";
import {
	useSceneTransforms,
	useTransformStatusReporter,
	qualifyFrame,
} from "./scene-transform-context";

// ---------------------------------------------------------------------------
// Color mapping helpers (aligned with the 2D map grid widget)
// ---------------------------------------------------------------------------

/** Linear interpolation between two RGB triplets. */
const lerpRgb = (
	a: [number, number, number],
	b: [number, number, number],
	t: number,
): [number, number, number] => [
	Math.round(a[0] + (b[0] - a[0]) * t),
	Math.round(a[1] + (b[1] - a[1]) * t),
	Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Approximate plasma colormap. */
const plasmaRgb = (t: number): [number, number, number] => {
	const stops: [number, number, number][] = [
		[13, 8, 135],
		[126, 3, 168],
		[204, 72, 120],
		[248, 149, 64],
		[240, 249, 33],
	];
	const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
	const lo = Math.floor(scaled);
	const hi = Math.min(lo + 1, stops.length - 1);
	return lerpRgb(stops[lo]!, stops[hi]!, scaled - lo);
};

/** Green -> yellow -> red gradient (costmap). */
const costmapRgb = (t: number): [number, number, number] => {
	const clamped = Math.max(0, Math.min(1, t));
	if (clamped < 0.5)
		return lerpRgb([13, 184, 38], [255, 224, 0], clamped * 2);
	return lerpRgb([255, 224, 0], [230, 13, 13], (clamped - 0.5) * 2);
};

/**
 * Map a canonical occupancy byte (0-255) to an RGBA tuple.
 * Encoding:
 *   0   = free
 *   1-253 = cost gradient
 *   254 = lethal / occupied
 *   255 = unknown
 */
const toRgba = (
	value: number,
	mode: MapGridColorMode,
	alpha: number,
	showUnknown: boolean,
): [number, number, number, number] => {
	if (value > 254) {
		// unknown
		if (!showUnknown) return [0, 0, 0, 0];
		return [115, 115, 115, Math.round(alpha * 0.45 * 255)];
	}
	if (value === 0) {
		// free
		if (mode === "grayscale")
			return [242, 242, 242, Math.round(alpha * 0.25 * 255)];
		return [13, 184, 38, Math.round(alpha * 0.12 * 255)];
	}

	const t = (value - 1) / 253;
	let rgb: [number, number, number];
	if (mode === "grayscale") {
		const g = Math.round(255 - t * 235);
		rgb = [g, g, g];
	} else if (mode === "heatmap") {
		rgb = plasmaRgb(t);
	} else {
		rgb = costmapRgb(t);
	}
	return [...rgb, Math.round(alpha * 255)] as [
		number,
		number,
		number,
		number,
	];
};

/**
 * Convert Uint8Array occupancy data to RGBA Uint8ClampedArray for texture.
 * Debug: (0,0) pixel is marked bright pink for visualization.
 */
function createRGBATexture(
	data: Uint8Array,
	width: number,
	height: number,
	mode: MapGridColorMode,
	opacity: number,
	showUnknown: boolean,
): Uint8ClampedArray {
	// Rotate 90° clockwise: a width×height grid becomes a height×width image.
	// The destination stride is the rotated row length (= height), and the
	// caller sizes the canvas height×width to match. Using `width` as the
	// stride (the previous behaviour) overflowed and scrambled non-square grids.
	const outWidth = height;
	const outHeight = width;
	const rgba = new Uint8ClampedArray(outWidth * outHeight * 4);

	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const srcIdx = row * width + col;

			// Destination pixel in the rotated (height×width) image.
			const dstCol = height - 1 - row;
			const dstRow = col;
			const dstIdx = dstRow * outWidth + dstCol;

			const cell = data[srcIdx] ?? 255;
			const [r, g, b, a] = toRgba(cell, mode, opacity, showUnknown);
			rgba[dstIdx * 4 + 0] = r;
			rgba[dstIdx * 4 + 1] = g;
			rgba[dstIdx * 4 + 2] = b;
			rgba[dstIdx * 4 + 3] = a;
		}
	}

	return rgba;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Build a cumulative transform matrix from a chain of Transforms.
 */
function buildTransformMatrix(
	transformChain: ReturnType<typeof findTransformChain> | undefined,
): THREE.Matrix4 {
	const matrix = new THREE.Matrix4().identity();
	if (!transformChain?.length) return matrix;

	for (const transform of transformChain) {
		const convention: CoordinateConvention =
			(transform.convention as CoordinateConvention) ?? "THREE";
		const pos = convertPosition(
			{
				x: transform.position.x,
				y: transform.position.y,
				z: transform.position.z,
			},
			convention,
			"THREE",
		);
		const rot = convertQuaternion(transform.rotation, convention, "THREE");

		const m = new THREE.Matrix4().compose(
			new THREE.Vector3(pos.x, pos.y, pos.z),
			new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w),
			new THREE.Vector3(1, 1, 1),
		);
		matrix.premultiply(m);
	}
	return matrix;
}

interface MapGridRendererProps extends Record<string, unknown> {
	source?: { data: unknown[]; times: number[]; referenceFrameId: string };
	/** Datasource id of this layer's topic, used to qualify the reference frame. */
	datasourceId?: string;
	targetFrame: string;
	config: MapGridLayerConfig;
	layerIndex?: number;
	/** Reports how the layer resolved its transform (for the scene status overlay). */
	onTransformStatus?: (status: LayerTransformStatus) => void;
}

export const MapGridRenderer: React.FC<MapGridRendererProps> = ({
	source,
	datasourceId,
	targetFrame,
	config,
	layerIndex = 0,
	onTransformStatus,
}) => {
	const { invalidate } = useThree();
	const { table } = useSceneTransforms();
	const reportStatus = useTransformStatusReporter(onTransformStatus);

	// Track current grid state
	const [gridState, setGridState] = useState<{
		width: number;
		height: number;
		resolution: number;
	} | null>(null);

	// Keep refs for geometry, material, texture (recreated as needed)
	const meshRef = useRef<THREE.Mesh | null>(null);
	const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
	const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
	const textureRef = useRef<THREE.CanvasTexture | null>(null);

	// ── Update on incoming data ───────────────────────────────────────────────
	useEffect(() => {
		if (!source?.data.length) {
			reportStatus("no-data");
			return;
		}

		const grid = source.data[source.data.length - 1] as MapGrid;
		if (!grid?.data || grid.width === 0 || grid.height === 0) {
			reportStatus("no-data");
			return;
		}

		const { width, height, resolution, data, origin, frameId } = grid;

		// ── 1. Recreate geometry if dimensions changed ────────────────────────
		if (
			!gridState ||
			gridState.width !== width ||
			gridState.height !== height ||
			gridState.resolution !== resolution
		) {
			geometryRef.current?.dispose();
			// Create plane in XZ plane. The upstream ROS→Three conversion swaps
			// ROS x↔Three z and ROS y↔Three x, so the grid width spans Three-Z
			// and the grid height spans Three-X (the plane is transposed).
			const geo = new THREE.PlaneGeometry(
				height * resolution,
				width * resolution,
			);
			// Rotate to lay flat in XZ plane
			geo.rotateX(Math.PI / 2);
			// Move corner (0,0) to world origin: offset by half the plane size
			geo.translate(
				-(height * resolution) / 2,
				0,
				-(width * resolution) / 2,
			);
			geometryRef.current = geo;
			setGridState({ width, height, resolution });

			if (meshRef.current) {
				meshRef.current.geometry = geo;
			}
		}

		// ── 2. Create RGBA texture from data ──────────────────────────────────
		try {
			const colorMode = config.colorMode ?? "costmap";
			const opacity = config.opacity ?? 0.85;
			const showUnknown = config.showUnknown ?? true;

			const rgbaData = createRGBATexture(
				data,
				width,
				height,
				colorMode,
				opacity,
				showUnknown,
			);
			const canvas = document.createElement("canvas");
			canvas.width = height;
			canvas.height = width;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Could not get canvas context");

			const imageData = ctx.createImageData(height, width);
			imageData.data.set(rgbaData);
			ctx.putImageData(imageData, 0, 0);

			// Dispose old texture and create new one
			textureRef.current?.dispose();
			const tex = new THREE.CanvasTexture(canvas);
			tex.minFilter = THREE.NearestFilter;
			tex.magFilter = THREE.NearestFilter;
			tex.needsUpdate = true;
			textureRef.current = tex;

			// Update material if it exists
			if (materialRef.current) {
				materialRef.current.map = tex;
				materialRef.current.needsUpdate = true;
			}
		} catch (err) {
			console.error("[MapGridRenderer] Error creating texture:", err);
			return;
		}

		// ── 3. Apply transforms ───────────────────────────────────────────────
		if (!meshRef.current) return;

		// Apply transform tree first, then map origin transform
		const refFrame = qualifyFrame(
			datasourceId,
			source.referenceFrameId || frameId,
		);
		const hasTarget = Boolean(targetFrame && targetFrame.trim() !== "");
		const transformChain =
			hasTarget && table.size > 0
				? findTransformChain(table, refFrame, targetFrame)
				: [];
		reportStatus(
			hasTarget && transformChain === null ? "fallback" : "resolved",
		);

		// Target-frame fallback: if this layer's frame can't reach the target frame (the target
		// doesn't exist in its tree), render it in its own root (identity) instead of hiding it.
		const frameToTarget = buildTransformMatrix(transformChain ?? []);

		const layerYOffset = 0.01 + layerIndex * 0.01;
		const mapOriginMatrix = new THREE.Matrix4().compose(
			new THREE.Vector3(
				origin.position.x,
				origin.position.y - layerYOffset,
				origin.position.z,
			),
			new THREE.Quaternion(
				origin.orientation.x,
				origin.orientation.y,
				origin.orientation.z,
				origin.orientation.w,
			),
			new THREE.Vector3(1, 1, 1),
		);

		const finalMatrix = new THREE.Matrix4()
			.copy(frameToTarget)
			.multiply(mapOriginMatrix);

		meshRef.current.matrix.copy(finalMatrix);
		meshRef.current.matrixAutoUpdate = false;

		invalidate();
	}, [
		source,
		datasourceId,
		targetFrame,
		table,
		gridState,
		layerIndex,
		config,
		invalidate,
		reportStatus,
	]);

	// ── Create basic material once ────────────────────────────────────────────
	useEffect(() => {
		if (materialRef.current) return;

		const mat = new THREE.MeshBasicMaterial({
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
		});
		materialRef.current = mat;

		if (meshRef.current) {
			meshRef.current.material = mat;
		}

		return () => {
			mat.dispose();
		};
	}, []);

	// ── Cleanup on unmount ──────────────────────────────────────────────────
	useEffect(() => {
		return () => {
			geometryRef.current?.dispose();
			materialRef.current?.dispose();
			textureRef.current?.dispose();
		};
	}, []);

	// ── Render: start with empty mesh, populate on data arrival ──────────────
	return <mesh ref={meshRef} />;
};
