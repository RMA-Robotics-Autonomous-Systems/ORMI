import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { DatasourceTopic } from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
	Table,
} from "@workspace/ui/components/table";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import { Badge } from "@workspace/ui/components/badge";
import { ListIcon, Info } from "lucide-react";
import { useState, useEffect, useCallback, memo } from "react";
import { topicPreviewRegistry } from "./topic-preview-registry";

/**
 * Lazy preview component - only renders when HoverCard is open
 */
function LazyTopicPreview({ topic }: { topic: DatasourceTopic }) {
	const previewConfig = topicPreviewRegistry.get(topic.type);
	const fallbackPreview = topicPreviewRegistry.get("__fallback__");

	return previewConfig
		? previewConfig.component(topic)
		: (fallbackPreview?.component(topic) ?? null);
}

/**
 * Individual topic row - memoized for performance
 * HoverCard is only rendered when user starts hovering (via mouse enter)
 */
const TopicRow = memo(
	function TopicRow({ topic }: { topic: DatasourceTopic }) {
		const [showHoverCard, setShowHoverCard] = useState(false);
		const [isHovering, setIsHovering] = useState(false);

		// Only mount the HoverCard when user hovers over the trigger area
		const handleMouseEnter = useCallback(() => {
			setIsHovering(true);
			// Small delay before showing to avoid flash on quick mouse movements
			const timer = setTimeout(() => setShowHoverCard(true), 100);
			return () => clearTimeout(timer);
		}, []);

		const handleMouseLeave = useCallback(() => {
			setIsHovering(false);
			// Keep HoverCard mounted briefly in case user hovers back
			setTimeout(() => {
				setShowHoverCard((prev) => prev && false);
			}, 500);
		}, []);

		return (
			<TableRow>
				<TableCell className="font-medium">
					{topic.source.title}
				</TableCell>
				<TableCell className="font-medium">
					<div
						className="flex items-center gap-2 cursor-pointer w-fit"
						onMouseEnter={handleMouseEnter}
						onMouseLeave={handleMouseLeave}
					>
						{showHoverCard ? (
							<HoverCard open={isHovering} openDelay={200}>
								<HoverCardTrigger asChild>
									<div className="flex items-center gap-2">
										{topic.topic}
										<Info className="w-3 h-3 text-muted-foreground" />
									</div>
								</HoverCardTrigger>
								<HoverCardContent
									style={{ width: "min(400px, 90vw)" }}
									side="right"
								>
									<LazyTopicPreview topic={topic} />
								</HoverCardContent>
							</HoverCard>
						) : (
							<>
								{topic.topic}
								<Info className="w-3 h-3 text-muted-foreground" />
							</>
						)}
					</div>
				</TableCell>
				<TableCell>
					<Badge variant="secondary" className="text-xs">
						{topic.type}
					</Badge>
				</TableCell>
				<TableCell className="text-muted-foreground text-xs">
					{topic.rawType}
				</TableCell>
			</TableRow>
		);
	},
	(prevProps, nextProps) => {
		// Custom comparison - only re-render if topic identity changed
		return (
			prevProps.topic.topic === nextProps.topic.topic &&
			prevProps.topic.datasource_id === nextProps.topic.datasource_id &&
			prevProps.topic.type === nextProps.topic.type
		);
	},
);

/**
 * Topics list widget body.
 * @returns React element.
 */
function TopicsList() {
	const pluginsManager = usePluginsManager();

	const [topics, setTopics] = useState<DatasourceTopic[]>([]);

	useEffect(() => {
		const interval = setInterval(async () => {
			const current_topics = await pluginsManager.applyFilterAsync<
				DatasourceTopic[]
			>(PluginsHooks.AVAILABLE_TOPICS, []);

			// Only update if topics actually changed to prevent flickering
			setTopics((prevTopics) => {
				if (prevTopics.length !== current_topics.length) {
					return current_topics;
				}

				// Check if any topic changed
				const hasChanges = current_topics.some((newTopic, index) => {
					const prevTopic = prevTopics[index];
					return (
						!prevTopic ||
						prevTopic.topic !== newTopic.topic ||
						prevTopic.type !== newTopic.type ||
						prevTopic.datasource_id !== newTopic.datasource_id
					);
				});

				return hasChanges ? current_topics : prevTopics;
			});
		}, 2000); // Poll every 2s instead of 1s

		return () => {
			clearInterval(interval);
		};
	}, [pluginsManager]);

	return (
		<div style={{ width: "100%", height: "100%", overflow: "auto" }}>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Datasource</TableHead>
						<TableHead>Topic</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>RawType</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{topics.map((topic) => (
						<TopicRow
							key={`${topic.datasource_id}-${topic.topic}`}
							topic={topic}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/** Props for TopicsList widget. */
interface TopicsListProps extends Record<string, unknown> {
	title: string;
}

/**
 * Widget definition for TopicsList.
 * @returns Widget definition.
 */
export function TopicsListDefinition(): WidgetDefinition<TopicsListProps> {
	return {
		id: "topics-List-widget",
		name: "Topics List",
		description: "Display a Topics List",
		titleProp: "title",
		icon: <ListIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
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
			],
		} as VerticalLayout,

		data: {
			title: "Topics List",
		},
		Component: () => <TopicsList />,
	};
}
