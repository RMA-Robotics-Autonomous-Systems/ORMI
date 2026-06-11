"use client";

import { useMemo } from "react";
import { useTransformTable } from "./transform-hooks";
import { SelectedTopic } from "../datasources/datasource-interface";
import {
	findTransformChain,
	applyTransformChain,
	localToGPS,
	GPSCoords,
} from "./utils";
import { Vector3 } from "../types";

/**
 * Transform local coordinates into GPS coordinates using a transform chain.
 * @param sourceFrameId - Source frame id.
 * @param gpsFrameId - GPS frame id.
 * @param gpsOriginData - Latest GPS data used as origin.
 * @returns Transform helpers and status flags.
 */
export function useTransformToGPS(
	sourceFrameId: string,
	gpsFrameId: string,
	gpsOriginData: GeolocationPosition | null,
) {
	const table = useTransformTable();

	// Compute transform chain from source to GPS frame
	const transformChain = useMemo(() => {
		if (!sourceFrameId || !gpsFrameId) {
			return { chain: null, error: "Missing frame IDs" };
		}

		if (sourceFrameId === gpsFrameId) {
			// Same frame, no transform needed
			return { chain: [], error: null };
		}

		const chain = findTransformChain(table, sourceFrameId, gpsFrameId);

		if (chain === null) {
			return {
				chain: null,
				error: `No transform chain found from "${sourceFrameId}" to "${gpsFrameId}"`,
			};
		}

		return { chain, error: null };
	}, [sourceFrameId, gpsFrameId, table]);

	// Get GPS origin coordinates
	const gpsOrigin = useMemo<GPSCoords | null>(() => {
		if (!gpsOriginData) {
			return null;
		}

		return {
			latitude: gpsOriginData.coords.latitude,
			longitude: gpsOriginData.coords.longitude,
			altitude: gpsOriginData.coords.altitude || 0,
		};
	}, [gpsOriginData]);

	/**
	 * Transform a local 3D point to GPS coordinates
	 */
	const transformPointToGPS = useMemo(() => {
		return (localPoint: Vector3): GPSCoords | null => {
			if (!gpsOrigin) {
				return null;
			}

			if (transformChain.error || !transformChain.chain) {
				return null;
			}

			// Apply transform chain to convert from source frame to GPS frame
			const transformedPoint =
				transformChain.chain.length > 0
					? applyTransformChain(localPoint, transformChain.chain)
					: localPoint;

			// Convert from local ENU coordinates to GPS
			return localToGPS(transformedPoint, gpsOrigin);
		};
	}, [transformChain, gpsOrigin]);

	/**
	 * Transform an array of local 3D points to GPS coordinates
	 */
	const transformPointsToGPS = useMemo(() => {
		return (localPoints: Vector3[]): (GPSCoords | null)[] => {
			return localPoints.map((point) => transformPointToGPS(point));
		};
	}, [transformPointToGPS]);

	return {
		transformPointToGPS,
		transformPointsToGPS,
		hasTransform: transformChain.chain !== null,
		transformError: transformChain.error,
		hasGPSOrigin: gpsOrigin !== null,
		gpsOrigin,
	};
}

/**
 * Resolve the latest GPS origin from a topic source.
 * @param gpsTopic - Selected GPS topic.
 * @param getSource - Source accessor for topic data.
 * @returns Latest GPS position or null.
 */
export function useGPSOrigin(
	gpsTopic: SelectedTopic | null,
	getSource: (topic: SelectedTopic) => any,
) {
	return useMemo(() => {
		if (!gpsTopic) {
			return null;
		}

		const source = getSource(gpsTopic);
		if (!source || !source.data || source.data.length === 0) {
			return null;
		}

		// Get the latest GPS data
		const latestData = source.data[source.data.length - 1];
		return latestData as GeolocationPosition;
	}, [gpsTopic, getSource]);
}
