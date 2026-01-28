"use client";

import { useEffect, useState, useRef } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";
import { IMU } from "@workspace/ormi-core/types";
import {
	LocalTopicVisualizerProps,
	LocalTopic,
} from "../local-topic-visualizer-types";
import { getColorsFromString } from "@workspace/utils";
import { toast } from "sonner";

export interface IMULocalTopic extends LocalTopic {
	imuFrame: "ENU" | "NED" | "NWU";
	headingAxis: "X" | "Y" | "Z";
	minDistance?: number; // Minimum distance in meters between arrows (default: 0.5m)
	maxArrows?: number; // Maximum number of arrows to display (default: 500)
	timeWindow?: number; // Time window in milliseconds for IMU matching (default: 100ms)
}

interface IMUVisualizerProps extends LocalTopicVisualizerProps {
	minDistance?: number;
	maxArrows?: number;
	timeWindow?: number;
	settings?: {
		imuFrame: "ENU" | "NED" | "NWU";
		headingAxis: "X" | "Y" | "Z";
	};
}

interface ArrowData {
	coords: [number, number];
	heading: number; // in radians
	timestamp: number; // GPS timestamp
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 */
function calculateDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371e3; // Earth's radius in meters
	const φ1 = (lat1 * Math.PI) / 180;
	const φ2 = (lat2 * Math.PI) / 180;
	const Δφ = ((lat2 - lat1) * Math.PI) / 180;
	const Δλ = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c; // Distance in meters
}

/**
 * Find best matching IMU data using interpolation or nearest neighbor
 */
function findMatchingIMU(
	gpsTime: number,
	imuData: any[],
	imuTimes: (number | undefined)[],
	timeWindowMs: number,
): IMU | null {
	let bestMatch: IMU | null = null;
	let smallestTimeDiff = Infinity;

	// Convert time window to seconds (assuming timestamps are in seconds)
	const timeWindowSec = timeWindowMs / 1000;

	for (let j = 0; j < imuData.length; j++) {
		const imuTime = imuTimes[j];
		if (imuTime === undefined) continue;

		const timeDiff = Math.abs(gpsTime - imuTime);

		// Only consider IMU data within the time window
		if (timeDiff <= timeWindowSec && timeDiff < smallestTimeDiff) {
			smallestTimeDiff = timeDiff;
			bestMatch = imuData[j] as IMU;
		}
	}

	return bestMatch;
}

/**
 * Convert quaternion to Euler angles and extract heading based on axis and frame
 */
function quaternionToHeading(
	qx: number,
	qy: number,
	qz: number,
	qw: number,
	imuFrame: "ENU" | "NED" | "NWU",
	headingAxis: "X" | "Y" | "Z",
): number {
	// Convert quaternion to Euler angles (ZYX convention)
	// Roll (x-axis rotation)
	const sinr_cosp = 2 * (qw * qx + qy * qz);
	const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
	const roll = Math.atan2(sinr_cosp, cosr_cosp);

	// Pitch (y-axis rotation)
	const sinp = 2 * (qw * qy - qz * qx);
	const pitch =
		Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

	// Yaw (z-axis rotation)
	const siny_cosp = 2 * (qw * qz + qx * qy);
	const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
	const yaw = Math.atan2(siny_cosp, cosy_cosp);

	// Select the appropriate angle based on heading axis
	let heading = 0;
	switch (headingAxis) {
		case "X":
			heading = roll;
			break;
		case "Y":
			heading = pitch;
			break;
		case "Z":
			heading = yaw;
			break;
	}

	// Convert based on IMU frame convention
	switch (imuFrame) {
		case "ENU": // East-North-Up: 0° = East, 90° = North
			// heading is already in the correct format (0 = East)
			break;
		case "NED": // North-East-Down: 0° = North, 90° = East
			heading = heading - Math.PI / 2; // Rotate 90° to convert North to East
			break;
		case "NWU": // North-West-Up: 0° = North, 270° = West
			heading = -heading - Math.PI / 2; // Mirror and rotate
			break;
	}

	return heading;
}

/**
 * Create arrow geometry as a line with arrowhead
 */
function createArrowGeometry(
	lon: number,
	lat: number,
	heading: number,
	lengthMeters: number = 0.5,
): GeoJSON.Feature {
	// Convert meters to approximate degrees (rough approximation)
	const metersToDegreesLat = 1 / 111320;
	const metersToDegreesLon = 1 / (111320 * Math.cos((lat * Math.PI) / 180));

	// Arrow main line endpoint
	const endLon = lon + lengthMeters * Math.cos(heading) * metersToDegreesLon;
	const endLat = lat + lengthMeters * Math.sin(heading) * metersToDegreesLat;

	// Arrowhead points (30° angle, 1/3 of arrow length)
	const arrowheadLength = lengthMeters * 0.3;
	const arrowAngle = (30 * Math.PI) / 180;

	const leftLon =
		endLon -
		arrowheadLength * Math.cos(heading - arrowAngle) * metersToDegreesLon;
	const leftLat =
		endLat -
		arrowheadLength * Math.sin(heading - arrowAngle) * metersToDegreesLat;

	const rightLon =
		endLon -
		arrowheadLength * Math.cos(heading + arrowAngle) * metersToDegreesLon;
	const rightLat =
		endLat -
		arrowheadLength * Math.sin(heading + arrowAngle) * metersToDegreesLat;

	return {
		type: "Feature",
		geometry: {
			type: "MultiLineString",
			coordinates: [
				[
					[lon, lat],
					[endLon, endLat],
				], // Main arrow line
				[
					[endLon, endLat],
					[leftLon, leftLat],
				], // Left arrowhead
				[
					[endLon, endLat],
					[rightLon, rightLat],
				], // Right arrowhead
			],
		},
		properties: {},
	};
}

