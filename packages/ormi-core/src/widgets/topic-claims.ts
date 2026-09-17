/**
 * Topic claims: the stated mapping from a topic type to the widget that shows
 * it.
 *
 * Routing used to be *inferred*. The resolver walked every widget's `accepts`
 * list and ran a ladder — sole candidate, narrowest list, sole array-backed —
 * so the mapping was an emergent property of declaration order and list
 * lengths. Nobody could state it, and nobody could see it change: `Image`
 * routed to the right viewer only because a competing widget's `accepts` list
 * held two misspelled raw type names that matched nothing and inflated its
 * apparent specificity, so *fixing the typo* would have moved the mapping.
 *
 * A claim replaces the inference with a sentence. A plugin says "for a
 * `PointsCloud`, open `std-scene-3d` at its point-cloud layer array, and that
 * is the default" — in the plugin that ships the widget, which is the only one
 * that can keep the widget id honest. A type nothing claims produces an
 * explicit "nothing claims this type" rather than a guess.
 *
 * The division of labour this restores is the whole point:
 *
 * - **`dataRequirements` answers compatibility** — *may* this widget take this
 *   topic? It drives the configuration dialog, the topic pickers, auto-bind and
 *   {@link ../topic-compatibility}. Nothing about it is a routing decision.
 * - **A claim answers routing** — *should* a click on this topic open this
 *   widget, and which slot does the value land in? Nothing else does.
 *
 * Conflating the two is what this module exists to undo: an `accepts` list is
 * honest in isolation and wrong in company, because a widget cannot see the
 * registry it is registered into.
 */

import { DatasourceTopic } from "../datasources/datasource-interface";
import type {
	RoutableSlot,
	TopicRoutingIndex,
	WidgetRoutingEntry,
} from "./topic-routing";

/**
 * How a {@link TopicClaim} spells this slot: the settings dot path for a
 * single-value slot, `"<arrayPath>[].<path>"` for an array-backed one.
 *
 * One function so the claim a plugin writes and the slot the walker finds are
 * compared on the same string — a claim that names a slot no widget has is a
 * dropped claim, not a silently different destination.
 *
 * @param slot - Slot from the routing index.
 * @returns The slot's claim path.
 */
export function slotPath(slot: RoutableSlot): string {
	return slot.isArray ? `${slot.arrayPath}[].${slot.path}` : slot.path;
}

/**
 * The type key a {@link TopicClaim} uses to claim *every* topic type. Only a
 * `"fallback"` claim may use it.
 */
export const ANY_TOPIC_TYPE = "*";

/**
 * What a widget does with a topic type it claims.
 *
 * - `"default"` — the destination for the type. A topic click opens it without
 *   asking, provided nothing else claims the same type as a default at the same
 *   priority.
 * - `"alternative"` — a genuine destination that is **never** automatic. This
 *   is the per-type statement that replaces the old slot-level `autoRoute:
 *   false`: the airspeed gauge really does read a `Movement`, but a `Movement`
 *   is usually a `/cmd_vel`, and a dial shown for a command reads as a
 *   measurement of something nothing measured. Being per-type, it can now say
 *   "not automatic for `Movement`" without also saying it for `Vector3`.
 * - `"command"` — the widget *publishes* to the type. Offered in commanding
 *   vocabulary on its own affordance, never automatic, never mixed in with the
 *   viewers. The safety property of the whole feature: an operator must never
 *   command a robot because they clicked a sensor.
 * - `"fallback"` — a raw viewer, offered for any type and always last. Declared
 *   rather than inferred from a missing `dataRequirements`: that inference is
 *   what silently made the ROSTainer status panel a candidate raw viewer for
 *   every topic in the build.
 */
export type TopicClaimRole = "default" | "alternative" | "command" | "fallback";

