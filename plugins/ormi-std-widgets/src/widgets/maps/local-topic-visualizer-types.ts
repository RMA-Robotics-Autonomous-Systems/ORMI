import React from "react";
import { SelectedTopic } from "@workspace/ormi-core/datasources";

/**
 * Props for local topic visualizer components.
 */
export interface LocalTopicVisualizerProps {
	/** Display name for the local topic. */
	name: string;
	/** Local coordinate topic (Path, PointCloud, etc.). */
	topic: SelectedTopic;
	/** GPS topic used as origin. */
	gpsOriginTopic: SelectedTopic;
	/** Visualizer-specific settings. */
	settings?: any;
}

/**
 * Definition of a local topic visualizer.
 */
export interface LocalTopicVisualizer {
	/** Visualizer React component. */
	component: React.ComponentType<LocalTopicVisualizerProps>;
	/** Web types this visualizer can handle (e.g., ["Path"]). */
	accepts: string[];
	/** Display name. */
	name: string;
	/** Optional description. */
	description?: string;
}

/**
 * Base definition for a local topic.
 */
export interface LocalTopic {
	/** Display name. */
	name: string;
	/** Local topic (Path, PointCloud, etc.). */
	topic: SelectedTopic;
	/** GPS topic used as origin. */
	gpsOriginTopic: SelectedTopic;
	/** Optional: specific visualizer to use. */
	visualizerType?: string;
	/** Transform strategy for local-to-GPS conversion. */
	transform?: "continuous" | "first" | "none";
}
