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
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import { Badge } from "@workspace/ui/components/badge";
import { ListIcon, Info, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useEffect, useCallback, memo, useRef, useMemo } from "react";
import { topicPreviewRegistry } from "./topic-preview-registry";

type SortKey = "datasource" | "topic" | "type" | "rawType";
type SortDirection = "asc" | "desc";

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
		const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

		useEffect(() => {
			return () => {
				if (showTimerRef.current) {
					clearTimeout(showTimerRef.current);
					showTimerRef.current = null;
				}
				if (hideTimerRef.current) {
					clearTimeout(hideTimerRef.current);
					hideTimerRef.current = null;
				}
			};
		}, []);

		// Only mount the HoverCard when user hovers over the trigger area
		const handleMouseEnter = useCallback(() => {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
			setIsHovering(true);
			// Small delay before showing to avoid flash on quick mouse movements
			if (showTimerRef.current) {
				clearTimeout(showTimerRef.current);
			}
			showTimerRef.current = setTimeout(() => {
				setShowHoverCard(true);
				showTimerRef.current = null;
			}, 100);
		}, []);

		const handleMouseLeave = useCallback(() => {
			setIsHovering(false);
			if (showTimerRef.current) {
				clearTimeout(showTimerRef.current);
				showTimerRef.current = null;
			}
			// Keep HoverCard mounted briefly in case user hovers back
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
			}
			hideTimerRef.current = setTimeout(() => {
				setShowHoverCard(false);
				hideTimerRef.current = null;
			}, 500);
		}, []);

		return (
			<TableRow>
				<TableCell className="font-medium">
					{topic.source.title}
				</TableCell>
				<TableCell className="font-medium">
					<div
						className="inline-flex items-center gap-2 cursor-pointer"
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
	const [searchQuery, setSearchQuery] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("topic");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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

	const displayedTopics = useMemo(() => {
		const normalizedQuery = searchQuery.trim().toLowerCase();

		const filteredTopics = normalizedQuery
			? topics.filter((topic) => {
					return (
						topic.source.title
							.toLowerCase()
							.includes(normalizedQuery) ||
						topic.topic.toLowerCase().includes(normalizedQuery) ||
						topic.type.toLowerCase().includes(normalizedQuery) ||
						topic.rawType.toLowerCase().includes(normalizedQuery)
					);
				})
			: topics;

		const sortedTopics = [...filteredTopics].sort((a, b) => {
			const extractValue = (topic: DatasourceTopic) => {
				switch (sortKey) {
					case "datasource":
						return topic.source.title;
					case "topic":
						return topic.topic;
					case "type":
						return topic.type;
					case "rawType":
						return topic.rawType;
				}
			};

			const left = extractValue(a);
			const right = extractValue(b);

			const result = left.localeCompare(right, undefined, {
				numeric: true,
				sensitivity: "base",
			});

			if (result === 0) {
				return `${a.datasource_id}:${a.topic}`.localeCompare(
					`${b.datasource_id}:${b.topic}`,
				);
			}

			return sortDirection === "asc" ? result : -result;
		});

		return sortedTopics;
	}, [topics, searchQuery, sortKey, sortDirection]);

	const handleSort = useCallback((key: SortKey) => {
		setSortKey((currentSortKey) => {
			if (currentSortKey === key) {
				setSortDirection((currentDirection) =>
					currentDirection === "asc" ? "desc" : "asc",
				);
				return currentSortKey;
			}

			setSortDirection("asc");
			return key;
		});
	}, []);

	const renderSortIcon = useCallback(
		(key: SortKey) => {
			if (sortKey !== key) {
				return (
					<ArrowUpDown className="h-4 w-4 text-muted-foreground" />
				);
			}

			return sortDirection === "asc" ? (
				<ArrowUp className="h-4 w-4" />
			) : (
				<ArrowDown className="h-4 w-4" />
			);
		},
		[sortDirection, sortKey],
	);

	return (
		<div style={{ width: "100%", height: "100%", overflow: "auto" }}>
			<div className="p-2">
				<div className="relative w-full max-w-md">
					<Input
						className="pl-9"
						placeholder="Search topics, datasource, type..."
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
					/>
				</div>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleSort("datasource")}
							>
								Datasource
								{renderSortIcon("datasource")}
							</Button>
						</TableHead>
						<TableHead>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleSort("topic")}
							>
								Topic
								{renderSortIcon("topic")}
							</Button>
						</TableHead>
						<TableHead>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleSort("type")}
							>
								Type
								{renderSortIcon("type")}
							</Button>
						</TableHead>
						<TableHead>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => handleSort("rawType")}
							>
								RawType
								{renderSortIcon("rawType")}
							</Button>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{displayedTopics.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={4}
								className="text-center text-muted-foreground"
							>
								No topics found.
							</TableCell>
						</TableRow>
					) : (
						displayedTopics.map((topic) => (
							<TopicRow
								key={`${topic.datasource_id}-${topic.topic}`}
								topic={topic}
							/>
						))
					)}
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