/** One plugin's statement about one topic type and one widget slot. */
export interface TopicClaim {
	/**
	 * Topic type this claim answers: a webapp type name as datasources report
	 * it in `DatasourceTopic.type` (`"Image"`, `"PointsCloud"`), a raw schema
	 * name as they report it in `DatasourceTopic.rawType`
	 * (`"sensor_msgs/msg/Image"`), or {@link ANY_TOPIC_TYPE} for a `"fallback"`
	 * claim. Both name spaces are looked up, so a topic that only ever carries
	 * a `rawType` is routable; they cannot collide, because a raw schema name
	 * contains `/` and a webapp type name never does.
	 */
	type: string;
	/** Id of the widget definition this claim names. */
	widgetId: string;
	/**
	 * Which `TopicSelect` slot of that widget the topic is written into, as
	 * {@link slotPath} spells it: the settings dot path for a single-value slot
	 * (`"topic"`, `"posePublisherConfig.goalTopic"`), or
	 * `"<arrayPath>[].<path>"` for an array-backed one
	 * (`"pointCloudLayers[].topic"`).
	 *
	 * Named explicitly rather than inferred: a widget with several slots is
	 * exactly the case where guessing goes wrong, and a claim that names a slot
	 * its widget does not have is dropped with a warning rather than silently
	 * falling back to another.
	 *
	 * **Omitted for a widget that discovers its own topics.** The diagnostics
	 * and battery panels carry no `TopicSelect` at all: they poll for every
	 * topic of their type across every datasource and present one merged view.
	 * There is nothing to write a topic into, so a claim without a slot says
	 * "this widget answers this type by finding it itself" — routing creates it
	 * from the definition's defaults and binds nothing.
	 */
	slot?: string;
	/** What the widget does with the type. */
	role: TopicClaimRole;
	/**
	 * Order among claims of the same role for the same type, **ascending** —
	 * lower is listed first, matching plugin filter priority. Defaults to `0`.
	 *
	 * Two plugins may both claim a type. For `"default"` the lowest priority
	 * wins outright *only when it is strictly lower than every other default*;
	 * an exact tie asks, because nothing has stated an order and a silent pick
	 * is the failure this module removes. For the other roles it only orders
	 * the list the operator is shown.
	 */
	priority?: number;
}

/** The claim list plugins contribute through `PluginsHooks.TOPIC_ROUTING_CLAIMS`. */
export type TopicRoutingClaims = TopicClaim[];

/** A claim matched against the live registry, carrying the slot it resolved to. */
export interface ResolvedTopicClaim {
	/** The claim as its plugin declared it. */
	claim: TopicClaim;
	/** Routing entry of the widget the claim names. */
	entry: WidgetRoutingEntry;
	/**
	 * The slot the claim's `slot` path resolved to, or `undefined` when the
	 * claim is slotless because its widget discovers its own topics.
	 *
	 * Deliberately `undefined` rather than a stand-in slot: every call site
	 * that writes a topic value has to confront the absence, and a fake slot
	 * would let one of them write into a path the widget does not have.
	 */
	slot: RoutableSlot | undefined;
	/** Effective priority, with the default applied. */
	priority: number;
}

/** Every claim resolved against one registry, indexed for lookup. */
export interface TopicClaimIndex {
	/**
	 * Claims by type key — webapp type names and raw schema names in the same
	 * map, each list already ordered by ascending priority.
	 */
	byType: Map<string, ResolvedTopicClaim[]>;
	/** Raw-viewer claims, offered for every type and always last. */
	fallbacks: ResolvedTopicClaim[];
	/**
	 * Every widget id that survived validation with at least one claim — which
	 * is exactly the set a topic click can reach.
	 */
	claimedWidgetIds: Set<string>;
}

/** A registry with no claims at all; every topic resolves to `none` against it. */
export const EMPTY_TOPIC_CLAIM_INDEX: TopicClaimIndex = {
	byType: new Map(),
	fallbacks: [],
	claimedWidgetIds: new Set(),
};

/**
 * Warnings already emitted, so a legitimately disabled plugin does not print
 * the same line on every index rebuild.
 */
