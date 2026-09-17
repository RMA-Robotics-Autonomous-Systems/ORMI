/**
 * Topic-first routing: given a topic the operator picked, decide which widget
 * should show it and where the topic value is written.
 *
 * The dashboard's normal direction is widget-first — add a widget, then hunt
 * for a topic to put in it. This module inverts that: the operator points at a
 * topic and the dashboard works out the rest, appending to a viewer that is
 * already open when one can take another series.
 *
 * **The mapping is claimed, never inferred.** Which widget answers a type is
 * stated by the plugin that ships that widget, as a {@link TopicClaim}; see
 * `topic-claims.ts` for why. Nothing here reads an `accepts` list to decide
 * where a topic goes — `dataRequirements` answers *compatibility* (may this
 * widget take this topic?) and a claim answers *routing* (should a click on
 * this topic open it?). This module walks the uischema only to find out **where
 * inside the settings** a claimed slot writes its value.
 *
 * Everything here is pure and synchronous. Four rules keep it from guessing:
 *
 * - **A command is never automatic.** A claim whose role is `"command"` names a
 *   slot the widget writes to; it is only ever offered as an option the
 *   operator picks deliberately, so a sensor topic can never be silently bound
 *   to a control that commands a robot.
 * - **A slot that needs a companion topic is never automatic.** An array item
 *   whose schema also requires a sibling topic is offered, never chosen:
 *   writing this topic alone leaves the widget dereferencing a binding that is
 *   not there, which crashes the tile rather than showing an empty one.
 * - **An unclaimed type is named, not guessed.** A type no plugin claims falls
 *   through to the declared raw viewers, or to a `none` decision that says so.
 * - **A tie asks.** Automatic placement happens only when the choice is forced
 *   by the claims; otherwise the decision carries its options and the caller
 *   presents them.
 */

import { JsonSchema } from "@jsonforms/core";
import {
	DatasourceTopic,
	SelectedTopic,
} from "../datasources/datasource-interface";
import {
	buildSelectedTopic,
	deriveTopicBufferSize,
} from "../renderers/topic-selection/topic-auto-select";
import {
	EMPTY_TOPIC_CLAIM_INDEX,
	claimDestination,
	claimsForTopic,
	type ResolvedTopicClaim,
	type TopicClaimIndex,
} from "./topic-claims";
import {
	DataRequirements,
	TopicSlotDirection,
	TopicSlotRole,
	Widget,
	WidgetDefinition,
} from "./widget-interface";

// ---------------------------------------------------------------------------
// Slot index
// ---------------------------------------------------------------------------

/**
 * One `TopicSelect` slot of one widget definition, described well enough to
 * write a topic into a settings object without consulting the uischema again.
 */
export interface RoutableSlot {
	/** Widget definition id this slot belongs to. */
	widgetId: string;
	/**
	 * Stable identity of the slot within its widget, so a decision can be
	 * serialized, compared or used as a React key.
	 */
	slotId: string;
	/**
	 * Dot path to the array holding the slot's items, when the slot is
	 * array-backed (the append target). Absent for a single-value slot.
	 */
	arrayPath?: string;
	/**
	 * Dot path the topic value is written to. Absolute within the widget's
	 * settings for a single-value slot; relative to one array item when
	 * {@link arrayPath} is present.
	 */
	path: string;
	/** True when the slot lives inside an array and therefore accepts more topics. */
	isArray: boolean;
	/** Data requirements declared on the slot, if any. */
	requirements?: DataRequirements;
	/** Declared direction; defaults to `"subscribe"`. */
	direction: TopicSlotDirection;
	/** Declared role; defaults to `"primary"`. */
	role: TopicSlotRole;
	/** Document order of the slot within the widget's uischema. */
	order: number;
	/** Per-slot history depth to stamp on the bound topic, if the slot declared one. */
	bufferSize?: number;
	/**
	 * Sibling topics the operator would still have to bind by hand before this
	 * slot's value is usable. Empty for a slot that stands on its own.
	 *
	 * An array-backed slot whose item schema lists another `TopicSelect`
	 * property in `required` is one of these: routing appends an item carrying
	 * only this topic, and the widget then dereferences a companion that was
	 * never bound. Each entry is the companion's schema `title` when its author
	 * declared one and its property name otherwise, so a caller can say which
	 * topic is still needed without re-reading the schema.
	 */
	requiresCompanions: string[];
}

