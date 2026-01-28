import {
	DatasourceTopic,
	SelectedTopic,
} from "../../datasources/datasource-interface";
import { DataRequirements } from "../../widgets/widget-interface";
import {
	TopicCompatibilityResult,
	DualPropertyTree,
} from "../../widgets/topic-compatibility";

export interface TopicSelectionState {
	// Data
	topics: DatasourceTopic[];
	filteredTopics: DatasourceTopic[];
	selectedTopic: DatasourceTopic | null;
	selectedProperty: string | null;
	selectedPropertySource: "webapp" | "raw" | null;

	// UI state
	searchTerm: string;
	showOnlyCompatible: boolean;
	activeTab: "webapp" | "raw";
	bufferSize: number;

	// Analysis cache
	compatibilityAnalysis: Map<string, TopicCompatibilityResult>;
	propertyTrees: Map<string, DualPropertyTree>;

	// Configuration
	requirements?: DataRequirements;
}

export type TopicSelectionAction =
	| { type: "SET_TOPICS"; topics: DatasourceTopic[] }
	| { type: "SET_REQUIREMENTS"; requirements?: DataRequirements }
	| { type: "SET_SEARCH"; term: string }
	| { type: "SELECT_TOPIC"; topic: DatasourceTopic }
	| { type: "SELECT_PROPERTY"; path: string; source: "webapp" | "raw" }
	| { type: "SET_BUFFER_SIZE"; size: number }
	| { type: "TOGGLE_COMPATIBILITY_FILTER" }
	| { type: "SWITCH_TAB"; tab: "webapp" | "raw" }
	| {
			type: "SET_COMPATIBILITY_ANALYSIS";
			analysis: Map<string, TopicCompatibilityResult>;
	  }
	| { type: "SET_PROPERTY_TREES"; trees: Map<string, DualPropertyTree> };

export const initialTopicSelectionState: TopicSelectionState = {
	topics: [],
	filteredTopics: [],
	selectedTopic: null,
	selectedProperty: null,
	selectedPropertySource: null,
	searchTerm: "",
	showOnlyCompatible: true,
	activeTab: "webapp",
	bufferSize: 1,
	compatibilityAnalysis: new Map(),
	propertyTrees: new Map(),
	requirements: undefined,
};

const filterTopics = (
	topics: DatasourceTopic[],
	searchTerm: string,
	showOnlyCompatible: boolean,
	compatibilityAnalysis: Map<string, TopicCompatibilityResult>,
): DatasourceTopic[] => {
	let filtered = topics;

	// Apply search filter
	if (searchTerm.trim()) {
		const searchLower = searchTerm.toLowerCase();
		filtered = filtered.filter(
			(topic) =>
				topic.topic.toLowerCase().includes(searchLower) ||
				topic.type.toLowerCase().includes(searchLower) ||
				topic.rawType?.toLowerCase().includes(searchLower) ||
				topic.source.title.toLowerCase().includes(searchLower),
		);
	}

	// Apply compatibility filter
	if (showOnlyCompatible) {
		filtered = filtered.filter((topic) => {
			const key = `${topic.topic}@${topic.source.id}`;
			const analysis = compatibilityAnalysis.get(key);
			return analysis?.isCompatible ?? false;
		});
	}

	return filtered;
};

export const topicSelectionReducer = (
	state: TopicSelectionState,
	action: TopicSelectionAction,
): TopicSelectionState => {
	switch (action.type) {
		case "SET_TOPICS":
			const filteredTopics = filterTopics(
				action.topics,
				state.searchTerm,
				state.showOnlyCompatible,
				state.compatibilityAnalysis,
			);
			return {
				...state,
				topics: action.topics,
				filteredTopics,
			};

		case "SET_REQUIREMENTS":
			return {
				...state,
				requirements: action.requirements,
			};

		case "SET_SEARCH":
			const newFilteredTopics = filterTopics(
				state.topics,
				action.term,
				state.showOnlyCompatible,
				state.compatibilityAnalysis,
			);
			return {
				...state,
				searchTerm: action.term,
				filteredTopics: newFilteredTopics,
			};

		case "SELECT_TOPIC":
			return {
				...state,
				selectedTopic: action.topic,
				selectedProperty: null,
				selectedPropertySource: null,
			};

		case "SELECT_PROPERTY":
			return {
				...state,
				selectedProperty: action.path,
				selectedPropertySource: action.source,
			};

		case "SET_BUFFER_SIZE":
			return {
				...state,
				bufferSize: action.size,
			};

		case "TOGGLE_COMPATIBILITY_FILTER":
			const toggledFilteredTopics = filterTopics(
				state.topics,
				state.searchTerm,
				!state.showOnlyCompatible,
				state.compatibilityAnalysis,
			);
			return {
				...state,
				showOnlyCompatible: !state.showOnlyCompatible,
				filteredTopics: toggledFilteredTopics,
			};

		case "SWITCH_TAB":
			return {
				...state,
				activeTab: action.tab,
			};

		case "SET_COMPATIBILITY_ANALYSIS":
			const updatedFilteredTopics = filterTopics(
				state.topics,
				state.searchTerm,
				state.showOnlyCompatible,
				action.analysis,
			);
			return {
				...state,
				compatibilityAnalysis: action.analysis,
				filteredTopics: updatedFilteredTopics,
			};

		case "SET_PROPERTY_TREES":
			return {
				...state,
				propertyTrees: action.trees,
			};

		default:
			return state;
	}
};
