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
	useTransformSource,
} from "@workspace/ormi-core/transforms";
import { MapGridColorMode, MapGridLayerConfig } from "../types/scene-3d-types";

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
	console.log(
		"createRGBATexture: data length =",
		data.length,
		"width =",
		width,
		"height =",
		height,
	);
	const rgba = new Uint8ClampedArray(data.length * 4);

	// Rotate 90 degrees clockwise
	for (let row = 0; row < height; row++) {
		for (let col = 0; col < width; col++) {
			const srcIdx = row * width + col;

			// After 90 degrees clockwise: (col, height-1-row)
			const newRow = col;
			const newCol = height - 1 - row;

			const dstIdx = newRow * width + newCol;
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
	targetFrame: string;
	config: MapGridLayerConfig;
	layerIndex?: number;
}

export const MapGridRenderer: React.FC<MapGridRendererProps> = ({
	source,
	targetFrame,
	config,
	layerIndex = 0,
}) => {
	const { invalidate } = useThree();
	const { transformsTrees } = useTransformSource();

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
		if (!source?.data.length) return;

		const grid = source.data[source.data.length - 1] as MapGrid;
		if (!grid?.data || grid.width === 0 || grid.height === 0) return;

		const { width, height, resolution, data, origin, frameId } = grid;

		// ── 1. Recreate geometry if dimensions changed ────────────────────────
		if (
			!gridState ||
			gridState.width !== width ||
			gridState.height !== height ||
			gridState.resolution !== resolution
		) {
			geometryRef.current?.dispose();
			// Create plane in XZ plane
			const geo = new THREE.PlaneGeometry(
				width * resolution,
				height * resolution,
			);
			// Rotate to lay flat in XZ plane
			geo.rotateX(Math.PI / 2);
			// Move corner (0,0) to world origin: offset by half the plane size
			geo.translate(
				-(width * resolution) / 2,
				0,
				-(height * resolution) / 2,
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
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Could not get canvas context");

			const imageData = ctx.createImageData(width, height);
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
		const refFrame = source.referenceFrameId || frameId;
		const transformChain =
			targetFrame && targetFrame.trim() !== "" && transformsTrees.size > 0
				? findTransformChain(transformsTrees, refFrame, targetFrame)
				: [];

		if (targetFrame && transformChain === null) {
			return;
		}

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

		console.log("[MapGridRenderer] Applying transforms:", {
			refFrame,
			targetFrame,
			transformChain,
			mapOriginMatrix,
		});

		const finalMatrix = new THREE.Matrix4()
			.copy(frameToTarget)
			.multiply(mapOriginMatrix);

		meshRef.current.matrix.copy(finalMatrix);
		meshRef.current.matrixAutoUpdate = false;

		console.log("[MapGridRenderer] Grid displayed:", {
			refFrame,
			targetFrame,
			size: { width: width * resolution, height: height * resolution },
		});

		invalidate();
	}, [
		source,
		targetFrame,
		transformsTrees,
		gridState,
		layerIndex,
		config,
		invalidate,
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
