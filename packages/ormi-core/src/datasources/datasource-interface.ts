import { JsonSchema, UISchemaElement } from "@jsonforms/core";

import { FC } from "react";

/** Datasource definition describing UI and provider settings. */
interface DatasourceDefinition<T = DatasourceProviderSettings> {
	id: string;
	name: string;
	description: string;

	titleProp?: string;

	/**
	 * Settings keys whose values may be shown to an operator as a short summary
	 * of *which remote this is* — a url, a host, a recording name.
	 *
	 * An allowlist, declared by the plugin that owns the schema, because only it
	 * knows which of its fields are safe to display: settings blobs carry
	 * credentials, and a name heuristic over them fails silently as a leak
	 * rather than loudly as an error. Omit it and nothing from the blob is ever
	 * rendered, which is the correct default for a datasource that has no remote
	 * to name (a generator, a fixture). There is no fallback — a fallback is the
	 * leak.
	 *
	 * Never list a field that holds a token, password or key.
	 */
	summaryProps?: string[];

	schema: JsonSchema;
	uischema?: UISchemaElement;
	data: T;

	/** Provider component for this datasource (lifecycle component, no children). */
	Provider: FC<T>;
}

/** Datasource instance configured in a dashboard. */
interface Datasource {
	/** Points to the datasource definition id. */
	datasource_id: string;
	/** Display title of the datasource. */
	title: string;
	/** Provider settings for the datasource. */
	settings: DatasourceProviderSettings;
}

/** Topic published by a datasource. */
interface DatasourceTopic {
	topic: string;
	datasource_id: string;
	source: DatasourceProviderSettings;
	/** Type of the data inside the webapp. */
	type: string;
	/** Type of the data inside the datasource. */
	rawType: string;
	bufferSize?: number;
	/**
	 * The consumer needs **every** message on this topic, not the latest per
	 * drain tick.
	 *
	 * A transport hint declared by whoever subscribes, exactly like
	 * {@link DatasourceTopic.bufferSize} above it, and for the same reason: a
	 * datasource cannot know whether a stream is a series of samples or a state
	 * to be observed, and the operator has no basis to answer. A widget showing
	 * a live value wants the newest message and nothing else; one building a run
	 * out of the stream — a survey, a recorder, an analyser — is wrong by
	 * exactly the messages it never saw, and nothing on screen says so.
	 *
	 * Left unset it is false, so the default stays coalesce-to-latest and no
	 * existing topic changes behaviour.
	 *
	 * Two properties follow from a topic being ONE wire shared by N subscribers:
	 * it is the **OR** across them — one consumer needing every sample makes the
	 * topic lossless for all of them — and it is **monotonic** for the life of
	 * the subscription, because a datasource that downgraded when a lossy
	 * subscriber joined would silently start dropping samples underneath the
	 * consumer that asked.
	 *
	 * Honouring it is a datasource's choice, and most have nothing to do: only a
	 * datasource that coalesces reads it (foxglove does; rosbridge, the EMI
	 * replay and the REST bag reader deliver every message already).
	 */
	lossless?: boolean;
}

/** Topic selected for widget configuration. */
interface SelectedTopic extends DatasourceTopic {
	property: string;
}

/** Filter criteria for datasource topics. */
interface DatasourceTopicFilterProps {
	name?: RegExp;
	type?: RegExp;
	rawType?: RegExp;
	source_id?: RegExp;
	/** If true, the filter returns true only if all properties match. */
	strict?: boolean;
}

/** Regex-based filter for datasource topics. */
class DatasourceTopicFilter {
	name?: RegExp;
	type?: RegExp;
	source_id?: RegExp;
	rawType?: RegExp;
	strict?: boolean;

	constructor(props: DatasourceTopicFilterProps) {
		this.name = props.name;
		this.type = props.type;
		this.source_id = props.source_id;
		this.rawType = props.rawType;
		this.strict = props.strict || false;
	}

	/** Check if a topic matches this filter. */
	filter(topic: DatasourceTopic): boolean {
		const matches = [];

		if (this.name && !this.name.test(topic.topic)) {
			matches.push(false);
		}

		if (this.type && !this.type.test(topic.type)) {
			matches.push(false);
		}

		if (this.source_id && !this.source_id.test(topic.datasource_id)) {
			matches.push(false);
		}

		if (this.rawType && !this.rawType.test(topic.rawType)) {
			matches.push(false);
		}

		if (this.strict && matches.length > 0) {
			return false;
		}

		return true;
	}
}

/** Settings required to configure a datasource provider. */
interface DatasourceProviderSettings {
	id: string;
	title: string;
	enable: boolean;
}

/**
 * Raw per-datasource connection status as tracked by the global provider.
 *
 * Single source of truth for the status union (logic-only, no React) so
 * {@link deriveHealth} can be unit tested in isolation and so consumers
 * (e.g. the global datasource provider and its status badges) import one
 * shared definition rather than re-declaring it. The authoritative status
 * map lives on the global datasource provider.
 */
type DatasourceStatus = "connecting" | "ready" | "error" | "disposed";

/**
 * Widget-facing datasource health.
 *
 * A deliberately small, derived view of the raw {@link DatasourceStatus} for
 * widgets to gate their UI on:
 *
 * - `connecting` — coming up, or not yet observed (unknown is treated as still
 *   connecting; a never-connected datasource currently stays `connecting`).
 * - `online` — the datasource is ready and data can flow.
 * - `offline` — the datasource was disposed or errored.
 *
 * There is intentionally no `stale` state and no connect-timeout: true-offline
 * detection for a never-connected datasource is not currently implemented.
 */
type DatasourceHealth = "connecting" | "online" | "offline";

/**
 * Derive widget-facing {@link DatasourceHealth} from a raw
 * {@link DatasourceStatus}.
 *
 * Pure function — safe to call anywhere and unit-testable in isolation.
 *
 * Mapping:
 * - `"ready"` → `online`
 * - `"connecting"` → `connecting`
 * - `"disposed"` → `offline`
 * - `"error"` → `offline`
 * - `undefined` / missing → `connecting` (unknown is treated as still coming up)
 *
 * @param status - Raw datasource status, or `undefined` when not yet tracked.
 * @returns The derived widget-facing health.
 */
function deriveHealth(status: DatasourceStatus | undefined): DatasourceHealth {
	switch (status) {
		case "ready":
			return "online";
		case "disposed":
		case "error":
			return "offline";
		case "connecting":
		case undefined:
		default:
			return "connecting";
	}
}

export { DatasourceTopicFilter, deriveHealth };
export type {
	DatasourceDefinition,
	Datasource,
	DatasourceTopic,
	DatasourceProviderSettings,
	DatasourceStatus,
	DatasourceHealth,
	SelectedTopic,
};
