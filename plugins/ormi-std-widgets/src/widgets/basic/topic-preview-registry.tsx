import { ReactNode } from "react";
import { DatasourceTopic } from "@workspace/ormi-core/datasources";

/**
 * Interface for a topic preview component configuration
 * Maps webtypes to existing widget components with pre-configured settings
 */
export interface TopicPreviewConfig {
	/** The component to render (should be an existing widget component) */
	component: (topic: DatasourceTopic) => ReactNode;
	/** Minimum height for the preview card */
	minHeight?: string;
}

/**
 * Registry mapping webtypes to their preview configurations
 */
class TopicPreviewRegistry {
	private registry = new Map<string, TopicPreviewConfig>();

	/**
	 * Register a preview configuration for a specific webtype
	 */
	register(webtype: string, config: TopicPreviewConfig) {
		this.registry.set(webtype, config);
	}

	/**
	 * Get the preview configuration for a webtype
	 * Returns undefined if no preview is registered
	 */
	get(webtype: string): TopicPreviewConfig | undefined {
		return this.registry.get(webtype);
	}

	/**
	 * Check if a preview exists for a webtype
	 */
	has(webtype: string): boolean {
		return this.registry.has(webtype);
	}

	/**
	 * Get all registered webtypes
	 */
	getRegisteredTypes(): string[] {
		return Array.from(this.registry.keys());
	}
}

// Singleton instance
export const topicPreviewRegistry = new TopicPreviewRegistry();
