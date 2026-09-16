"use client";

import { useEffect, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { createAvatarDataUri } from "@workspace/utils";
import {
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";

/**
 * Simple GPS marker with visibility toggle.
 * @param props - Component props.
 * @returns React element or null when hidden or no data.
 */
export default function TopicMarker(props: {
	topic: SelectedTopic;
	name: string;
	scale?: number;
	isChild?: boolean;
	/**
	 * Stable identity of the configuration entry this marker renders. Several
	 * entries may target the same topic, so the topic key is not unique: this id
	 * keys the ButtonHolder toggle and seeds the marker avatar.
	 */
	instanceId: string;
}) {
	const [location, setLocation] = useState<[number, number]>([
		50.843941, 4.3930369,
	]);
	const [hasData, setHasData] = useState(false);
	const { getSource } = useLocalDataSource();

	const { setButtonItem, removeButtonItem } = useButtonHolder();
	const [show, setShow] = useState(true);

	useEffect(() => {
		const data = getSource(props.topic);
		if (!data) {
			return;
		}

		try {
			if (data.data.length === 0) {
				return;
			}

			const lastData = data.data[
				data.data.length - 1
			] as GeolocationPosition;
			setHasData(true);
			setLocation([lastData.coords.latitude, lastData.coords.longitude]);
		} catch (error) {
			console.error("Error parsing data", error, data);
		}
	}, [getSource, props.topic]);

	// Visibility toggle registration lives in its own effect: it must run even
	// when the topic has produced no data yet, and it has to re-register on
	// `show` so the icon and the click handler never close over a stale value.
	useEffect(() => {
		if (props.isChild) {
			return;
		}

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
	}, [
		props.instanceId,
		props.isChild,
		show,
		setButtonItem,
		removeButtonItem,
	]);

	return (
		hasData &&
		show && (
			<Marker longitude={location[1]} latitude={location[0]}>
				<div>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						width={32}
						height={32}
						src={createAvatarDataUri("bottts", props.instanceId)}
						alt={`Marker for ${props.name}`}
					/>
					<p style={{ textAlign: "center" }}>{props.name}</p>
				</div>
			</Marker>
		)
	);
}
