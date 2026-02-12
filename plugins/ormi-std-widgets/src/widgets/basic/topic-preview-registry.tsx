import { ReactNode } from "react";
import { DatasourceTopic } from "@workspace/ormi-core/datasources";

/** Topic preview component configuration. */
export interface TopicPreviewConfig {
	/** The component to render (should be an existing widget component) */
	component: (topic: DatasourceTopic) => ReactNode;
	/** Minimum height for the preview card */
	minHeight?: string;
}

/** Registry mapping webtypes to preview configurations. */
class TopicPreviewRegistry {
	private registry = new Map<string, TopicPreviewConfig>();

	/**
	 * Register a preview configuration.
	 * @param webtype - Web type name.
	 * @param config - Preview configuration.
	 */
	register(webtype: string, config: TopicPreviewConfig) {
		this.registry.set(webtype, config);
	}

	/**
	 * Get the preview configuration for a webtype.
	 * @param webtype - Web type name.
	 * @returns Preview config or undefined.
	 */
	get(webtype: string): TopicPreviewConfig | undefined {
		return this.registry.get(webtype);
	}

	/**
	 * Check if a preview exists for a webtype.
	 * @param webtype - Web type name.
	 * @returns True if registered.
	 */
	has(webtype: string): boolean {
		return this.registry.has(webtype);
	}

	/**
	 * Get all registered webtypes.
	 * @returns Web type list.
	 */
	getRegisteredTypes(): string[] {
		return Array.from(this.registry.keys());
	}
}

/** Singleton registry instance. */
export const topicPreviewRegistry = new TopicPreviewRegistry();
