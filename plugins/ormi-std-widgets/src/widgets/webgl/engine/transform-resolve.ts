/**
 * Shared transform-chain resolution for the 3D scene layers.
 *
 * A transform chain (the ordered list of {@link Transform} edges returned by
 * `findTransformChain`) is collapsed into a single cumulative `THREE.Matrix4`.
 * Point-cloud, path, and map-grid renderers all need the identical collapse, so
 * it lives here once instead of being copied per renderer.
 *
 * Chain resolution itself stays in core (`findTransformChain`); this module only
 * turns a resolved chain into a matrix.
 */

import * as THREE from "three";
import type {
	CoordinateConvention,
	Transform,
} from "@workspace/ormi-core/types";
import {
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";

/**
 * Collapse a transform chain into one cumulative matrix in the THREE
 * convention.
 *
 * Each edge is converted from its own convention into THREE, composed into a
 * matrix, and pre-multiplied so the chain applies in order (`Tn · … · T1`). An
 * empty or missing chain yields the identity matrix.
 *
 * @param transformChain - Ordered transform edges (frame-to-target), or
 *   `undefined`/empty for the identity transform.
 * @param fallbackConvention - Convention assumed for edges that don't declare
 *   one. Defaults to `"THREE"`.
 * @returns A new cumulative `THREE.Matrix4`.
 */
export function buildTransformMatrix(
	transformChain: Transform[] | undefined,
	fallbackConvention: CoordinateConvention = "THREE",
): THREE.Matrix4 {
	const matrix = new THREE.Matrix4();
	matrix.identity();

	if (!transformChain || transformChain.length === 0) {
		return matrix;
	}

	for (const transform of transformChain) {
		const convention =
			transform.convention ?? fallbackConvention ?? "THREE";
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
}
