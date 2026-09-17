import type { DatasourceTopic } from "../../../datasources/datasource-interface";

/** Column a topic table is ordered by. */
export type TopicSortKey = "datasource" | "topic" | "type" | "rawType";

/** Direction of a topic table's ordering. */
export type TopicSortDirection = "asc" | "desc";

/** How a topics panel is currently filtered and ordered. */
export interface TopicListView {
	/** Raw search box contents; trimmed and lower-cased here. */
	query: string;
	/** Column the rows are ordered by. */
	sortKey: TopicSortKey;
	/** Direction of the ordering. */
	sortDirection: TopicSortDirection;
}

/**
 * The string a topic sorts on for a given column.
 *
 * @param topic - Topic being ordered.
 * @param key - Column the table is ordered by.
 * @returns The column's value, never `undefined` — an unset `type` sorts as "".
 */
export function topicSortValue(
	topic: DatasourceTopic,
	key: TopicSortKey,
): string {
	switch (key) {
		case "datasource":
			return topic.source.title ?? "";
		case "topic":
			return topic.topic ?? "";
		case "type":
			return topic.type ?? "";
		case "rawType":
			return topic.rawType ?? "";
	}
}

/**
 * Whether a topic matches the operator's search.
 *
 * Every column the table shows is searched, so what is on screen is what can
 * be typed — an operator who can see `sensor_msgs/msg/Image` in a row expects
 * typing it to find that row.
 *
 * @param topic - Topic to test.
 * @param needle - Already trimmed and lower-cased query; "" matches everything.
 * @returns True when the topic should stay visible.
 */
export function matchesTopicQuery(
	topic: DatasourceTopic,
	needle: string,
): boolean {
	if (!needle) return true;
	return (
		(topic.source.title ?? "").toLowerCase().includes(needle) ||
		(topic.topic ?? "").toLowerCase().includes(needle) ||
		(topic.type ?? "").toLowerCase().includes(needle) ||
		(topic.rawType ?? "").toLowerCase().includes(needle)
	);
}

/**
 * Filter and order the topics a panel shows.
 *
 * Ties break on `datasource_id:topic` and that tie-break is **not** reversed
 * with the direction: two topics with the same type must keep one stable
 * relative order in both directions, or reversing the sort silently reshuffles
 * rows that the operator sees as identical. Datasources enumerate in wire
 * order, which differs between connects, so the tie-break is what makes the
 * list reproducible at all.
 *
 * Pure, and the only place the panel's ordering lives — see the topics-panel
 * tests, since a comparator regression is invisible until an operator cannot
 * find a topic.
 *
 * @param topics - Topics from `useAvailableTopics()`.
 * @param view - Current search and ordering.
 * @returns A new array; the input is never mutated.
 */
export function selectTopics(
	topics: readonly DatasourceTopic[],
	view: TopicListView,
): DatasourceTopic[] {
	const needle = view.query.trim().toLowerCase();
	const filtered = topics.filter((topic) => matchesTopicQuery(topic, needle));

	return filtered.sort((left, right) => {
		const result = topicSortValue(left, view.sortKey).localeCompare(
			topicSortValue(right, view.sortKey),
			undefined,
			{ numeric: true, sensitivity: "base" },
		);

		if (result === 0) {
			return `${left.datasource_id}:${left.topic}`.localeCompare(
				`${right.datasource_id}:${right.topic}`,
			);
		}

		return view.sortDirection === "asc" ? result : -result;
	});
}
