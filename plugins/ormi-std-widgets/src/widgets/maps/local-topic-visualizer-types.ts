import React from "react";
import { SelectedTopic } from "@workspace/ormi-core/datasources";

/**
 * Props passed to local topic visualizer components
 */
export interface LocalTopicVisualizerProps {
    name: string;
    topic: SelectedTopic; // The local coordinate topic (Path, PointCloud, etc.)
    gpsOriginTopic: SelectedTopic; // The GPS topic to use as origin
    settings?: any; // Visualizer-specific settings
}

/**
 * Definition of a local topic visualizer
 * Used internally by the map widget to render local coordinate topics
 */
export interface LocalTopicVisualizer {
    component: React.ComponentType<LocalTopicVisualizerProps>;
    accepts: string[]; // Web types this visualizer can handle (e.g., ["Path"])
    name: string; // Display name
    description?: string;
}

/**
 *  Base definition for a local topic
 *  Can be extended for specific local topics that require additional properties
 */
export interface LocalTopic {
    name: string;
    topic: SelectedTopic; // Path, PointCloud, etc.
    gpsOriginTopic: SelectedTopic; // GPS topic to use as origin
    visualizerType?: string; // Optional: specific visualizer to use
    transform?: "continuous" | "first" | "none"; // continuous -> apply transform continuously, first -> apply transform only once at the beginning, none -> no transform applied
}
