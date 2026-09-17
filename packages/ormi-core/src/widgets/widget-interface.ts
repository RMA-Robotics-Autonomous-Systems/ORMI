import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JSX } from "react";
import React from "react";
import { PluginsManager } from "@workspace/ormi-plugins";

/**
 * Data types a widget can accept — a statement of **compatibility**, never of
 * routing.
 *
 * It answers one question: *may* this slot take this topic? That is what the
 * configuration dialog, the topic pickers, `isTopicCompatible` and auto-bind
 * need, and it is honest in isolation because a widget author knows what their
 * own widget reads.
 *
 * It deliberately does **not** answer *should a click on this topic open this
 * widget?* Routing used to infer that from these lists, and the inference was
 * wrong in company rather than in isolation: a widget cannot see the registry
 * it is registered into, so the mapping fell out of declaration order and list
 * lengths. That question is answered by a `TopicClaim` registered on
 * `PluginsHooks.TOPIC_ROUTING_CLAIMS` — see
 * `packages/ormi-core/src/widgets/topic-claims.ts`. Widening an `accepts` list
 * therefore no longer moves the mapping; it only makes the widget selectable
 * for one more type in the pickers.
 */
interface DataRequirements {
	/** Webapp types this widget can handle (e.g., "number", "Vector3", "Movement"). */
	accepts: string[];
	/**
	 * Raw datasource (e.g. ROS) type names this widget can handle, matched
	 * directly against a topic's `rawType` (e.g. "c2_msgs/msg/SwarmLog"). Use
	 * this for topics that have no webapp type — the widget consumes the raw
	 * decoded message. A topic is compatible if its webapp type matches
	 * `accepts` OR its raw type matches `acceptsRaw`.
	 */
	acceptsRaw?: string[];
}

/**
 * Whether a `TopicSelect` slot reads from its topic or writes to it.
 *
 * Data requirements alone cannot tell the two apart: a button that publishes a
 * number to `/enable` and a gauge that displays a number from `/battery` both
 * declare `accepts: ["number"]`. Anything that picks a widget *for* a topic
 * must therefore be told, or it will offer to command a robot because someone
 * clicked a sensor. A topic claim naming this slot must agree with it — a
 * `"command"` claim on a subscribing slot, or any other claim on a publishing
 * one, is dropped rather than honoured.
 */
type TopicSlotDirection = "subscribe" | "publish";

/**
 * Whether a `TopicSelect` slot carries the widget's subject or supports it.
 *
 * `primary` is the topic the slot exists to show. `secondary` is a supporting
 * input — a heatmap's weighting channel, a local frame's GPS origin — that is
 * only meaningful once a primary topic is bound. Only `primary` slots can be
 * claimed as routing targets; a claim naming a secondary slot is dropped with a
 * warning, because a supporting input is never what a topic click meant.
 */
type TopicSlotRole = "primary" | "secondary";

/** TopicSelect UI schema element with data requirements. */
interface TopicSelectElement extends Omit<
	import("@jsonforms/core").ControlElement,
	"type"
> {
	type: "TopicSelect";
	options?: {
		dataRequirements?: DataRequirements;
		/**
		 * Direction of data flow for this slot. Defaults to `"subscribe"`.
		 *
		 * A slot the widget publishes to **must** declare `"publish"`: a claim
		 * on such a slot can only be a `"command"`, which is excluded from
		 * every *automatic* routing decision, so no automatic placement can
		 * ever bind a sensor topic to a control. They are still offered, in
		 * commanding rather than viewing vocabulary.
		 */
		direction?: TopicSlotDirection;
		/**
		 * Role of this slot within the widget. Defaults to `"primary"`.
		 *
		 * Declare `"secondary"` for a supporting input — a heatmap's weighting
		 * channel, a local frame's GPS origin — that is only meaningful once
		 * the widget's primary topic is bound. A secondary slot is not an
		 * entry point, so a topic claim naming one is dropped: make the slot
		 * primary if a topic click really should land in it.
		 */
		role?: TopicSlotRole;
	};
}

/** FrameSelect UI schema element. */
interface FrameSelectElement extends Omit<
	import("@jsonforms/core").ControlElement,
	"type"
> {
	type: "FrameSelect";
	options?: {
		placeholder?: string;
	};
}

/** Widget definition registered by a plugin. */
interface WidgetDefinition<
	TSettings extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Id of the widget definition. */
	id: string;
	/** Name shown in the widget list. */
	name: string;
	/** Description shown in the UI. */
	description: string;
	/** Optional icon for the widget. */
	icon?: JSX.Element;

	/** Property name used for the widget title. */
	titleProp?: string;

	/** JSON Schema describing widget settings. */
	schema: JsonSchema;
	/** UI schema describing widget settings layout. */
	uischema: UISchemaElement;
	/**
	 * Default/initial settings for the widget.
	 * May be partial — only required fields and sensible defaults.
	 * Full contract defined by schema; resolved settings passed to Component at runtime.
	 */
	data: Partial<TSettings>;

	/** React component that renders the widget. */
	Component: React.FC<TSettings>;

	/**
	 * Optional extensibility hook for plugins to modify the definition at registry time.
	 * Called after initial definition creation, allows plugins to extend schema, enums, etc.
	 * Hook receives the definition and pluginsManager; should mutate and return the definition.
	 * @param definition - The widget definition to mutate.
	 * @param pluginsManager - Plugin manager for accessing other registered extensions.
	 * @returns The mutated definition.
	 */
	extensibilityHook?: (
		definition: WidgetDefinition<TSettings>,
		pluginsManager: PluginsManager,
	) => WidgetDefinition<TSettings>;
}

/** Widget instance in a dashboard layout. */
interface Widget<
	TSettings extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Widget definition id. */
	widget_id: string;
	/** Unique id for the widget instance. */
	box_id: string;
	/** Widget title. */
	title: string;
	/** Widget settings. */
	settings: TSettings;
}

export type {
	WidgetDefinition,
	Widget,
	DataRequirements,
	TopicSelectElement,
	TopicSlotDirection,
	TopicSlotRole,
	FrameSelectElement,
};
