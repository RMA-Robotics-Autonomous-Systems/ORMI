import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JSX } from "react";
import React from "react";
import { PluginsManager } from "@workspace/ormi-plugins";

/** Data types a widget can accept. */
interface DataRequirements {
	/** Webapp types this widget can handle (e.g., "number", "Vector3", "Movement"). */
	accepts: string[];
}

/** TopicSelect UI schema element with data requirements. */
interface TopicSelectElement extends Omit<
	import("@jsonforms/core").ControlElement,
	"type"
> {
	type: "TopicSelect";
	options?: {
		dataRequirements?: DataRequirements;
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
	FrameSelectElement,
};
