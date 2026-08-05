import { useEffect, useState } from "react"; // Import useCallback
import { ToggleLeftIcon, ToggleRightIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import {
	SelectedTopic,
	usePublisherDataSource,
	DatasourceTopic,
	DatasourceTopicFilter,
	PublisherDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { KeyControlType } from "@workspace/ormi-jsonforms";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	DigitalInput,
	DigitalComponent,
} from "@workspace/ui/combined/triggers";
import { toast } from "sonner";

/** Props for ToggleControl. */
interface ToggleControlData extends Record<string, unknown> {
	title: string;
	keyInput: DigitalInput;
	topic: SelectedTopic;
	valueOn: number;
	valueOff: number;
	publishOnOff: boolean;
	publicationFrequency: number;
}

/**
 * Toggle control widget.
 * @param props - Component props.
 * @returns React element.
 */
export function ToggleControl(props: ToggleControlData) {
	const { publishers } = usePublisherDataSource();

	const [toggle, setToggle] = useState(false);

	const handletoggle = () => {
		setToggle(!toggle);
	};

	useEffect(() => {
		const publish_freq = props.publicationFrequency || 30;
		const publish_period_ms = 1000 / publish_freq;
		const selectedTopic = props.topic;

		if (!selectedTopic?.topic) {
			console.warn("ToggleControl: Topic not selected.");
			return;
		}

		const publisher = publishers.get(selectedTopic.topic);

		if (!publisher) {
			const timer = setTimeout(() => {
				if (!publishers.get(selectedTopic.topic)) {
					toast(
						"Error: Publisher not found for topic " +
							selectedTopic.topic,
					);
				}
			}, 1000);
			return () => clearTimeout(timer);
		}

		const toggleFunction = () => {
			const topicType = props.topic.type || "number";

			if (toggle) {
				// For boolean topics, convert 1 to true
				const valueToPublish =
					topicType === "boolean"
						? Boolean(props.valueOn)
						: props.valueOn;
				publisher.publish(valueToPublish, topicType);
			} else if (props.publishOnOff) {
				// For boolean topics, convert 0 to false
				const valueToPublish =
					topicType === "boolean"
						? Boolean(props.valueOff)
						: props.valueOff;
				publisher.publish(valueToPublish, topicType);
			}
		};

		const publishInterval = setInterval(toggleFunction, publish_period_ms);

		return () => {
			clearInterval(publishInterval);
		};
	}, [
		props.topic,
		props.publicationFrequency,
		publishers,
		toggle,
		props.valueOn,
		props.valueOff,
		props.publishOnOff,
	]);

	return (
		<div className="flex flex-col justify-center items-center p-4 h-full gap-3">
			<div style={{ display: "none" }}>
				<DigitalComponent
					digitalInput={props.keyInput}
					onActive={handletoggle}
					onInactive={() => {}}
				/>
			</div>
			{/* Grid layout for movement controls */}
			<div
				data-active={toggle}
				style={{ width: "10rem" }}
				className={`
                    bg-black/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-black/10
                    flex justify-center items-center select-none cursor-pointer
                    hover:bg-black/20 hover:scale-110 transition-all duration-100
                    data-[active=true]:bg-green-600/20 dark:data-[active=true]:bg-green-500/20 data-[active=true]:scale-110
                `}
			>
				<span
					onClick={handletoggle}
					style={{
						display: "flex",
						justifyContent: "space-evenly",
						width: "100%",
					}}
				>
					{toggle ? <ToggleRightIcon /> : <ToggleLeftIcon />}
				</span>
			</div>
		</div>
	);
}

/**
 * Widget definition for ToggleControl.
 * @returns Widget definition.
 */
function ToggleWidget(data: ToggleControlData) {
	return data.topic ? (
		<PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
			<ToggleControl {...data} />
		</PublisherDataSourcesProvider>
	) : (
		<div className="flex justify-center items-center h-full text-muted-foreground">
			Please select a topic in the widget configuration.
		</div>
	);
}

export function ToggleControlDefinition(): WidgetDefinition<ToggleControlData> {
	return {
		id: "toggle-cmd-vel-widget",
		name: "Toggle control",
		description: "Toggle a topic",
		titleProp: "title",
		icon: <ToggleRightIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				keyInput: {
					type: "object",
					title: "Toggle Key",
				},
				topic: {
					type: "object",
					title: "Topic",
				},
				valueOn: {
					type: "number",
					title: "Value On",
					default: "1",
				},
				valueOff: {
					type: "number",
					title: "Value Off",
					default: "0",
				},
				publishOnOff: {
					type: "boolean",
					title: "Publish when toggle is Off",
					default: false,
				},
				publicationFrequency: {
					type: "number",
					title: "Publication Frequency (Hz)",
					default: 30,
					minimum: 1,
				},
			},
			required: ["title", "topic", "keyInput", "valueOn", "valueOff"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Key",
					scope: "#/properties/keyInput",
				} as KeyControlType,
				{
					type: "TopicSelect",
					scope: "#/properties/topic",
					options: {
						dataRequirements: {
							accepts: ["number", "boolean"],
						},
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/valueOn",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/valueOff",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/publishOnOff",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/publicationFrequency",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Toggle Control",
		},
		Component: ToggleWidget,
	};
}
