import { JsonFormsRendererRegistryEntry } from "@jsonforms/core";
import TopicSelectRenderer, {
  topicSelectTester,
} from "./topic-select-renderer";

export const coreRenderer: JsonFormsRendererRegistryEntry[] = [
  // New topic selection renderer
  { tester: topicSelectTester, renderer: TopicSelectRenderer },
];

// Export new system components
export * from "./topic-select-renderer";
export * from "./topic-selection";
