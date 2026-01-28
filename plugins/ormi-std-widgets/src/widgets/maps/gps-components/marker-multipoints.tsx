"use client";

import { useEffect, useState } from "react";
import TopicMaker from "./marker-simple";
import { Layer, Source, Popup, useMap } from "react-map-gl/maplibre";
import {
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { EyeClosedIcon, EyeIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

export default function MultiPoints(props: {
	topic: SelectedTopic;
	name: string;
	scale?: number;
}) {
	const [locations, setLocations] = useState<any>([]);
	const [hoveredPoint, setHoveredPoint] = useState<any>(null);
	const { getSource, getSourceId } = useLocalDataSource();
	const { current: map } = useMap();

	// Create unique IDs for this multipoints instance using source ID
	const uniqueTopicId = getSourceId(props.topic);
	const sourceId = `points-source-${uniqueTopicId}`;
	const layerId = `points-layer-${uniqueTopicId}`;

	const { setButtonItem, removeButtonItem } = useButtonHolder();
	const [show, setShow] = useState(true);

	// Set up hover events for the map
	useEffect(() => {
		if (!map) return;

		const handleMouseMove = (e: any) => {
			// Only query features if the layer is currently shown
			if (!show) {
				setHoveredPoint(null);
				map.getCanvas().style.cursor = "";
				return;
			}

			const features = map.queryRenderedFeatures(e.point, {
				layers: [layerId],
			});

			if (features.length > 0) {
				const feature = features[0];
				if (feature && feature.geometry.type === "Point") {
					const coords = feature.geometry.coordinates;
					const index = feature.properties?.index;
					if (coords && coords.length >= 2 && index !== undefined) {
						setHoveredPoint({
							longitude: coords[0] as number,
							latitude: coords[1] as number,
							index: index,
						});
						map.getCanvas().style.cursor = "pointer";
					}
				}
			} else {
				setHoveredPoint(null);
				map.getCanvas().style.cursor = "";
			}
		};

		const handleMouseLeave = () => {
			setHoveredPoint(null);
			map.getCanvas().style.cursor = "";
		};

		map.on("mousemove", handleMouseMove);
		map.on("mouseleave", layerId, handleMouseLeave);

		setButtonItem(
			getSourceId(props.topic),
			<Button
				variant={"ghost"}
				onClick={() => {
					setShow(!show);
				}}
			>
				{show ? (
					<EyeIcon className="h-4 w-4" />
				) : (
					<EyeClosedIcon className="h-4 w-4" />
				)}
			</Button>,
			1,
		);

		return () => {
			map.off("mousemove", handleMouseMove);
			map.off("mouseleave", layerId, handleMouseLeave);

			removeButtonItem(getSourceId(props.topic));
		};
	}, [map, layerId, show]);

	useEffect(() => {
		const data = getSource(props.topic);
		if (!data) {
			return;
		}

		try {
			if (data.data.length > 0) {
				const lastData = data.data[
					data.data.length - 1
				] as GeolocationPosition;

				if (locations.length > 0) {
					const lastLocation = locations[locations.length - 1];
					const dist = distance(
						lastData.coords.latitude,
						lastData.coords.longitude,
						lastLocation[0],
						lastLocation[1],
					);
					if (dist > 0.25) {
						setLocations([
							...locations,
							[
								lastData.coords.latitude,
								lastData.coords.longitude,
							],
						]);
					}
				} else {
					setLocations([
						[lastData.coords.latitude, lastData.coords.longitude],
					]);
				}
			}
		} catch (error) {
			console.error("Error parsing data", error, data);
		}
	}, [getSource, props.topic]);

	const distance = (
		lat1: number,
		lon1: number,
		lat2: number,
		lon2: number,
	): number => {
		const R = 6371e3; // Earth's radius in meters

		function radians(degrees: number) {
			return (degrees * Math.PI) / 180;
		}

		const lat1Rad = radians(lat1);
		const lon1Rad = radians(lon1);
		const lat2Rad = radians(lat2);
		const lon2Rad = radians(lon2);

		const dLat = lat2Rad - lat1Rad;
		const dLon = lon2Rad - lon1Rad;

		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(lat1Rad) *
				Math.cos(lat2Rad) *
				Math.sin(dLon / 2) *
				Math.sin(dLon / 2);

		const c = 2 * Math.asin(Math.sqrt(a));

		return R * c;
	};

	const hashStringToColor = (str: string): string => {
		// Use a more sophisticated hash function (FNV-1a variant)
		let hash = 2166136261;
		for (let i = 0; i < str.length; i++) {
			hash ^= str.charCodeAt(i);
			hash +=
				(hash << 1) +
				(hash << 4) +
				(hash << 7) +
				(hash << 8) +
				(hash << 24);
		}

		// Use HSL color space for better distribution
		// Generate hue from hash (0-360 degrees)
		const hue = Math.abs(hash) % 360;

		// Use high saturation and good lightness for vibrant, distinguishable colors
		const saturation = 65 + (Math.abs(hash >> 8) % 30); // 65-95% saturation
		const lightness = 45 + (Math.abs(hash >> 16) % 20); // 45-65% lightness

		return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
	};

	return (
		<>
			{show && (
				<Source
					id={sourceId}
					type="geojson"
					data={{
						type: "FeatureCollection",
						features: locations.map((loc: any, index: number) => ({
							type: "Feature",
							properties: {
								index: index,
							},
							geometry: {
								type: "Point",
								coordinates: [loc[1], loc[0]],
							},
						})),
					}}
				>
					<Layer
						id={layerId}
						type="circle"
						source={sourceId}
						paint={{
							"circle-color": hashStringToColor(
								props.topic.topic,
							),
							"circle-radius": 6,
							"circle-stroke-width": 2,
							"circle-stroke-color": hashStringToColor(
								props.topic.topic.split("").reverse().join(""),
							),
						}}
					/>
				</Source>
			)}

			{show && hoveredPoint && (
				<Popup
					longitude={hoveredPoint.longitude}
					latitude={hoveredPoint.latitude}
					closeButton={false}
					closeOnClick={false}
					anchor="bottom"
					offset={[0, -10]}
				>
					<div className="rounded-lg shadow-md p-3 bg-white text-gray-800">
						<h3 className="font-semibold text-sm mb-1">
							Data Point
						</h3>
						<div className="flex items-center space-x-2">
							<span className="text-xs font-medium">Topic:</span>
							<span className="text-xs">{props.topic.topic}</span>
						</div>
						<div className="flex items-center space-x-2">
							<span className="text-xs font-medium">
								Latitude:
							</span>
							<span className="text-xs">
								{hoveredPoint.latitude.toFixed(6)}
							</span>
						</div>
						<div className="flex items-center space-x-2">
							<span className="text-xs font-medium">
								Longitude:
							</span>
							<span className="text-xs">
								{hoveredPoint.longitude.toFixed(6)}
							</span>
						</div>
						<div className="flex items-center space-x-2">
							<span className="text-xs font-medium">Point:</span>
							<span className="text-xs">
								{hoveredPoint.index + 1}/{locations.length}
							</span>
						</div>
					</div>
				</Popup>
			)}
		</>
	);
}
