import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { RefreshCwIcon, VideotapeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { RestBagClient } from "../rest-bag-client";
import { RecordingStatus } from "../recording-types";
import { Recorder } from "./recorder";
import { RecorderCreator } from "./recorder-creator";
import { Datasource } from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";

interface RecorderListProps {
	title: string;
	api_datasource_id: string;
	ros_datasource_id: string;
}

// Main component
const BagsRecorders = (props: RecorderListProps) => {
	const pluginsManager = usePluginsManager();

	// Service state
	const [client, setClient] = useState<RestBagClient | null>(null);

	const { setButtonItem, removeButtonItem } = useButtonHolder();

	const [refreshCounter, setRefreshCounter] = useState<number>(0);
	const [recordings, setRecordings] = useState<RecordingStatus[]>([]);

	// Initialize clients and connections
	useEffect(() => {
		const new_client = pluginsManager.applyFilter<RestBagClient>(
			`${props.api_datasource_id}-client`,
			null,
		);
		setClient(new_client);

		setButtonItem(
			"bag-list-refresh",
			<Button
				variant="ghost"
				onClick={() => setRefreshCounter((prev) => (prev + 1) % 10)}
				title="Refresh bag list"
			>
				<RefreshCwIcon />
			</Button>,
		);

		return () => {
			removeButtonItem("bag-list-refresh");
		};
	}, [props, pluginsManager, refreshCounter]);

	useEffect(() => {
		if (client) {
			setTimeout(async () => {
				const recs = await client!.getRecordings();
				setRecordings(recs);
			}, 100);

			setButtonItem(
				"bag-creator",
				<RecorderCreator
					client={client!}
					refresher={() => {
						setRefreshCounter((prev) => (prev + 1) % 10);
					}}
				/>,
			);
		}

		return () => {
			removeButtonItem("bag-creator");
		};
	}, [client, refreshCounter]);

	return (
		<div className="p-3">
			{recordings &&
				recordings.length > 0 &&
				recordings.map((rec) => (
					<Recorder
						key={rec.recording_id}
						recorder={rec}
						client={client!}
					/>
				))}
		</div>
	);
};

export function BagRecorderDefinition(): WidgetDefinition {
	const pluginsManager = usePluginsManager();

	return {
		id: "ros2-bag-recorder",
		name: "ROS2 Bags recorders",
		description: "Allows to record ROS2 bags",
		titleProp: "title",
		icon: <VideotapeIcon />,
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				api_datasource_id: {
					type: "string",
					title: "API Datasource ID",
				},
			},
			required: ["title"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/api_datasource_id",
					options: {
						async: true,
						asyncFunction: async () => {
							const datasources = Array.from(
								pluginsManager.applyFilter<Datasource[]>(
									PluginsHooks.AVAILABLE_DATASOURCES,
									[],
								),
							).filter(
								(ds) => ds.datasource_id === "rest-bag-source",
							);

							const values = Array.from(datasources).map(
								(ds) => ({
									value: ds.settings.id,
									label: ds.settings.title,
								}),
							);

							return values;
						},
					},
				} as ControlElement,
			],
		} as VerticalLayout,
		data: { title: "ROS2 Bag Recorders" },

		Component: (data: RecorderListProps) => <BagsRecorders {...data} />,
	};
}