/** Routing-relevant view of one widget definition. */
export interface WidgetRoutingEntry {
	/** Widget definition id. */
	widgetId: string;
	/** Widget display name. */
	widgetName: string;
	/** Slots of this widget that a topic may be routed into. */
	slots: RoutableSlot[];
}

/** Reverse index from widget definitions to their routable slots. */
export interface TopicRoutingIndex {
	/** One entry per widget definition that has at least one routable slot. */
	entries: WidgetRoutingEntry[];
	/** Entries by widget definition id. */
	byWidgetId: Map<string, WidgetRoutingEntry>;
}

/** Options carried by a `TopicSelect` uischema element. */
interface TopicSelectOptions {
	dataRequirements?: DataRequirements;
	direction?: TopicSlotDirection;
	role?: TopicSlotRole;
	buffer?: number;
}

/** Minimal structural view of a uischema node, since JsonForms types are loose. */
interface UiNode {
	type?: string;
	scope?: string;
	elements?: UiNode[];
	options?: Record<string, unknown>;
}

/**
 * Convert a JsonForms scope to a dot path into the data object.
 * @param scope - Scope string such as `#/properties/a/properties/b`.
 * @returns Dot path such as `a.b`, or `""` for the root scope.
 */
export function scopeToPath(scope: string | undefined): string {
	if (!scope) return "";
	return scope
		.replace(/^#\/?/, "")
		.split("/")
		.filter((segment) => segment.length > 0 && segment !== "properties")
		.join(".");
}

/**
 * Resolve the JSON schema node addressed by a dot path.
 * @param schema - Root widget settings schema.
 * @param path - Dot path, `""` for the root.
 * @returns The schema node, or undefined when the path does not resolve.
 */
export function resolveSchemaAtPath(
	schema: JsonSchema | undefined,
	path: string,
): JsonSchema | undefined {
	if (!schema) return undefined;
	if (path === "") return schema;

	let node: JsonSchema | undefined = schema;
	for (const segment of path.split(".")) {
		const properties = node?.properties as
			Record<string, JsonSchema> | undefined;
		node = properties?.[segment];
		if (!node) return undefined;
	}
	return node;
}

/**
 * Flag the slots of one array item that cannot be filled on their own.
 *
 * The item's schema `required` list is the widget author's own statement that
 * the item is incomplete without those properties. When one of them is another
 * `TopicSelect` in the same item, routing a topic here would append an item
 * with a topic the operator never chose left missing — `maps-box-viewer`'s IMU
 * layer requires its `gpsOriginTopic` and dereferences it immediately, so the
 * tile crashes rather than rendering empty. A required property that is not a
 * topic is not a companion: {@link seedArrayItem} fills those from the schema.
 *
 * @param slots - Slot list being built, mutated in place.
 * @param first - Index in `slots` where this array item's slots begin.
 * @param itemSchema - Schema of one array item.
 */
function markCompanions(
	slots: RoutableSlot[],
	first: number,
	itemSchema: JsonSchema | undefined,
): void {
	const required = Array.isArray(itemSchema?.required)
		? (itemSchema.required as string[])
		: [];
	if (required.length === 0) return;

	const item = slots.slice(first);
	const properties = itemSchema?.properties as
		Record<string, JsonSchema> | undefined;

	for (const slot of item) {
		slot.requiresCompanions = required
			.filter(
				(name) =>
					name !== slot.path &&
					item.some((sibling) => sibling.path === name),
			)
			.map((name) => properties?.[name]?.title ?? name);
	}
}

/**
 * Walk a widget's uischema and collect every `TopicSelect` slot a topic could
 * be routed into.
 *
 * Publish slots and secondary slots are collected too: a claim may name a
 * publish slot (as a command), and validating a claim that names a secondary
 * slot requires seeing it. Nothing is filtered here — the index describes the
 * widget, the claims decide what is offered.
 *
 * @param definition - Widget definition to inspect.
 * @returns Routable slots in document order.
 */
export function collectRoutableSlots(
	definition: WidgetDefinition,
): RoutableSlot[] {
	const slots: RoutableSlot[] = [];
	let order = 0;

	const visit = (node: UiNode | undefined, arrayPath?: string): void => {
		if (!node || typeof node !== "object") return;

		if (node.type === "TopicSelect") {
			const options = (node.options ?? {}) as TopicSelectOptions;
			const requirements = options.dataRequirements;
			const bufferSize = deriveTopicBufferSize(options);
			const path = scopeToPath(node.scope);
			slots.push({
				widgetId: definition.id,
				slotId: `${definition.id}::${arrayPath ?? ""}::${path}`,
				...(arrayPath === undefined ? {} : { arrayPath }),
				path,
				isArray: arrayPath !== undefined,
				...(requirements === undefined ? {} : { requirements }),
				direction: options.direction ?? "subscribe",
				role: options.role ?? "primary",
				order: order++,
				...(bufferSize === undefined ? {} : { bufferSize }),
				requiresCompanions: [],
			});
			return;
		}

		// A Control whose scope resolves to an array schema node and whose
		// options carry a detail layout is an append target: the detail
		// elements describe one item, and a TopicSelect inside them is a slot
		// that can hold many topics rather than one.
		const detail = node.options?.detail as UiNode | boolean | undefined;
		if (
			node.type === "Control" &&
			detail &&
			typeof detail === "object" &&
			Array.isArray(detail.elements) &&
			arrayPath === undefined
		) {
			const candidatePath = scopeToPath(node.scope);
			const target = resolveSchemaAtPath(
				definition.schema,
				candidatePath,
			);
			if (target?.type === "array") {
				const first = slots.length;
				detail.elements.forEach((child) => visit(child, candidatePath));
				markCompanions(
					slots,
					first,
					target.items as JsonSchema | undefined,
				);
				return;
			}
		}

		if (Array.isArray(node.elements)) {
			node.elements.forEach((child) => visit(child, arrayPath));
		}
	};

	visit(definition.uischema as UiNode | undefined);
	return slots;
}

/** Compact, content-only fingerprint of one widget's routable slots. */
function entrySignature(entry: WidgetRoutingEntry): string {
	return entry.slots
		.map(
			(slot) =>
				`${slot.slotId}|${slot.arrayPath ?? ""}|${slot.direction}|${slot.role}|` +
				`${slot.requirements?.accepts?.join(",") ?? ""}|` +
				`${slot.requirements?.acceptsRaw?.join(",") ?? ""}|${slot.bufferSize ?? ""}|` +
				`${slot.requiresCompanions.join(",")}`,
		)
		.join(";");
}

/** Per-definition walk cache, hit when a plugin hands out stable definitions. */
const slotCache = new WeakMap<WidgetDefinition, RoutableSlot[]>();

/** Single-entry index cache, keyed on the content of every definition. */
let indexCache: { key: string; index: TopicRoutingIndex } | null = null;

/**
 * Build the routing index from a list of widget definitions.
 *
 * Pure and uncached — prefer {@link getTopicRoutingIndex} from React code.
 *
 * @param definitions - Widget definitions resolved from the plugin registry.
 * @returns The routing index.
 */
export function buildTopicRoutingIndex(
	definitions: WidgetDefinition[],
): TopicRoutingIndex {
	const entries: WidgetRoutingEntry[] = [];
	const byWidgetId = new Map<string, WidgetRoutingEntry>();

	for (const definition of definitions) {
		let slots = slotCache.get(definition);
		if (!slots) {
			slots = collectRoutableSlots(definition);
			slotCache.set(definition, slots);
		}
		// Widgets with no `TopicSelect` are indexed too. They used to be skipped,
		// which was right while routing was inferred from slots — a widget with
		// none could not be a destination. Under claims it can: a panel that
		// discovers its own topics (diagnostics, battery) is named by a slotless
		// claim, and skipping it here made that claim unresolvable and silently
		// dropped.
		const entry: WidgetRoutingEntry = {
			widgetId: definition.id,
			widgetName: definition.name,
			slots,
		};
		entries.push(entry);
		byWidgetId.set(definition.id, entry);
	}

	return { entries, byWidgetId };
}

/**
 * Routing index for the current widget registry, memoised on definition
 * *content*.
 *
 * `DashboardShell` resolves `WIDGETS_LIST` in its render body, so both the
 * definitions array and the definition objects inside it are new on every
 * render. Memoising on identity would never hit; memoising on content returns
 * the same index object across renders, which keeps downstream `useMemo`
 * results stable too.
 *
 * @param definitions - Widget definitions resolved from the plugin registry.
 * @returns The routing index, reused while the definitions' content is unchanged.
 */
export function getTopicRoutingIndex(
	definitions: WidgetDefinition[],
): TopicRoutingIndex {
	const index = buildTopicRoutingIndex(definitions);
	const key = index.entries
		.map((entry) => `${entry.widgetId}#${entrySignature(entry)}`)
		.join(" ");

	if (indexCache && indexCache.key === key) return indexCache.index;
	indexCache = { key, index };
	return index;
}

/** Drop the memoised index. Exposed for tests; never needed at runtime. */
export function resetTopicRoutingIndexCache(): void {
	indexCache = null;
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/** One way to show the clicked topic. */
export interface RoutingOption {
	/** Append into an open widget's array slot, or create a new widget. */
	kind: "append" | "create";
	/** Widget definition id. */
	widgetId: string;
	/** Widget display name. */
	widgetName: string;
	/**
	 * Slot the topic is written into, or absent when the widget discovers its
	 * own topics and there is nothing to write.
	 *
	 * A caller that applies this option must branch on it: writing a topic
	 * into a widget that has no slot for it is how an operator ends up
	 * believing they bound something they did not.
	 */
	slot?: RoutableSlot;
	/**
	 * What the widget does with the topic through this slot: `"subscribe"`
	 * displays it, `"publish"` commands with it. Carried on the option so a
	 * caller can label and style the two differently without inspecting the
	 * slot — an operator must never mistake commanding a robot for viewing it.
	 */
	direction: TopicSlotDirection;
	/** Box id of the open widget instance — `append` only. */
	boxId?: string;
	/** Title of the open widget instance — `append` only. */
	instanceTitle?: string;
}

/** What should happen when the operator picks a topic. */
export type RoutingDecision =
	| { kind: "append"; option: RoutingOption; reason: string }
	| { kind: "create"; option: RoutingOption; reason: string }
	| { kind: "ask"; options: RoutingOption[]; reason: string }
	/**
	 * A widget that discovers its own topics is already on the dashboard, so
	 * this topic is already on screen and there is nothing to do.
	 *
	 * Distinct from `"none"`, which means nothing can show the topic at all —
	 * the opposite situation and the opposite thing to tell an operator. It
	 * carries the instance so a caller can draw attention to it rather than
	 * leaving the click looking ignored.
	 */
	| { kind: "present"; boxId: string; widgetName: string; reason: string }
	| { kind: "none"; reason: string };

/** Inputs to {@link resolveTopicRoute}. */
export interface ResolveTopicRouteOptions {
	/** Topic the operator picked. */
	topic: DatasourceTopic;
	/** Widgets currently on the dashboard, by box id. */
	widgets: Map<string, Widget>;
	/**
	 * Claims resolved against the current registry, from
	 * `getTopicClaimIndex(claims, getTopicRoutingIndex(definitions))`. Omitted
	 * means nothing is claimed, so every topic resolves to `none`.
	 */
	claims?: TopicClaimIndex;
}

/** A claim as a routing option the caller can act on. */
function toOption(match: ResolvedTopicClaim): RoutingOption {
	return {
		kind: "create",
		widgetId: match.entry.widgetId,
		widgetName: match.entry.widgetName,
		...(match.slot === undefined ? {} : { slot: match.slot }),
		// A widget that discovers its own topics subscribes to all of them, so
		// nothing it does reaches a robot: with no slot there is no direction
		// to report and "subscribe" is the honest answer.
		direction: match.slot?.direction ?? "subscribe",
	};
}

/** The claims for a topic, grouped by what the decision may do with them. */
interface GroupedClaims {
	/** Automatic destinations: `"default"` claims that stand on their own. */
	defaults: ResolvedTopicClaim[];
	/** Offered destinations: `"alternative"` claims. */
	alternatives: ResolvedTopicClaim[];
	/** Destinations still missing a companion topic — offered, never chosen. */
	pending: ResolvedTopicClaim[];
	/** Controls that command the type. */
	commands: ResolvedTopicClaim[];
	/** Declared raw viewers, offered for every type. */
	fallbacks: ResolvedTopicClaim[];
}

/**
 * Sort a topic's claims into the groups the decision is made from.
 *
 * The only rule applied beyond the claim's own role is the companion one: a
 * claim whose slot sits in an array item that also *requires* a sibling topic
 * is demoted out of the automatic group, whatever it claims. The plugin cannot
 * know that from the type, and appending an item with half its required topics
 * bound leaves the widget dereferencing a binding that is not there.
 */
function groupClaims(
	claims: TopicClaimIndex,
	topic: DatasourceTopic,
): GroupedClaims {
	const grouped: GroupedClaims = {
		defaults: [],
		alternatives: [],
		pending: [],
		commands: [],
		fallbacks: [],
	};

	// Destinations already answered by a typed claim, so a widget that also
	// declares itself a raw viewer is not offered a second time further down
	// the list. A plugin can legitimately do both: "I display this type, and
	// I will take anything else."
	const claimed = new Set<string>();

	for (const match of claimsForTopic(claims, topic)) {
		claimed.add(claimDestination(match));
	}

	grouped.fallbacks = claims.fallbacks.filter(
		(match) => !claimed.has(claimDestination(match)),
	);

	for (const match of claimsForTopic(claims, topic)) {
		const incomplete = (match.slot?.requiresCompanions.length ?? 0) > 0;
		switch (match.claim.role) {
			case "default":
				(incomplete ? grouped.pending : grouped.defaults).push(match);
				break;
			case "alternative":
				(incomplete ? grouped.pending : grouped.alternatives).push(
					match,
				);
				break;
			case "command":
				grouped.commands.push(match);
				break;
			default:
				break;
		}
	}

	// The claim index orders each *type key* by priority, and a topic can match
	// on two (its webapp type and its raw schema name), so re-sort the merged
	// groups. Stable, so an unstated priority leaves the webapp type first —
	// the name the product speaks.
	const byPriority = (a: ResolvedTopicClaim, b: ResolvedTopicClaim) =>
		a.priority - b.priority;
	grouped.defaults.sort(byPriority);
	grouped.alternatives.sort(byPriority);
	grouped.pending.sort(byPriority);
	grouped.commands.sort(byPriority);

	return grouped;
}

/**
 * Decide where a picked topic should go.
 *
 * Precedence, highest first:
 *
 * 1. **A single open viewer that can take another series** — the whole point of
 *    the feature: a second number topic joins the chart already on screen. This
 *    is context, not inference, so it stays; it is restricted to widgets that
 *    claim the type, so an open widget can never become a destination its
 *    plugin never offered. Several such viewers is a real question, so it asks.
 * 2. **The sole `"default"` claim for the type**, or the one whose `priority`
 *    is strictly lower than every other default's. Defaults that tie on
 *    priority ask: two plugins have both said "this is the destination" and
 *    nothing has said which wins.
 *
 * There is no third rung. A type with no default claim asks (or, with nothing
 * claiming it at all, returns `none` naming the type), because every automatic
 * answer this module can give is one a plugin wrote down.
 *
 * `"alternative"` claims, `"command"` claims, a slot still missing a companion
 * topic and the declared raw viewers are all *offered* — they appear among an
 * `ask`'s options, where picking one is a deliberate act — and none of them can
 * ever be returned as a `create` or an `append`.
 *
 * @param options - Topic, open widgets and the resolved claims.
 * @returns The decision, always carrying a reason for the UI to show.
 */
export function resolveTopicRoute(
	options: ResolveTopicRouteOptions,
): RoutingDecision {
	const { topic, widgets } = options;
	const claims = options.claims ?? EMPTY_TOPIC_CLAIM_INDEX;
	const { defaults, alternatives, pending, commands, fallbacks } =
		groupClaims(claims, topic);

	const typeLabel = topic.type || topic.rawType || "unknown type";

	if (
		defaults.length === 0 &&
		alternatives.length === 0 &&
		pending.length === 0 &&
		commands.length === 0 &&
		fallbacks.length === 0
	) {
		return {
			kind: "none",
			reason: `No widget claims '${typeLabel}' topics.`,
		};
	}

	// 0 — a widget that discovers its own topics, already on the dashboard.
	// It subscribes to every topic of the type, so this one is on screen
	// already: adding a second identical panel is the wrong answer, and so is
	// silently doing nothing. Checked before the append rung because it is the
	// same idea one step further — the topic is already where it belongs.
	for (const match of [...defaults, ...alternatives]) {
		if (match.slot !== undefined) continue;
		for (const [boxId, widget] of widgets) {
			if (widget.widget_id !== match.entry.widgetId) continue;
			return {
				kind: "present",
				boxId,
				widgetName: widget.title || match.entry.widgetName,
				reason: `${widget.title || match.entry.widgetName} already shows ${topic.topic}.`,
			};
		}
	}

	// 1 — an open viewer that can take another series. An offered match is an
	// append the operator may still pick, so it is collected separately: it
	// never counts towards the automatic answer.
	const appendOptions: RoutingOption[] = [];
	const pendingAppends: RoutingOption[] = [];
	for (const [boxId, widget] of widgets) {
		const openMatch = (
			list: ResolvedTopicClaim[],
		): ResolvedTopicClaim | undefined =>
			list.find(
				(match) =>
					match.entry.widgetId === widget.widget_id &&
					match.slot?.isArray === true,
			);
		const ready = openMatch(defaults);
		const target = ready ?? openMatch(alternatives) ?? openMatch(pending);
		if (!target) continue;
		(ready ? appendOptions : pendingAppends).push({
			...toOption(target),
			kind: "append",
			boxId,
			instanceTitle: widget.title,
		});
	}

	// Displays lead, commands come last, and the declared raw viewers sit
	// between them: a fallback is still a way to *see* the topic, while
	// commanding a robot with it is a different act and never shares a heading.
	const askOptions = [
		...appendOptions,
		...pendingAppends,
		...defaults.map(toOption),
		...alternatives.map(toOption),
		...pending.map(toOption),
		...fallbacks.map(toOption),
		...commands.map(toOption),
	];

	if (appendOptions.length === 1) {
		const option = appendOptions[0]!;
		return {
			kind: "append",
			option,
			reason: `Added to ${option.instanceTitle || option.widgetName}.`,
		};
	}
	if (appendOptions.length > 1) {
		return {
			kind: "ask",
			options: askOptions,
			reason: `${appendOptions.length} open widgets can show this topic.`,
		};
	}

	// 2 — the claimed default. Already priority-ordered by the claim index, so
	// the winner is the head and the tie is the head sharing its priority.
	const winner = defaults[0];
	if (
		winner &&
		(defaults.length === 1 || winner.priority < defaults[1]!.priority)
	) {
		return {
			kind: "create",
			option: toOption(winner),
			reason: `${winner.entry.widgetName} is the declared widget for '${typeLabel}'.`,
		};
	}

	return {
		kind: "ask",
		options: askOptions,
		reason: unmatchedReason(
			typeLabel,
			defaults,
			alternatives,
			pending,
			fallbacks,
		),
	};
}

/** Inputs to {@link resolveTopicCommands}. */
export interface ResolveTopicCommandsOptions {
	/** Topic the operator picked. */
	topic: DatasourceTopic;
	/** Claims resolved against the current registry. */
	claims?: TopicClaimIndex;
}

/**
 * Every control that would command this topic, as routing options.
 *
 * Separate from {@link resolveTopicRoute} because commanding is a separate
 * question, not a weaker answer to the display one. Routing never returns a
 * command as a `create` or an `append`, so when the display decision is
 * forced — one chart for a `number` topic, which is the ordinary case — the
 * `ask` that would have carried the controls never happens and they are simply
 * dropped. Placing a viewer then costs one click and placing a control costs a
 * trip to the widget catalogue plus a topic picker, for no reason an operator
 * could name.
 *
 * This is how a surface offers the command destinations alongside the display
 * one at equal cost. It is deliberately not folded into the decision: a caller
 * that asks for a route must not be handed a control by accident.
 *
 * @param options - Topic and the resolved claims.
 * @returns Create options for each control that claims the topic, in priority
 * order. Empty when no control claims it.
 */
export function resolveTopicCommands(
	options: ResolveTopicCommandsOptions,
): RoutingOption[] {
	const claims = options.claims ?? EMPTY_TOPIC_CLAIM_INDEX;
	const { defaults, alternatives, pending, commands, fallbacks } =
		groupClaims(claims, options.topic);

	// A widget routing itself calls a viewer for this topic is a viewer here
	// too, even when it also claims the type as a command. Offering it in both
	// groups would put a control under the operator's pointer that the display
	// list already claimed, which is the one direction this split must never
	// fail in.
	const displaying = new Set(
		[...defaults, ...alternatives, ...pending, ...fallbacks].map(
			(match) => match.entry.widgetId,
		),
	);

	return commands
		.filter((match) => !displaying.has(match.entry.widgetId))
		.map(toOption);
}

/**
 * Why nothing could be chosen for a topic, in the words of what is on offer.
 *
 * Defaults that tie is a different sentence from no default at all: the first
 * says the product has two answers, the second asks which use the operator
 * meant. A missing companion topic is named next, because that is the one case
 * where the operator has to do something specific after picking; a raw viewer
 * after that; and a topic only controls claim says so, so nobody reads "no
 * widget displays this" and then sees a list of controls.
 */
function unmatchedReason(
	typeLabel: string,
	defaults: ResolvedTopicClaim[],
	alternatives: ResolvedTopicClaim[],
	pending: ResolvedTopicClaim[],
	fallbacks: ResolvedTopicClaim[],
): string {
	if (defaults.length > 1) {
		return `${defaults.length} widgets are declared for '${typeLabel}'.`;
	}
	if (alternatives.length > 0) {
		return `Choose how to use this '${typeLabel}' topic.`;
	}
	const first = pending[0];
	if (first) {
		return (
			`${first.entry.widgetName} can show '${typeLabel}' once you also ` +
			`choose ${(first.slot?.requiresCompanions ?? []).join(" and ")}.`
		);
	}
	if (fallbacks.length > 0) {
		return `No widget claims '${typeLabel}' directly — pick a raw viewer.`;
	}
	return `No widget displays '${typeLabel}' — only controls that command it.`;
}

// ---------------------------------------------------------------------------
// Applying a decision
// ---------------------------------------------------------------------------

/**
 * Series colours assigned to appended topics, cycled by position in the target
 * array.
 *
 * An appended item has to carry a colour of its own: `timeseries-chart` and
 * `chart-echarts` both declare a `color` property with no schema default, and
 * a chart whose lines are all the same colour is unreadable long before anyone
 * thinks to open the settings dialog. Okabe–Ito-derived, distinguishable under
 * the common colour-vision deficiencies and legible on both themes.
 */
export const TOPIC_ROUTING_PALETTE = [
	"#4e79a7",
	"#f28e2b",
	"#59a14f",
	"#e15759",
	"#b07aa1",
	"#76b7b2",
	"#edc948",
	"#9c755f",
	"#ff9da7",
	"#bab0ac",
] as const;

/** Set a dot path on a settings object, cloning only the nodes on the path. */
function setAtPath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
): Record<string, unknown> {
	const segments = path.split(".");
	const head = segments[0]!;
	const next = { ...target };

	if (segments.length === 1) {
		next[head] = value;
		return next;
	}

	const child = target[head];
	next[head] = setAtPath(
		child && typeof child === "object" && !Array.isArray(child)
			? (child as Record<string, unknown>)
			: {},
		segments.slice(1).join("."),
		value,
	);
	return next;
}

/** Read a dot path from a settings object. */
function getAtPath(
	source: Record<string, unknown> | undefined,
	path: string,
): unknown {
	let node: unknown = source;
	for (const segment of path.split(".")) {
		if (!node || typeof node !== "object") return undefined;
		node = (node as Record<string, unknown>)[segment];
	}
	return node;
}

/**
 * Seed one array item from its schema so an appended entry is usable without
 * opening the settings dialog.
 *
 * Every property with a `default` takes it. A property with an `enum` and no
 * default takes its first value — a map marker with no marker type, or a chart
 * series with no series type, renders nothing at all, which reads as "the
 * topic did not arrive". A `name`/`label` takes the topic name and a `color`
 * takes the next palette entry, both of which are otherwise blank.
 */
function seedArrayItem(
	itemSchema: JsonSchema | undefined,
	topic: DatasourceTopic,
	position: number,
): Record<string, unknown> {
	const item: Record<string, unknown> = {};
	const properties = itemSchema?.properties as
		Record<string, JsonSchema> | undefined;
	if (!properties) return item;

	for (const [name, property] of Object.entries(properties)) {
		if (property.default !== undefined) {
			item[name] = property.default;
			continue;
		}
		if (Array.isArray(property.enum) && property.enum.length > 0) {
			item[name] = property.enum[0];
			continue;
		}
		if (property.type === "string") {
			const lower = name.toLowerCase();
			if (lower === "name" || lower === "label") {
				item[name] = topic.topic;
			} else if (lower === "color") {
				item[name] =
					TOPIC_ROUTING_PALETTE[
						position % TOPIC_ROUTING_PALETTE.length
					];
			}
			continue;
		}
		if (property.type === "object" && property.properties) {
			const nested = seedArrayItem(property, topic, position);
			if (Object.keys(nested).length > 0) item[name] = nested;
		}
	}

	return item;
}

/** Collect every `default` declared in a schema, recursing into objects. */
function schemaDefaults(
	schema: JsonSchema | undefined,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const properties = schema?.properties as
		Record<string, JsonSchema> | undefined;
	if (!properties) return out;

	for (const [name, property] of Object.entries(properties)) {
		if (property.default !== undefined) {
			out[name] = property.default;
			continue;
		}
		if (property.type === "object" && property.properties) {
			const nested = schemaDefaults(property);
			if (Object.keys(nested).length > 0) out[name] = nested;
		}
	}
	return out;
}

/**
 * Build the starting settings for a widget created by a routing decision.
 *
 * The widget config dialog resolves schema defaults through JsonForms before
 * the operator ever sees it; a routed widget skips the dialog, so the defaults
 * have to be applied here or it starts with required properties missing and a
 * settings form that refuses to validate on first open. The definition's own
 * `data` wins over a schema default, as it does in the dialog.
 *
 * @param definition - Widget definition being instantiated.
 * @returns A settings object carrying schema defaults merged under `data`.
 */
export function createWidgetSettings(
	definition: WidgetDefinition,
): Record<string, unknown> {
	return {
		...schemaDefaults(definition.schema),
		...(definition.data as Record<string, unknown>),
	};
}

/** Result of writing a topic into a settings object. */
export interface AppliedTopicRoute {
	/** The new settings object. */
	settings: Record<string, unknown>;
	/** The topic value written. */
	selected: SelectedTopic;
}

/**
 * Write a topic into a widget's settings according to a routing slot.
 *
 * Immutable: only the objects on the write path are cloned, so entries already
 * in an append target keep their identity and a widget that memoises per series
 * does not tear them down.
 *
 * @param settings - Current widget settings (the definition's `data` for a new widget).
 * @param slot - Slot resolved by {@link resolveTopicRoute}.
 * @param topic - Topic to bind.
 * @param schema - Widget settings schema, used to seed appended array items.
 * @returns The new settings and the bound topic value.
 */
export function applyTopicToSettings(
	settings: Record<string, unknown>,
	slot: RoutableSlot,
	topic: DatasourceTopic,
	schema?: JsonSchema,
): AppliedTopicRoute {
	const selected = buildSelectedTopic(topic, "", slot.bufferSize);

	if (!slot.isArray || slot.arrayPath === undefined) {
		return {
			settings: setAtPath(settings, slot.path, selected),
			selected,
		};
	}

	const existing = getAtPath(settings, slot.arrayPath);
	const items = Array.isArray(existing) ? existing : [];
	const arraySchema = resolveSchemaAtPath(schema, slot.arrayPath);
	const itemSchema = arraySchema?.items as JsonSchema | undefined;

	const item = setAtPath(
		seedArrayItem(itemSchema, topic, items.length),
		slot.path,
		selected,
	);

	return {
		settings: setAtPath(settings, slot.arrayPath, [...items, item]),
		selected,
	};
}