const warned = new Set<string>();

/** Report a dropped claim once per distinct message. */
function warnOnce(message: string): void {
	if (warned.has(message)) return;
	warned.add(message);
	console.warn(`[topic-claims] ${message}`);
}

/** Human-readable identity of a claim, for a warning that can be acted on. */
function describe(claim: TopicClaim): string {
	const target =
		claim.slot === undefined
			? `${claim.widgetId} (discovers its own topics)`
			: `${claim.widgetId}.${claim.slot}`;
	return `claim '${claim.type}' → ${target} (${claim.role})`;
}

/**
 * Check one claim against the slot it names.
 *
 * Every rejection is a statement the registry cannot honour, and each is
 * dropped rather than thrown: a plugin can be disabled, and a dashboard that
 * crashes because a claim outlived its widget is worse than one that routes a
 * topic to an ask.
 *
 * @param claim - The claim as declared.
 * @param entry - Routing entry of the widget it names.
 * @param slot - The slot it resolved to, when it resolved to one.
 * @returns An explanation when the claim must be dropped, `undefined` when it holds.
 */
function rejectionReason(
	claim: TopicClaim,
	entry: WidgetRoutingEntry,
	slot: RoutableSlot | undefined,
): string | undefined {
	const wildcard = claim.type === ANY_TOPIC_TYPE;
	if (wildcard !== (claim.role === "fallback")) {
		return wildcard
			? `only a 'fallback' claim may use '${ANY_TOPIC_TYPE}'`
			: `a 'fallback' claim must claim '${ANY_TOPIC_TYPE}'`;
	}
	if (!claim.type) return "claims no type";

	if (claim.slot === undefined) {
		// A slotless claim is the discovering widget's statement, and it is
		// only honest when there is genuinely nothing to bind. A widget that
		// HAS topic slots and claims without naming one has almost certainly
		// forgotten the slot, and accepting it would create that widget with
		// an empty picker while the operator believes they bound their topic.
		return entry.slots.length > 0
			? "omits a slot, but its widget has topic slots to name"
			: undefined;
	}

	if (!slot) return "names a slot the widget does not have";

	// A command claim and a publish slot are the same statement seen from two
	// sides; letting them disagree is how a viewer ends up commanding a robot.
	if (claim.role === "command" && slot.direction !== "publish") {
		return "is a command but its slot does not declare direction: 'publish'";
	}
	if (claim.role !== "command" && slot.direction === "publish") {
		return "names a publish slot but is not a command";
	}
	// A secondary slot refines a primary one; it is not an entry point, so a
	// claim on one is an authoring mistake rather than a mapping.
	if (slot.role === "secondary") return "names a secondary slot";

	return undefined;
}

/**
 * Resolve a plugin's claims against the widgets the build actually ships.
 *
 * @param claims - Claims collected from `PluginsHooks.TOPIC_ROUTING_CLAIMS`.
 * @param index - Routing index over the current widget registry.
 * @returns The claim index, with unhonourable claims dropped and warned about.
 */
export function buildTopicClaimIndex(
	claims: TopicRoutingClaims,
	index: TopicRoutingIndex,
): TopicClaimIndex {
	const byType = new Map<string, ResolvedTopicClaim[]>();
	const fallbacks: ResolvedTopicClaim[] = [];
	const claimedWidgetIds = new Set<string>();

	for (const claim of claims) {
		const entry = index.byWidgetId.get(claim.widgetId);
		if (!entry) {
			// Routine rather than exceptional: the plugin shipping that widget
			// may simply be disabled in this build.
			warnOnce(
				`${describe(claim)} names a widget this build does not have`,
			);
			continue;
		}

		const slot =
			claim.slot === undefined
				? undefined
				: entry.slots.find(
						(candidate) => slotPath(candidate) === claim.slot,
					);
		const rejection = rejectionReason(claim, entry, slot);
		if (rejection) {
			warnOnce(`${describe(claim)} ${rejection}`);
			continue;
		}

		const resolved: ResolvedTopicClaim = {
			claim,
			entry,
			slot,
			priority: claim.priority ?? 0,
		};
		claimedWidgetIds.add(entry.widgetId);

		if (claim.role === "fallback") {
			fallbacks.push(resolved);
			continue;
		}
		const list = byType.get(claim.type);
		if (list) list.push(resolved);
		else byType.set(claim.type, [resolved]);
	}

	const byPriority = (a: ResolvedTopicClaim, b: ResolvedTopicClaim) =>
		a.priority - b.priority;
	byType.forEach((list) => list.sort(byPriority));
	fallbacks.sort(byPriority);

	return { byType, fallbacks, claimedWidgetIds };
}

