"use client";

import { useEffect, useState, useRef } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";
import { useTransformToGPS } from "@workspace/ormi-core/transforms";
import { Path, Vector3 } from "@workspace/ormi-core/types";
import { LocalTopicVisualizerProps } from "../local-topic-visualizer-types";
import { toast } from "sonner";

/**
 * Local path marker with GPS origin transformation.
 * @param props - Component props.
 * @returns React element or null when hidden or no data.
 */
export default function PathLocalMarker(props: LocalTopicVisualizerProps) {
	const { name, topic, gpsOriginTopic } = props;
	const { getSource, getSourceId } = useLocalDataSource();

	const [gpsCoordinates, setGpsCoordinates] = useState<[number, number][]>(
		[],
	);
	const { setButtonItem, removeButtonItem } = useButtonHolder();
	const [show, setShow] = useState(true);

	// Track last error toast time for throttling (10 seconds)
	const lastErrorToastTime = useRef<number>(0);
	const ERROR_TOAST_THROTTLE_MS = 10000;

	// Get the source data
	const sourceData = getSource(topic);
	const gpsOriginSourceData = getSource(gpsOriginTopic);

	// Extract GPS origin from the GPS topic (GeolocationPosition)
	const gpsOriginData: GeolocationPosition | null = (() => {
		if (
			!gpsOriginSourceData ||
			!gpsOriginSourceData.data ||
			gpsOriginSourceData.data.length === 0
		) {
			return null;
		}

		try {
			const lastGpsData = gpsOriginSourceData.data[
				gpsOriginSourceData.data.length - 1
			] as GeolocationPosition;
			return lastGpsData;
		} catch (error) {
			console.error("Error parsing GPS origin data:", error);
			return null;
		}
	})();

	// Get frame IDs from the sources
	const pathFrameId = sourceData?.referenceFrameId || "unknown";
	const gpsFrameId = gpsOriginSourceData?.referenceFrameId || "unknown";

	// Set up transform hook
	const { transformPointToGPS, hasTransform, transformError, hasGPSOrigin } =
		useTransformToGPS(pathFrameId, gpsFrameId, gpsOriginData);

	// Create unique IDs for this path marker
	const uniqueTopicId = getSourceId(topic);
	const sourceId = `path-local-source-${uniqueTopicId}`;
	const layerId = `path-local-layer-${uniqueTopicId}`;

	useEffect(() => {
		if (!sourceData || !sourceData.data || sourceData.data.length === 0) {
			return;
		}

		// Check for GPS origin
		if (!hasGPSOrigin) {
			console.warn(`No GPS origin data available for path: ${name}`);
			return;
		}

		// Check for transform
		if (!hasTransform) {
			if (transformError) {
				console.error(
					`Transform error for path ${name}: ${transformError}`,
				);

				// Throttle error toasts to once every 10 seconds
				const now = Date.now();
				if (
					now - lastErrorToastTime.current >=
					ERROR_TOAST_THROTTLE_MS
				) {
					lastErrorToastTime.current = now;
					toast.error(`Transform Error`, {
						description: `Cannot display path "${name}": ${transformError}`,
					});
				}
			}
			return;
		}

		try {
			// Get the latest path
			const latestPath = sourceData.data[
				sourceData.data.length - 1
			] as Path;

			if (
				!latestPath ||
				!latestPath.poses ||
				latestPath.poses.length === 0
			) {
				return;
			}

			// Transform all poses to GPS coordinates
			const transformedCoords: [number, number][] = [];

			for (const pose of latestPath.poses) {
				const localPoint: Vector3 = pose.position;
				const gpsCoord = transformPointToGPS(localPoint);

				if (gpsCoord) {
					// MapLibre uses [longitude, latitude] order
					transformedCoords.push([
						gpsCoord.longitude,
						gpsCoord.latitude,
					]);
				}
			}

			if (transformedCoords.length > 0) {
				setGpsCoordinates(transformedCoords);
			}
		} catch (error) {
			console.error(`Error transforming path ${name}:`, error);
		}

		// Add visibility toggle button
		setButtonItem(
			uniqueTopicId,
			<Button variant={"ghost"} onClick={() => setShow(!show)}>
				{show ? (
					<EyeIcon className="h-4 w-4" />
				) : (
					<EyeClosedIcon className="h-4 w-4" />
				)}
			</Button>,
			1,
		);

		return () => {
			removeButtonItem(uniqueTopicId);
		};
	}, [
		sourceData,
		gpsOriginData,
		hasTransform,
		hasGPSOrigin,
		transformError,
		transformPointToGPS,
		name,
		uniqueTopicId,
		show,
	]);

	if (!show || gpsCoordinates.length === 0) {
		return null;
	}

	return (
		<Source
			id={sourceId}
			type="geojson"
			data={{
				type: "Feature",
				properties: { name },
				geometry: {
					type: "LineString",
					coordinates: gpsCoordinates,
				},
			}}
		>
			<Layer
				id={layerId}
				type="line"
				source={sourceId}
				paint={{
					"line-color": "#ff6b6b",
					"line-width": 3,
					"line-opacity": 0.8,
				}}
			/>
		</Source>
	);
}