export default function IMULocalMarker(props: IMUVisualizerProps) {
	const { name, topic, gpsOriginTopic, settings } = props;
	const { getSource, getSourceId } = useLocalDataSource();

	const [arrows, setArrows] = useState<ArrowData[]>([]);
	const { setButtonItem, removeButtonItem } = useButtonHolder();
	const [show, setShow] = useState(true);

	// Track last error toast time for throttling
	const lastErrorToastTime = useRef<number>(0);
	const ERROR_TOAST_THROTTLE_MS = 10000;

	// Track last arrow position for distance filtering
	const lastArrowPosition = useRef<{ lat: number; lon: number } | null>(null);

	// Get IMU settings from props or use defaults
	const imuFrame = (settings?.imuFrame || (props as any).imuFrame) ?? "ENU";
	const headingAxis =
		(settings?.headingAxis || (props as any).headingAxis) ?? "Z";
	const minDistance = (props as any).minDistance ?? 0.5; // 0.5 meters default
	const maxArrows = (props as any).maxArrows ?? 500; // 500 arrows max default
	const timeWindow = (props as any).timeWindow ?? 100; // 100ms default

	// Get the source data
	const imuSourceData = getSource(topic);
	const gpsOriginSourceData = getSource(gpsOriginTopic);

	// Create unique IDs for this IMU marker
	const uniqueTopicId = getSourceId(topic);
	const sourceId = `imu-local-source-${uniqueTopicId}`;
	const layerId = `imu-local-layer-${uniqueTopicId}`;

	// Generate color from name
	const arrowColor = getColorsFromString(name, 0.8);

	useEffect(() => {
		if (
			!imuSourceData ||
			!imuSourceData.data ||
			imuSourceData.data.length === 0
		) {
			return;
		}

		if (
			!gpsOriginSourceData ||
			!gpsOriginSourceData.data ||
			gpsOriginSourceData.data.length === 0
		) {
			console.warn(`No GPS origin data available for IMU: ${name}`);
			return;
		}

		try {
			const newArrows: ArrowData[] = [];

			// Process each GPS data point
			for (let i = 0; i < gpsOriginSourceData.data.length; i++) {
				const gpsData = gpsOriginSourceData.data[
					i
				] as GeolocationPosition;
				const gpsTime = gpsOriginSourceData.times[i];

				if (gpsTime === undefined) continue;

				const currentLat = gpsData.coords.latitude;
				const currentLon = gpsData.coords.longitude;

				// Check distance from last arrow to reduce clutter when stationary
				if (lastArrowPosition.current) {
					const distance = calculateDistance(
						lastArrowPosition.current.lat,
						lastArrowPosition.current.lon,
						currentLat,
						currentLon,
					);

					// Skip if GPS hasn't moved enough
					if (distance < minDistance) {
						continue;
					}
				}

				// Find matching IMU data using improved matching
				const bestMatch = findMatchingIMU(
					gpsTime,
					imuSourceData.data,
					imuSourceData.times,
					timeWindow,
				);

				if (bestMatch && bestMatch.orientation) {
					// Extract quaternion (assuming Vector4 is {x, y, z, w})
					const {
						x: qx,
						y: qy,
						z: qz,
						w: qw,
					} = bestMatch.orientation;

					// Calculate heading
					const heading = quaternionToHeading(
						qx,
						qy,
						qz,
						qw,
						imuFrame,
						headingAxis,
					);

					newArrows.push({
						coords: [currentLon, currentLat],
						heading,
						timestamp: gpsTime,
					});

					// Update last arrow position
					lastArrowPosition.current = {
						lat: currentLat,
						lon: currentLon,
					};
				}
			}

			if (newArrows.length > 0) {
				setArrows((prevArrows) => {
					const updatedArrows = [...prevArrows, ...newArrows];

					// Enforce max arrows limit (keep most recent)
					if (updatedArrows.length > maxArrows) {
						return updatedArrows.slice(
							updatedArrows.length - maxArrows,
						);
					}

					return updatedArrows;
				});
			}
		} catch (error) {
			console.error(`Error processing IMU data for ${name}:`, error);

			const now = Date.now();
			if (now - lastErrorToastTime.current >= ERROR_TOAST_THROTTLE_MS) {
				lastErrorToastTime.current = now;
				toast.error(`IMU Processing Error`, {
					description: `Cannot display IMU arrows for "${name}": ${error}`,
				});
			}
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
		imuSourceData,
		gpsOriginSourceData,
		imuFrame,
		headingAxis,
		name,
		uniqueTopicId,
		show,
	]);

	if (!show || arrows.length === 0) {
		return null;
	}

	// Create GeoJSON features for all arrows
	const arrowFeatures: GeoJSON.FeatureCollection = {
		type: "FeatureCollection",
		features: arrows.map((arrow, index) =>
			createArrowGeometry(
				arrow.coords[0],
				arrow.coords[1],
				arrow.heading,
			),
		),
	};

	return (
		<Source id={sourceId} type="geojson" data={arrowFeatures}>
			<Layer
				id={layerId}
				type="line"
				source={sourceId}
				paint={{
					"line-color": arrowColor,
					"line-width": 2,
					"line-opacity": 0.8,
				}}
			/>
		</Source>
	);
}
