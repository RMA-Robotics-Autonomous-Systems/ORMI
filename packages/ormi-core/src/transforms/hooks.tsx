"use client"

import { useMemo } from "react";
import { useTransformSource } from "./transforms-provider";
import { SelectedTopic } from "../datasources/datasource-interface";
import { findTransformChain, applyTransformChain, localToGPS, GPSCoords } from "./utils";
import { Vector3 } from "../types";

/**
 * Hook to transform data from a local coordinate frame to GPS coordinates
 * 
 * @param sourceFrameId - The frame_id of the source data (e.g., "base_link", "odom")
 * @param gpsOriginTopic - The GPS topic to use as origin reference
 * @param gpsOriginData - The latest GPS data to use as origin (should be GeolocationPosition)
 * @returns Object with transform functions and error state
 */
export function useTransformToGPS(
    sourceFrameId: string,
    gpsFrameId: string,
    gpsOriginData: GeolocationPosition | null
) {
    const { transformsTrees } = useTransformSource();



    // Compute transform chain from source to GPS frame
    const transformChain = useMemo(() => {
        if (!sourceFrameId || !gpsFrameId) {
            return { chain: null, error: "Missing frame IDs" };
        }

        if (sourceFrameId === gpsFrameId) {
            // Same frame, no transform needed
            return { chain: [], error: null };
        }

        const chain = findTransformChain(transformsTrees, sourceFrameId, gpsFrameId);

        if (chain === null) {
            return {
                chain: null,
                error: `No transform chain found from "${sourceFrameId}" to "${gpsFrameId}"`
            };
        }

        return { chain, error: null };
    }, [sourceFrameId, gpsFrameId, transformsTrees]);

    // Get GPS origin coordinates
    const gpsOrigin = useMemo<GPSCoords | null>(() => {
        if (!gpsOriginData) {
            return null;
        }

        return {
            latitude: gpsOriginData.coords.latitude,
            longitude: gpsOriginData.coords.longitude,
            altitude: gpsOriginData.coords.altitude || 0
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
            const transformedPoint = transformChain.chain.length > 0
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
            return localPoints.map(point => transformPointToGPS(point));
        };
    }, [transformPointToGPS]);

    return {
        transformPointToGPS,
        transformPointsToGPS,
        hasTransform: transformChain.chain !== null,
        transformError: transformChain.error,
        hasGPSOrigin: gpsOrigin !== null,
        gpsOrigin
    };
}

/**
 * Hook to get the latest GPS data from a topic for use as origin
 */
export function useGPSOrigin(gpsTopic: SelectedTopic | null, getSource: (topic: SelectedTopic) => any) {
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
