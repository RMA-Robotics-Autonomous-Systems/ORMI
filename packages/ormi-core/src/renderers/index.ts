import { JsonFormsRendererRegistryEntry } from "@jsonforms/core";
import TopicSelectRenderer, {
	topicSelectTester,
} from "./topic-select-renderer";
import FrameSelectRenderer, {
	frameSelectTester,
} from "./frame-select-renderer";
import DatasourceSelectRenderer, {
	datasourceSelectTester,
} from "./datasource-select-renderer";
import MapLayersSelectRenderer, {
	mapLayersSelectTester,
} from "./map-layers-select-renderer";

/** JsonForms renderer registry for core controls. */
export const coreRenderer: JsonFormsRendererRegistryEntry[] = [
	// New topic selection renderer
	{ tester: topicSelectTester, renderer: TopicSelectRenderer },
	{ tester: frameSelectTester, renderer: FrameSelectRenderer },
	{ tester: datasourceSelectTester, renderer: DatasourceSelectRenderer },
	{ tester: mapLayersSelectTester, renderer: MapLayersSelectRenderer },
];

// Export new system components
export * from "./topic-select-renderer";
export * from "./topic-selection";
export * from "./frame-select-renderer";
export {
	DatasourceSelectControl,
	datasourceSelectTester,
} from "./datasource-select-renderer";
export {
	MapLayersSelectControl,
	mapLayersSelectTester,
	type MapLayersSelectControlProps,
} from "./map-layers-select-renderer";
