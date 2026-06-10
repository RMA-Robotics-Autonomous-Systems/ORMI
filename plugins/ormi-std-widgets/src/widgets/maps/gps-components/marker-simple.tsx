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
}) {
	const [location, setLocation] = useState<[number, number]>([
		50.843941, 4.3930369,
	]);
	const [hasData, setHasData] = useState(false);
	const { getSource, getSourceId } = useLocalDataSource();

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

		if (!props.isChild) {
			const buttonKey = getSourceId(props.topic);

			setButtonItem(
				buttonKey,
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6"
					onClick={() => {
						setShow(!show);
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
		}
		return () => {
			if (!props.isChild) {
				removeButtonItem(getSourceId(props.topic));
			}
		};
	}, [getSource, props.topic]);

	return (
		hasData &&
		show && (
			<Marker longitude={location[1]} latitude={location[0]}>
				<div>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						width={32}
						height={32}
						src={createAvatarDataUri(
							"bottts",
							getSourceId(props.topic),
						)}
						alt={`Marker for ${props.name}`}
					/>
					<p style={{ textAlign: "center" }}>{props.name}</p>
				</div>
			</Marker>
		)
	);
}
