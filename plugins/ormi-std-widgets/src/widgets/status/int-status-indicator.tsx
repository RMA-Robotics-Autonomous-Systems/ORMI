import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import {
	SelectedTopic,
	useLocalDataSource,
	DatasourceTopic,
	DatasourceTopicFilter,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { CircleAlertIcon } from "lucide-react";
import { TypeAnimation } from "react-type-animation";

/** Props for IntStatusIndicator. */
interface IntStatusIndicatorProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	status: {
		name: string;
		color: string;
	}[];
	use3D?: boolean;
}

/**
 * Integer status indicator widget body.
 * @param props - Component props.
 * @returns React element.
 */
function IntStatusIndicator(props: IntStatusIndicatorProps) {
	const { sources, health } = useLocalDataSource();

	const sources_keys = Array.from(sources.keys());
	const value =
		sources_keys.length > 0 ? sources.get(sources_keys[0]!)!.data[0] : 0;

	// Convert boolean to number if needed, or keep integer value
	const parsedValue =
		typeof value === "boolean"
			? value
				? 1
				: 0
			: typeof value === "number"
				? value
				: parseInt(String(value));
	// display the status based on the value and the props.status index
	// if the value is 0, the status is the first element of the array
	// if the value is 1, the status is the second element of the array

	// if the value is greater than the length of the array, the status is undifined

	const statu = props.status[parsedValue] || {
		name: "Undefined",
		color: "gray",
	};

	return (
		<DatasourceGate health={health} title={props.topic.source.title}>
			<div
				style={{
					backgroundColor: statu.color,
					color: "white",
					height: "100%",
					width: "100%",
					display: "grid",
					alignItems: "center",
					justifyContent: "center",
					fontSize: "xxx-large",
					transition: "all 0.5s ease",
				}}
			>
				<TypeAnimation
					speed={75}
					cursor={false}
					key={statu.name}
					sequence={[statu.name]}
					repeat={1}
				/>
			</div>
		</DatasourceGate>
	);
}

/**
 * Widget definition for integer status indicator.
 * @returns Widget definition.
 */
function IntStatusIndicatorWidget(data: IntStatusIndicatorProps) {
	return (
		<LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
			<IntStatusIndicator {...data} />
		</LocalDataSourcesProvider>
	);
}

export function IntStatusIndicatorDefinition(): WidgetDefinition<IntStatusIndicatorProps> {
	return {
		id: "int-status-indicator",
		name: "Status indicator",
		description: "Status from an integer value",
		titleProp: "title",

		icon: <CircleAlertIcon />,

		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				topic: {
					type: "object",
					title: "Topic",
				},
				status: {
					type: "array",
					title: "Status",
					items: {
						type: "object",
						properties: {
							name: {
								type: "string",
								title: "Name",
							},
							color: {
								type: "string",
								title: "Color",
							},
						},
					},
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
					type: "TopicSelect",
					scope: "#/properties/topic",
					options: {
						dataRequirements: {
							accepts: ["number", "boolean"], // Accept primitive types - property selection will be available
						},
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/status",
					options: {
						detail: {
							type: "VerticalLayout",
							elements: [
								{
									type: "Control",
									scope: "#/properties/name",
								} as ControlElement,
								{
									type: "Control",
									scope: "#/properties/color",
									options: {
										color: true,
									},
								} as ControlElement,
							],
						},
					},
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Status",
			use3D: false,
		},
		Component: IntStatusIndicatorWidget,
	};
}
