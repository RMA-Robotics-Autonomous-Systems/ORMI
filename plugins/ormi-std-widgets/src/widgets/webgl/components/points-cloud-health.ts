/**
 * Per-series health of the point-cloud widget: which configured clouds sit on
 * an offline datasource. Pure so the overlay's content is testable without a
 * WebGL canvas. The cloud itself is never blanked: last-known points stay.
 */

import type { SelectedTopic } from "@workspace/ormi-core/datasources";

/**
 * Topic names of the configured series whose datasource is offline, in
 * `topics` order. Unbound entries are skipped.
 *
 * @param topics - The widget's `topics` setting.
 * @param isOffline - Whether one topic's datasource is offline.
 * @returns The offline series' topic names.
 */
export function offlineCloudSeries(
	topics: ReadonlyArray<{ topic?: SelectedTopic }> | undefined,
	isOffline: (topic: SelectedTopic) => boolean,
): string[] {
	const names: string[] = [];
	for (const entry of topics ?? []) {
		if (entry.topic && isOffline(entry.topic))
			names.push(entry.topic.topic);
	}
	return names;
}
