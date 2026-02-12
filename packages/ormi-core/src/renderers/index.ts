import { JsonFormsRendererRegistryEntry } from "@jsonforms/core";
import TopicSelectRenderer, {
	topicSelectTester,
} from "./topic-select-renderer";
import FrameSelectRenderer, {
	frameSelectTester,
} from "./frame-select-renderer";

/** JsonForms renderer registry for core controls. */
export const coreRenderer: JsonFormsRendererRegistryEntry[] = [
	// New topic selection renderer
	{ tester: topicSelectTester, renderer: TopicSelectRenderer },
	{ tester: frameSelectTester, renderer: FrameSelectRenderer },
];

// Export new system components
export * from "./topic-select-renderer";
export * from "./topic-selection";
export * from "./frame-select-renderer";
