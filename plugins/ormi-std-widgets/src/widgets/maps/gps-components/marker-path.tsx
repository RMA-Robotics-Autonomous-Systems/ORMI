"use client";

import { useEffect, useState } from "react";
import TopicMaker from "./marker-simple";
import { Layer, Source } from "react-map-gl/maplibre";
import {
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";

/**
 * GPS path marker rendering a line from multiple GPS points.
 * @param props - Component props.
 * @returns React element or null when hidden.
 */
export default function PathMarker(props: {
	topic: SelectedTopic;
	name: string;
	scale?: number;
	/**
	 * Stable identity of the configuration entry this marker renders. Several
	 * entries may target the same topic, so the topic key is not unique: this id
	 * keys the ButtonHolder toggle and the MapLibre source/layer ids.
	 */
	instanceId: string;
}) {
	const [locations, setLocations] = useState<any>([]);
	const { getSource } = useLocalDataSource();

	// Unique IDs for this path marker instance: per configuration entry, not per
	// topic, so two entries on the same topic do not collide in MapLibre.
	const uniqueTopicId = props.instanceId;
	const sourceId = `path-source-${uniqueTopicId}`;
	const layerId = `path-layer-${uniqueTopicId}`;

	const { setButtonItem, removeButtonItem } = useButtonHolder();
	const [show, setShow] = useState(true);

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

	// Visibility toggle registration lives in its own effect so it re-registers
	// on `show` and never closes over a stale value.
	useEffect(() => {
		setButtonItem(
			props.instanceId,
			<Button
				variant="ghost"
				size="icon"
				className="h-6 w-6"
				onClick={() => {
					setShow((v) => !v);
				}}
			>
				{show ? (
					<EyeIcon className="h-3 w-3" />
				) : (
					<EyeClosedIcon className="h-3 w-3" />
				)}
			</Button>,
			1,
		);

		return () => {
			removeButtonItem(props.instanceId);
		};
	}, [props.instanceId, show, setButtonItem, removeButtonItem]);

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

	if (!show) {
		return null;
	}

	return (
		<>
			<Source
				id={sourceId}
				type="geojson"
				data={{
					type: "Feature",
					properties: {},
					geometry: {
						type: "LineString",
						coordinates: locations.map((loc: any) => [
							loc[1],
							loc[0],
						]),
					},
				}}
			>
				<Layer
					id={layerId}
					type="line"
					source={sourceId}
					paint={{
						"line-color": "#888",
						"line-width": 4,
					}}
				/>
			</Source>
			<TopicMaker
				topic={props.topic}
				name={props.name}
				scale={props.scale}
				instanceId={props.instanceId}
				isChild
			/>
		</>
	);
}
