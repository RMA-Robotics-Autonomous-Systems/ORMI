import React, { useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { CheckCircle2, XCircle, Info, Plus, Wifi, WifiOff } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import {
	DatasourceTopic,
	deriveHealth,
} from "../../datasources/datasource-interface";
import { useGlobalDataSources } from "../../datasources/components/global-datasource-provider";
import { DataRequirements } from "../../widgets/widget-interface";
import { TopicCompatibilityResult } from "../../widgets/topic-compatibility";
import { TopicCreatorDialog } from "./topic-creator-dialog";

/** Props for TopicBrowser. */
interface TopicBrowserProps {
	topics: DatasourceTopic[];
	selectedTopic: DatasourceTopic | null;
	onTopicSelect: (topic: DatasourceTopic) => void;
	compatibilityAnalysis: Map<string, TopicCompatibilityResult>;
	requirements?: DataRequirements;
	searchTerm: string;
	showOnlyCompatible: boolean;
	isLoading: boolean;
	onTopicCreated?: (topic: DatasourceTopic) => void;
}

/**
 * Browser list for available topics.
 * @param props - Component props.
 * @returns React element.
 */
export const TopicBrowser: React.FC<TopicBrowserProps> = ({
	topics,
	selectedTopic,
	onTopicSelect,
	compatibilityAnalysis,
	requirements,
	searchTerm,
	showOnlyCompatible,
	isLoading,
	onTopicCreated,
}) => {
	const [isCreatorOpen, setIsCreatorOpen] = useState(false);
	const { datasourceStatuses } = useGlobalDataSources();

	const handleTopicCreated = (newTopic: DatasourceTopic) => {
		if (onTopicCreated) {
			onTopicCreated(newTopic);
		}
		setIsCreatorOpen(false);
	};

	const getCompatibilityStatus = (topic: DatasourceTopic) => {
		if (!requirements) return "unknown";

		const key = `${topic.topic}@${topic.source.id}`;
		const analysis = compatibilityAnalysis.get(key);

		if (!analysis) return "analyzing";
		if (analysis.isCompatible) return "compatible";
		return "incompatible";
	};

	const getCompatibilityIcon = (status: string) => {
		switch (status) {
			case "compatible":
				return (
					<CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
				);
			case "incompatible":
				return <XCircle className="w-4 h-4 text-destructive" />;
			case "analyzing":
				return <Spinner className="w-4 h-4" />;
			default:
				return <Info className="w-4 h-4 text-muted-foreground" />;
		}
	};

	// Badges are `whitespace-nowrap shrink-0` by default, so a ROS type string
	// walks straight out of a narrow column. They wrap as a group and the text
	// inside breaks, rather than the row deciding how wide the panel is.
	const badgeClass = "max-w-full text-xs break-all whitespace-normal";

	const getTypeDisplay = (topic: DatasourceTopic) => {
		if (topic.type) {
			return (
				<>
					<Badge variant="secondary" className={badgeClass}>
						{topic.type}
					</Badge>
					{topic.rawType && topic.rawType !== topic.type && (
						<Badge variant="outline" className={badgeClass}>
							{topic.rawType}
						</Badge>
					)}
				</>
			);
		}

		if (topic.rawType) {
			return (
				<Badge variant="outline" className={badgeClass}>
					{topic.rawType}*
				</Badge>
			);
		}

		return (
			<Badge
				variant="outline"
				className={cn(badgeClass, "text-muted-foreground")}
			>
				unknown
			</Badge>
		);
	};

	// A topic appearing in the list means its datasource enumerated it at some
	// point, which is not the same as that datasource being online now: a robot
	// that dropped keeps its topics in the list until the next poll. Reporting
	// every row as live told the operator a disconnected robot was reachable,
	// and the picker is exactly where that costs them a wasted configuration.
	const getConnectionStatus = (topic: DatasourceTopic) => {
		const health = deriveHealth(datasourceStatuses.get(topic.source.id));

		if (health === "online") {
			return (
				<Wifi
					className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400"
					aria-label="Datasource online"
				/>
			);
		}

		if (health === "offline") {
			return (
				<WifiOff
					className="text-destructive h-3 w-3 shrink-0"
					aria-label="Datasource offline"
				/>
			);
		}

		return (
			<Spinner
				className="h-3 w-3 shrink-0"
				aria-label="Datasource connecting"
			/>
		);
	};

	if (isLoading) {
		return (
			<div className="flex h-full min-h-0 flex-col">
				{/* Header */}
				<div className="p-3 border-b flex-shrink-0">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">Topics</span>
					</div>
				</div>
				<div className="flex-1 flex items-center justify-center min-h-0">
					<div className="flex flex-col items-center gap-2">
						<Spinner className="w-6 h-6" />
						<span className="text-sm text-muted-foreground">
							Loading topics...
						</span>
					</div>
				</div>
			</div>
		);
	}

	if (topics.length === 0) {
		return (
			<div className="flex h-full min-h-0 flex-col">
				{/* Header */}
				<div className="p-3 border-b flex-shrink-0">
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium">Topics (0)</span>
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2"
							onClick={() => setIsCreatorOpen(true)}
						>
							<Plus className="w-3 h-3 mr-1" />
							Create
						</Button>
					</div>
				</div>
				<div className="flex-1 flex items-center justify-center p-4 min-h-0">
					<div className="text-center">
						<Info className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
						<p className="text-sm text-muted-foreground">
							{searchTerm
								? "No topics match your search"
								: "No topics available"}
						</p>
						{showOnlyCompatible && (
							<p className="text-xs text-muted-foreground mt-1">
								Try disabling the compatibility filter
							</p>
						)}
					</div>
				</div>
				{/* Topic Creator Dialog */}
				<TopicCreatorDialog
					isOpen={isCreatorOpen}
					onClose={() => setIsCreatorOpen(false)}
					onTopicCreated={handleTopicCreated}
					requirements={requirements}
				/>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/* Header */}
			<div className="p-3 border-b flex-shrink-0">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium">
						Topics ({topics.length})
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-2"
						onClick={() => setIsCreatorOpen(true)}
					>
						<Plus className="w-3 h-3 mr-1" />
						Create
					</Button>
				</div>
			</div>

			{/* Topic List. A plain overflow container rather than a Radix
			    ScrollArea: the ScrollArea viewport puts `display: table` on its
			    child, so the child sizes to its content and neither `min-w-0`
			    nor `truncate` can engage — long topic names ran past the
			    panel's own border. This is also the only scroller in the
			    column; the panel around it must not add a second. */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="p-2 space-y-1">
					{topics.map((topic) => {
						const isSelected =
							selectedTopic?.topic === topic.topic &&
							selectedTopic?.source.id === topic.source.id;
						const compatibilityStatus =
							getCompatibilityStatus(topic);

						return (
							<div
								key={`${topic.topic}@${topic.source.id}`}
								className={cn(
									"min-w-0 cursor-pointer rounded-lg border p-3 transition-colors",
									"hover:bg-muted/50",
									isSelected &&
										"bg-primary/10 border-primary",
								)}
								onClick={() => onTopicSelect(topic)}
							>
								{/* Topic Header. Every level between the row and
								    the truncating text needs `min-w-0`, or the
								    flex item floors at its content width and
								    `truncate` never applies. */}
								<div className="mb-2 flex min-w-0 items-start justify-between gap-2">
									<div className="min-w-0 flex-1">
										<div className="mb-1 flex min-w-0 items-center gap-2">
											<span
												className="min-w-0 truncate text-sm font-medium"
												title={topic.topic}
											>
												{topic.topic}
											</span>
											<span className="shrink-0">
												{getCompatibilityIcon(
													compatibilityStatus,
												)}
											</span>
										</div>
										<div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
											<span
												className="min-w-0 truncate"
												title={topic.source.title}
											>
												{topic.source.title}
											</span>
											<span className="shrink-0">
												{getConnectionStatus(topic)}
											</span>
										</div>
									</div>
								</div>

								{/* Topic Types */}
								<div className="flex min-w-0 flex-wrap items-center gap-1">
									{getTypeDisplay(topic)}
								</div>

								{/* Compatibility Info */}
								{requirements &&
									compatibilityStatus === "compatible" && (
										<div className="mt-2 pt-2 border-t">
											<div className="text-xs text-green-600 dark:text-green-400">
												✓ Compatible with requirements
											</div>
										</div>
									)}

								{requirements &&
									compatibilityStatus === "incompatible" && (
										<div className="mt-2 pt-2 border-t">
											<div className="text-xs text-destructive">
												✗ Not compatible
											</div>
										</div>
									)}
							</div>
						);
					})}
				</div>
			</div>

			{/* Topic Creator Dialog */}
			<TopicCreatorDialog
				isOpen={isCreatorOpen}
				onClose={() => setIsCreatorOpen(false)}
				onTopicCreated={handleTopicCreated}
				requirements={requirements}
			/>
		</div>
	);
};
