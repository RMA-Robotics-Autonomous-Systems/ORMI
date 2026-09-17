// New Topic Selection System
export {
	default as TopicSelectRenderer,
	topicSelectTester,
} from "../topic-select-renderer";
export type { TopicSelectElement } from "../topic-select-renderer";

// Dialog Components
export { TopicSelectionDialog } from "./topic-selection-dialog";
export { TopicBrowser } from "./topic-browser";
export { TopicDetails } from "./topic-details";

// Auto-select and buffer derivation
export {
	buildSelectedTopic,
	canAutoBindSlot,
	deriveTopicBufferSize,
	findSoleDirectMatch,
	isDirectTypeMatch,
	isPrimitiveOnlySlot,
	PRIMITIVE_TOPIC_TYPES,
	topicKey,
} from "./topic-auto-select";
export type { TopicBufferOptions, TopicSlotPolicy } from "./topic-auto-select";

// Deriving a name from the bound topic
export {
	deriveNameFromTopic,
	resolveDerivedNameUpdates,
	TOPIC_NAME_SIBLING_PROPERTIES,
} from "./topic-derived-name";
export type {
	DerivedNameUpdate,
	ResolveDerivedNameArgs,
} from "./topic-derived-name";

// Inline picker
export { TopicInlinePicker } from "./topic-inline-picker";
export type { TopicInlinePickerProps } from "./topic-inline-picker";
export {
	buildCandidatePool,
	resolveTopicPickerMode,
	EMPTY_CANDIDATE_POOL,
	INLINE_CANDIDATE_LIMIT,
	INLINE_CANDIDATE_MIN,
	INLINE_CANDIDATE_MIN_UNBOUND,
} from "./topic-inline-candidates";
export type {
	TopicCandidatePool,
	TopicPickerMode,
	TopicPickerModeOptions,
} from "./topic-inline-candidates";
export {
	useSettledTopics,
	nextSettledTopicsDelay,
	SETTLED_TOPICS_POLL_MS,
	SETTLED_TOPICS_MAX_POLL_MS,
	SETTLED_TOPICS_POLL_BACKOFF,
	WAITING_FOR_TOPICS,
} from "./use-settled-topics";
export type { SettledTopics } from "./use-settled-topics";

// State Management
export {
	topicSelectionReducer,
	initialTopicSelectionState,
} from "./topic-selection-state";
export type {
	TopicSelectionState,
	TopicSelectionAction,
} from "./topic-selection-state";
