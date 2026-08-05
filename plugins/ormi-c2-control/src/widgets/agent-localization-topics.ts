"use client";

/**
 * Per-agent localization topic derivation for the mission map's agent overlay.
 *
 * Each agent in the C2 agents roster ({@link useAgents}) that carries BOTH a
 * `namespace` and a datasource `source` exposes its position on a NAMESPACED
 * topic `{namespace}/edge/multi_robot/localization` (`nav_msgs/msg/Odometry`).
 * This module turns the roster into the `SelectedTopic[]` the map subscribes to,
 * plus a `topic-key → agent_id` map so each incoming source can be labeled.
 *
 * ⚠ STABILITY — `LocalDataSourcesProvider`'s subscription effect depends on its
 * `SelectedTopics` array BY REFERENCE: a fresh array every render thrashes every
 * per-agent subscribe/unsubscribe. {@link useAgentLocalizationTopics} therefore
 * keys its `useMemo` on the pure {@link agentsTopicSignature} STRING (not the
 * roster array), so the returned `topics` array keeps a stable identity until
 * membership / namespace / source actually changes.
 */

import { useMemo } from "react";

import type {
	DatasourceProviderSettings,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { createTopicKey } from "@workspace/utils";

import type { AgentRecord } from "../state/c2-agents-store";
import { useAgents } from "../state/c2-agents-store";
import { buildNamespacedTopic } from "./fleet-helpers";

/** Raw ROS type for the per-agent localization Odometry stream. */
const LOCALIZATION_RAW_TYPE = "nav_msgs/msg/Odometry";

/**
 * Pure signature of a roster for memo keying.
 *
 * Encodes exactly the fields that affect the derived subscription set —
 * `agent_id`, `namespace`, and `source.id` — so the signature is stable across
 * identical re-publishes and changes only on a membership / namespace / source
 * change. The `§` separator can't appear in a UUID, namespace, or source id.
 *
 * @param agents - The agent roster.
 * @returns A deterministic signature string.
 */
export function agentsTopicSignature(agents: AgentRecord[]): string {
	return agents
		.map((a) => `${a.agent_id}|${a.namespace ?? ""}|${a.source?.id ?? ""}`)
		.join("§");
}

/**
 * Build the localization {@link SelectedTopic} for one agent, or null when the
 * agent lacks a `namespace` or a resolvable `source` (no per-agent stream to
 * subscribe to).
 *
 * The agent namespace reaches the store via the REST roster, which records no
 * ROS `source`. The per-agent localization stream therefore subscribes against
 * the `fallbackSource` — the ROS datasource the operator already configured for
 * live telemetry (the map's feedback/overlay topic). The source resolves as
 * `agent.source ?? fallbackSource`, so a roster-fed agent still subscribes.
 *
 * Pure (no React) so it is unit-testable. The raw-typed topic mirrors how the
 * plugin's `TopicSelect`-sourced topics are shaped: `rawType` is the ROS type
 * and `type` mirrors it (raw match), `property` is empty (the whole Odometry
 * message is delivered).
 *
 * @param agent - The agent record.
 * @param fallbackSource - The ROS source to use when the agent has no `source`.
 * @returns The localization SelectedTopic, or null when not subscribable.
 */
export function buildLocalizationTopic(
	agent: AgentRecord,
	fallbackSource?: DatasourceProviderSettings,
): SelectedTopic | null {
	const namespace = agent.namespace;
	const source = agent.source ?? fallbackSource ?? null;
	if (!namespace || !source) return null;
	const topic = buildNamespacedTopic(namespace, "localization");
	return {
		topic,
		datasource_id: (source as DatasourceProviderSettings).id,
		source,
		type: LOCALIZATION_RAW_TYPE,
		rawType: LOCALIZATION_RAW_TYPE,
		property: "",
	};
}

/**
 * React hook: the per-agent localization topics + a `topic-key → agent_id` map.
 *
 * Reads the agent roster and, for every agent carrying both a namespace and a
 * source, builds a localization `SelectedTopic` and records its provider topic
 * key (via the same {@link createTopicKey} the provider uses) → `agent_id`, so
 * the map overlay can label each incoming source.
 *
 * The memo is keyed on {@link agentsTopicSignature} (a STRING) PLUS the
 * `fallbackSource.id`, NOT the roster array, so the returned `topics` identity
 * stays stable until the subscription set actually changes — REQUIRED so
 * `LocalDataSourcesProvider` does not re-run its subscription effect on every
 * render (see the module header). Threading the fallback source id into the
 * signature rebuilds the topic set when the operator's configured ROS source
 * changes.
 *
 * @param fallbackSource - The ROS source for agents that have no own `source`
 *   (roster-fed agents); typically the map's configured feedback/overlay topic.
 * @returns `{ topics, agentByKey }`.
 */
export function useAgentLocalizationTopics(
	fallbackSource?: DatasourceProviderSettings,
): {
	topics: SelectedTopic[];
	agentByKey: Map<string, string>;
} {
	const agents = useAgents();
	const signature = `${agentsTopicSignature(agents)}@${fallbackSource?.id ?? ""}`;

	// Keyed on the pure `signature` string (NOT `agents`) so the returned array
	// identity is stable until membership/namespace/source (or the fallback
	// source id) changes — see the module header. The `agents` and `fallbackSource`
	// reads inside are intentional, not missing deps.
	return useMemo(
		() => {
			const topics: SelectedTopic[] = [];
			const agentByKey = new Map<string, string>();
			for (const agent of agents) {
				const topic = buildLocalizationTopic(agent, fallbackSource);
				if (!topic) continue;
				topics.push(topic);
				agentByKey.set(createTopicKey(topic), agent.agent_id);
			}
			return { topics, agentByKey };
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[signature],
	);
}
