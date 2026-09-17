import type { Channel } from "@foxglove/ws-protocol";

import type { DatasourceTopic } from "@workspace/ormi-core/datasources";

import { UnifiedConverter } from "./unified-converter";
import type { FoxgloveDataSourceSettings } from "./types";

/**
 * The datasource state the topic list is built from, resolved at call time.
 *
 * Both are read every time the filter runs rather than captured once, because
 * `AVAILABLE_TOPICS` is a **pull** filter: it is invoked when a consumer asks,
 * so the honest answer is what the datasource looks like then. Handing the
 * values in directly is what produced the defect this shape exists to prevent —
 * a filter registered inside an effect answered with the settings of the render
 * that effect last ran in, so renaming a datasource left every topic reporting
 * the old title until the dashboard was reloaded.
 */
export interface AvailableTopicsSources {
	/** Current provider settings for this datasource instance. */
	getSettings: () => FoxgloveDataSourceSettings;
	/** Channels the server has advertised so far, keyed by channel id. */
	getChannels: () => ReadonlyMap<number, Channel>;
}

/**
 * Build the `AVAILABLE_TOPICS` contribution for one Foxglove datasource.
 *
 * Returned as a filter function so it can be registered once, for the lifetime
 * of the connection, and still answer with current state: re-registering it
 * whenever the settings or the channel list change would churn
 * `addFilter`/`removeFilter` through every configuration edit and every
 * advertisement.
 *
 * Errors are swallowed to the incoming list rather than thrown: the hook is
 * applied across every datasource in the workspace, and a rejection here takes
 * the whole topic list down with it, not just this datasource's rows.
 *
 * @param sources - Accessors for the current settings and channels.
 * @returns A filter that appends this datasource's topics to the list.
 */
export function createAvailableTopicsFilter(
	sources: AvailableTopicsSources,
): (topics: DatasourceTopic[]) => Promise<DatasourceTopic[]> {
	return async (topics: DatasourceTopic[]) => {
		try {
			const settings = sources.getSettings();
			const channels = Array.from(sources.getChannels().values());

			const newTopics = channels.map(
				(channel) =>
					({
						topic: channel.topic,
						datasource_id: settings.id,
						source: settings,
						type:
							UnifiedConverter.getWebappTypeFromROSType(
								channel.schemaName,
							) || "",
						rawType: channel.schemaName,
					}) as DatasourceTopic,
			);

			return [...topics, ...newTopics];
		} catch (error) {
			console.error("Error in available topics filter:", error);
			return topics;
		}
	};
}
