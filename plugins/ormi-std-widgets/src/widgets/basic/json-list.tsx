import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	SelectedTopic,
	useLocalDataSource,
	DatasourceTopic,
	LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@workspace/ui/components/card";
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@workspace/ui/components/collapsible";
import { FileIcon, ArrowDown } from "lucide-react";
import { useState, useRef, useEffect, useMemo, memo } from "react";

/** Props for JsonList. */
interface JsonListProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
}

// Memoized Card component for better performance
const MemoizedJsonCard = memo(
	({
		topic,
		dataItem,
		timestamp,
		itemId,
	}: {
		topic: SelectedTopic;
		dataItem: any;
		timestamp: string;
		itemId: string;
	}) => (
		<Card key={itemId} className="m-2">
			<CardHeader>
				<CardTitle>{topic.topic}</CardTitle>
				<CardDescription>
					{topic.type} - {timestamp}
				</CardDescription>
			</CardHeader>
			<Collapsible className="w-full">
				<CollapsibleTrigger
					asChild
					className="p-3 cursor-pointer flex items-center w-full"
				>
					<Button variant="ghost"> Open/Hide </Button>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent>
						<pre
							className="shadow-inner-md rounded-md m-3 p-1"
							style={{
								boxShadow:
									"5px 5px 16px 0px rgba(0,0,0,0.1) inset",
								backgroundColor: "darkslategrey",
								color: "white",
							}}
						>
							{JSON.stringify(dataItem, null, 2)}
						</pre>
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	),
);

/**
 * JSON list widget body.
 * @param props - Component props.
 * @returns React element.
 */
function JsonList(props: JsonListProps) {
	const { getSource } = useLocalDataSource();
	const containerRef = useRef<HTMLDivElement>(null);
	const prevDataLengthRef = useRef(0);
	const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
	const [isAtBottom, setIsAtBottom] = useState(true);

	// Store stable timestamps for items without their own timestamp
	const timestampMapRef = useRef<Map<string, string>>(new Map());

	// Process the data only when source changes
	const processedData = useMemo(() => {
		const result: Array<{
			dataItem: any;
			timestamp: string;
			itemId: string;
		}> = [];

		const source = getSource(props.topic);
		if (source) {
			source.data.forEach((dataItem, dataIndex) => {
				const itemId = `0-${dataIndex}`;

				let timestamp: string;
				if ((dataItem as any)?.timestamp) {
					// Use the item's own timestamp
					timestamp = (dataItem as any).timestamp;
				} else {
					// Check if we already have a stable timestamp for this item
					if (timestampMapRef.current.has(itemId)) {
						timestamp = timestampMapRef.current.get(itemId)!;
					} else {
						// Create a new stable timestamp for this item
						timestamp = new Date().toISOString();
						timestampMapRef.current.set(itemId, timestamp);
					}
				}

				result.push({
					dataItem,
					timestamp,
					itemId,
				});
			});
		}

		return result;
	}, [getSource, props.topic]);

	// Track total number of data items for auto-scrolling detection
	const totalDataItems = processedData.length;

	// Auto scroll to bottom when new data is received (with smooth scrolling)
	useEffect(() => {
		if (
			isAutoScrollEnabled &&
			totalDataItems > prevDataLengthRef.current &&
			containerRef.current
		) {
			containerRef.current.scrollTo({
				top: containerRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
		prevDataLengthRef.current = totalDataItems;
	}, [totalDataItems, isAutoScrollEnabled]);

	// Handle manual scrolling - if user scrolls up, disable auto-scroll
	const handleScroll = () => {
		if (!containerRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
		// Consider "at bottom" when within 100px of the bottom
		const atBottom = scrollTop + clientHeight >= scrollHeight - 100;

		setIsAtBottom(atBottom);
		if (atBottom) {
			setIsAutoScrollEnabled(true);
		} else {
			setIsAutoScrollEnabled(false);
		}
	};

	// Function to scroll to bottom
	const scrollToBottom = () => {
		if (containerRef.current) {
			containerRef.current.scrollTo({
				top: containerRef.current.scrollHeight,
				behavior: "smooth",
			});
			setIsAutoScrollEnabled(true);
			setIsAtBottom(true);
		}
	};

	// Simple virtualization - only render items that might be visible
	const renderVirtualizedItems = () => {
		// If small number of items, render all
		if (processedData.length < 50) {
			return processedData.map((item) => (
				<MemoizedJsonCard
					key={item.itemId}
					topic={props.topic}
					dataItem={item.dataItem}
					timestamp={item.timestamp}
					itemId={item.itemId}
				/>
			));
		}

		// Otherwise, render just the last 50 items for better performance
		// This is a simple approach - a full virtual list library would be better for very large datasets
		return processedData
			.slice(-50)
			.map((item) => (
				<MemoizedJsonCard
					key={item.itemId}
					topic={props.topic}
					dataItem={item.dataItem}
					timestamp={item.timestamp}
					itemId={item.itemId}
				/>
			));
	};

	return (
		<div className="relative h-full">
			<div
				ref={containerRef}
				style={{
					height: "100%",
					overflow: "auto",
					display: "flex",
					flexDirection: "column",
				}}
				className="p-3 gap-3"
				onScroll={handleScroll}
			>
				{renderVirtualizedItems()}
			</div>

			{/* Fixed position button that appears when not at bottom */}
			{!isAtBottom && (
				<Button
					onClick={scrollToBottom}
					className="absolute bottom-4 right-4 rounded-full p-2 shadow-lg"
					size="icon"
					variant="secondary"
				>
					<ArrowDown size={20} />
				</Button>
			)}
		</div>
	);
}

/**
 * Widget definition for JsonList.
 * @returns Widget definition.
 */
function JsonListWidget(data: JsonListProps) {
	return (
		<LocalDataSourcesProvider
			SelectedTopics={[data.topic]}
			buffersSize={1000}
		>
			<JsonList {...data} />
		</LocalDataSourcesProvider>
	);
}

export function JsonListDefinition(): WidgetDefinition<JsonListProps> {
	return {
		id: "json-List-widget",
		name: "Json List",
		description: "Display a json List",
		titleProp: "title",
		icon: <FileIcon />,
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
			},
			required: ["title", "topic"],
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
				} as TopicSelectElement,
			],
		} as VerticalLayout,

		data: {
			title: "Json List",
		},
		Component: JsonListWidget,
	};
}
