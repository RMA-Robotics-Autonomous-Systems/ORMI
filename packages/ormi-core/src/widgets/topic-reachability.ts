/**
 * Which widgets a topic click can reach.
 *
 * Lives apart from any one surface on purpose: the count shown beside a topic
 * list and the decision taken when a topic is clicked must agree, and they are
 * rendered by different components. Pure and React-free so it can be tested
 * directly.
 */

import { WidgetDefinition } from "./widget-interface";
import { TopicClaimIndex } from "./topic-claims";

/**
 * Whether a widget can be opened by clicking a topic.
 *
 * The rule, in one place so the two tabs cannot drift apart: a widget is
 * reachable from the **Topics** tab when a plugin **claims** it for some topic
 * type. It used to be inferred from the shape of the widget's slots — a primary
 * slot that either subscribes or publishes with declared types — which counted
 * widgets the resolver would never actually offer and, worse, counted every
 * widget with an undeclared slot as a universal raw viewer.
 *
 * Reading the claim index rather than re-deriving anything is what keeps this
 * honest: the index has already dropped claims naming a widget this build does
 * not ship, a slot that does not exist, or a direction that contradicts the
 * claim's role, so the count is of destinations that really resolve.
 *
 * Reachable is not the same as automatic. A control is reachable because
 * clicking a `Movement` topic offers to command a robot with it, clearly
 * labelled as commanding; routing never *chooses* one. That separation lives in
 * `resolveTopicRoute`, and this predicate only decides what the tab's count
 * claims is within reach.
 *
 * Every widget, including every widget this returns false for, is reachable
 * from the **Widgets** tab. The tabs overlap by design: Topics is a shortcut,
 * never the only path, and iframe and mission panels have no topic to be
 * clicked from.
 *
 * @param definition - Widget definition to test.
 * @param claims - Claims resolved against the current registry.
 * @returns True when a topic click can open this widget.
 */
export function isTopicReachable(
	definition: WidgetDefinition,
	claims: TopicClaimIndex,
): boolean {
	return claims.claimedWidgetIds.has(definition.id);
}

/**
 * Count how many of the given widgets a topic click can reach.
 *
 * @param definitions - Widget definitions currently in the registry.
 * @param claims - Claims resolved against the current registry.
 * @returns Number of definitions satisfying {@link isTopicReachable}.
 */
export function countTopicReachable(
	definitions: WidgetDefinition[],
	claims: TopicClaimIndex,
): number {
	return definitions.reduce(
		(total, definition) =>
			total + (isTopicReachable(definition, claims) ? 1 : 0),
		0,
	);
}
