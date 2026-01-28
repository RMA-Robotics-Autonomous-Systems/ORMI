import React, { useReducer, useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Search, Filter } from "lucide-react";

import {
	DatasourceTopic,
	SelectedTopic,
} from "../../datasources/datasource-interface";
import { DataRequirements } from "../../widgets/widget-interface";
import {
	analyzeTopicCompatibilityWithTrees,
	TopicCompatibilityResult,
	DualPropertyTree,
	findPropertyNodeByPath,
} from "../../widgets/topic-compatibility";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

import { TopicBrowser } from "../topic-selection/topic-browser";
import { TopicDetails } from "../topic-selection/topic-details";
import {
	topicSelectionReducer,
	initialTopicSelectionState,
	TopicSelectionState,
} from "../topic-selection/topic-selection-state";

interface TopicSelectionDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (selection: SelectedTopic) => void;
	requirements?: DataRequirements;
	initialValue?: SelectedTopic;
	label?: string;
}

export const TopicSelectionDialog: React.FC<TopicSelectionDialogProps> = ({
	isOpen,
	onClose,
	onSelect,
	requirements,
	initialValue,
	label = "Select Topic",
}) => {
	const pluginsManager = usePluginsManager();
	const [state, dispatch] = useReducer(
		topicSelectionReducer,
		initialTopicSelectionState,
	);
	const [isLoading, setIsLoading] = useState(false);

	// Load topics when dialog opens
	useEffect(() => {
		if (!isOpen) return;

		const loadTopics = async () => {
			setIsLoading(true);
			try {
				// Load all available topics
				const topics = await pluginsManager.applyFilterAsync<
					DatasourceTopic[]
				>(PluginsHooks.AVAILABLE_TOPICS, []);

				dispatch({ type: "SET_TOPICS", topics });
				dispatch({ type: "SET_REQUIREMENTS", requirements });

				// Set initial topic selection if provided
				if (initialValue) {
					const matchingTopic = topics.find(
						(t) =>
							t.topic === initialValue.topic &&
							t.source.id === initialValue.source.id,
					);
					if (matchingTopic) {
						dispatch({
							type: "SELECT_TOPIC",
							topic: matchingTopic,
						});
					}
				}

				// Start compatibility analysis (works with or without requirements)
				await analyzeAllTopics(topics, requirements);
			} catch (error) {
				console.error("Failed to load topics:", error);
			} finally {
				setIsLoading(false);
			}
		};

		loadTopics();
	}, [isOpen, pluginsManager, requirements, initialValue]);

	// Analyze compatibility for all topics
	const analyzeAllTopics = async (
		topics: DatasourceTopic[],
		reqs?: DataRequirements,
	) => {
		const analysisResults = new Map<string, TopicCompatibilityResult>();
		const propertyTrees = new Map<string, DualPropertyTree>();

		// Analyze topics in batches to avoid overwhelming the system
		const batchSize = 10;
		for (let i = 0; i < topics.length; i += batchSize) {
			const batch = topics.slice(i, i + batchSize);

			await Promise.all(
				batch.map(async (topic) => {
					const key = `${topic.topic}@${topic.source.id}`;
					try {
						const analysis =
							await analyzeTopicCompatibilityWithTrees(
								topic,
								reqs,
								pluginsManager,
							);
						analysisResults.set(key, analysis);
						if (analysis.propertyTree) {
							propertyTrees.set(key, analysis.propertyTree);
						}
					} catch (error) {
						console.warn(`Failed to analyze topic ${key}:`, error);
					}
				}),
			);
		}

		dispatch({
			type: "SET_COMPATIBILITY_ANALYSIS",
			analysis: analysisResults,
		});
		dispatch({ type: "SET_PROPERTY_TREES", trees: propertyTrees });

		// Handle initial property selection after analysis is complete
		if (initialValue && initialValue.property) {
			const matchingTopic = topics.find(
				(t) =>
					t.topic === initialValue.topic &&
					t.source.id === initialValue.source.id,
			);
			if (matchingTopic) {
				const topicKey = `${matchingTopic.topic}@${matchingTopic.source.id}`;
				const propertyTree = propertyTrees.get(topicKey);

				if (propertyTree) {
					// Property path is already in dot notation, use as-is
					const propertyPath = initialValue.property;

					// Try to find the property in webapp tree first, then raw tree
					let propertySource: "webapp" | "raw" = "webapp";
					let foundInWebapp = false;

					if (propertyTree.webapp) {
						foundInWebapp =
							findPropertyNodeByPath(
								propertyTree.webapp,
								propertyPath,
							) !== null;
					}

					if (!foundInWebapp && propertyTree.raw) {
						propertySource = "raw";
					}

					dispatch({
						type: "SELECT_PROPERTY",
						path: propertyPath,
						source: propertySource,
					});
					dispatch({ type: "SWITCH_TAB", tab: propertySource });
				}
			}
		}
	};

	const handleTopicSelect = (topic: DatasourceTopic) => {
		dispatch({ type: "SELECT_TOPIC", topic });
	};

	const handlePropertySelect = (path: string, source: "webapp" | "raw") => {
		dispatch({ type: "SELECT_PROPERTY", path, source });
	};

	const handleTopicCreated = async (newTopic: DatasourceTopic) => {
		// Add the new topic to the current topics list
		const updatedTopics = [...state.topics, newTopic];
		dispatch({ type: "SET_TOPICS", topics: updatedTopics });

		// Analyze the new topic for compatibility
		try {
			const key = `${newTopic.topic}@${newTopic.source.id}`;
			const analysis = await analyzeTopicCompatibilityWithTrees(
				newTopic,
				requirements,
				pluginsManager,
			);

			const newAnalysis = new Map(state.compatibilityAnalysis);
			newAnalysis.set(key, analysis);
			dispatch({
				type: "SET_COMPATIBILITY_ANALYSIS",
				analysis: newAnalysis,
			});

			if (analysis.propertyTree) {
				const newTrees = new Map(state.propertyTrees);
				newTrees.set(key, analysis.propertyTree);
				dispatch({ type: "SET_PROPERTY_TREES", trees: newTrees });
			}

			// Automatically select the new topic
			dispatch({ type: "SELECT_TOPIC", topic: newTopic });
		} catch (error) {
			console.warn("Failed to analyze created topic:", error);
			// Still select the topic even if analysis fails
			dispatch({ type: "SELECT_TOPIC", topic: newTopic });
		}
	};

	const handleConfirmSelection = () => {
		if (!state.selectedTopic) return;

		// Property path is already in dot notation, use as-is
		const propertyPath = state.selectedProperty || "";

		const selection: SelectedTopic = {
			topic: state.selectedTopic.topic,
			datasource_id: state.selectedTopic.datasource_id,
			source: state.selectedTopic.source,
			type: state.selectedTopic.type,
			rawType: state.selectedTopic.rawType,
			property: propertyPath,
			bufferSize: state.bufferSize,
		};

		onSelect(selection);
		onClose();
	};

	const handleCancel = () => {
		onClose();
	};

	const canConfirm =
		state.selectedTopic &&
		(!requirements ||
			state.compatibilityAnalysis.get(
				`${state.selectedTopic.topic}@${state.selectedTopic.source.id}`,
			)?.isCompatible);

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent size="large">
				<DialogHeader>
					<DialogTitle>{label}</DialogTitle>
					{!requirements && (
						<p className="text-sm text-muted-foreground">
							No data requirements specified - any topic can be
							selected
						</p>
					)}
					<div className="flex items-center gap-2 mt-2">
						<div className="relative flex-1 gap-2">
							<Input
								placeholder="Search topics..."
								value={state.searchTerm}
								onChange={(e) =>
									dispatch({
										type: "SET_SEARCH",
										term: e.target.value,
									})
								}
								className="pl-10"
							/>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								dispatch({
									type: "TOGGLE_COMPATIBILITY_FILTER",
								})
							}
							className={
								state.showOnlyCompatible
									? "bg-primary text-primary-foreground"
									: ""
							}
							disabled={!requirements}
						>
							<Filter className="w-4 h-4 mr-2" />
							Compatible Only
						</Button>
					</div>
				</DialogHeader>

				<div className="flex gap-4 overflow-hidden">
					{/* Left Panel - Topic Browser */}
					<div
						className="w-96 flex flex-col border rounded-lg"
						style={{ height: "50dvh", overflowY: "auto" }}
					>
						<TopicBrowser
							topics={state.filteredTopics}
							selectedTopic={state.selectedTopic}
							onTopicSelect={handleTopicSelect}
							compatibilityAnalysis={state.compatibilityAnalysis}
							requirements={requirements}
							searchTerm={state.searchTerm}
							showOnlyCompatible={state.showOnlyCompatible}
							isLoading={isLoading}
							onTopicCreated={handleTopicCreated}
						/>
					</div>

					<Separator orientation="vertical" />

					{/* Right Panel - Topic Details */}
					<div
						className="flex-1 flex flex-col"
						style={{ height: "50dvh", overflowY: "auto" }}
					>
						<TopicDetails
							topic={state.selectedTopic}
							analysis={
								state.selectedTopic
									? state.compatibilityAnalysis.get(
											`${state.selectedTopic.topic}@${state.selectedTopic.source.id}`,
										) || null
									: null
							}
							propertyTree={
								state.selectedTopic
									? state.propertyTrees.get(
											`${state.selectedTopic.topic}@${state.selectedTopic.source.id}`,
										) || null
									: null
							}
							selectedProperty={state.selectedProperty}
							selectedPropertySource={
								state.selectedPropertySource
							}
							onPropertySelect={handlePropertySelect}
							activeTab={state.activeTab}
							onTabChange={(tab: "webapp" | "raw") =>
								dispatch({ type: "SWITCH_TAB", tab })
							}
							bufferSize={state.bufferSize}
							onBufferSizeChange={(size: number) =>
								dispatch({ type: "SET_BUFFER_SIZE", size })
							}
							requirements={requirements}
						/>
					</div>
				</div>

				<DialogFooter>
					<div className="flex items-center justify-between w-full">
						{/* Selection Preview */}
						<div className="flex-1 text-sm text-muted-foreground">
							{state.selectedTopic && (
								<span>
									Selected:{" "}
									<strong>{state.selectedTopic.topic}</strong>
									{state.selectedProperty && (
										<span>
											{" "}
											→{" "}
											<strong>
												{state.selectedProperty}
											</strong>{" "}
											({state.selectedPropertySource})
										</span>
									)}
								</span>
							)}
						</div>

						{/* Action Buttons */}
						<div className="flex gap-2">
							<Button variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
							<Button
								onClick={handleConfirmSelection}
								disabled={!canConfirm}
							>
								Select
							</Button>
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