/** Single-entry cache; both inputs are stable across renders by construction. */
let claimIndexCache: {
	claims: TopicRoutingClaims;
	index: TopicRoutingIndex;
	result: TopicClaimIndex;
} | null = null;

/**
 * Claim index for the current registry, memoised on the identity of its inputs.
 *
 * `getTopicRoutingIndex` is memoised on definition *content* and the claims
 * array comes from a `useMemo` over the plugins manager, so both are stable
 * across renders and identity is the right key here.
 *
 * @param claims - Claims collected from the plugin registry.
 * @param index - Routing index over the current widget registry.
 * @returns The claim index, reused while the inputs are unchanged.
 */
export function getTopicClaimIndex(
	claims: TopicRoutingClaims,
	index: TopicRoutingIndex,
): TopicClaimIndex {
	if (
		claimIndexCache &&
		claimIndexCache.claims === claims &&
		claimIndexCache.index === index
	) {
		return claimIndexCache.result;
	}
	const result = buildTopicClaimIndex(claims, index);
	claimIndexCache = { claims, index, result };
	return result;
}

/** Drop the memoised claim index. Exposed for tests; never needed at runtime. */
export function resetTopicClaimIndexCache(): void {
	claimIndexCache = null;
}

/**
 * Identity of what a claim resolves to, for deduplication.
 *
 * A slotless claim's destination is the widget itself: it has no slot to
 * distinguish, and two of them for one widget are the same answer.
 *
 * @param resolved - A claim matched against the registry.
 * @returns A key equal for two claims that name the same destination.
 */
export function claimDestination(resolved: ResolvedTopicClaim): string {
	return `${resolved.entry.widgetId}::${resolved.slot?.slotId ?? ""}`;
}

/**
 * Every typed claim that answers this topic, webapp type first then raw schema
 * name, each group in priority order.
 *
 * Fallback claims are not included: they answer every type and are collected
 * separately so they can always be offered last.
 *
 * **Deduplicated by destination, not by claim.** A plugin whose widget reads a
 * message the converters also give a webapp name declares the claim twice —
 * once per name space — because it cannot know which datasource the operator
 * will connect through. A topic that carries both names then matches both
 * claims, and since those are two distinct objects naming one widget and one
 * slot, an identity check lets both through and the widget is offered twice.
 * Two rows reading "New ROSTainer Status" is a question the operator cannot
 * answer, so the first spelling wins and the second is dropped; webapp type is
 * tried first, which is also the more specific statement.
 *
 * @param index - Resolved claim index.
 * @param topic - Topic the operator picked.
 * @returns Matching claims; empty when nothing claims the type.
 */
export function claimsForTopic(
	index: TopicClaimIndex,
	topic: DatasourceTopic,
): ResolvedTopicClaim[] {
	const matched: ResolvedTopicClaim[] = [];
	const seen = new Set<string>();

	for (const key of [topic.type, topic.rawType]) {
		if (!key) continue;
		for (const resolved of index.byType.get(key) ?? []) {
			const destination = claimDestination(resolved);
			if (seen.has(destination)) continue;
			seen.add(destination);
			matched.push(resolved);
		}
	}
	return matched;
}
