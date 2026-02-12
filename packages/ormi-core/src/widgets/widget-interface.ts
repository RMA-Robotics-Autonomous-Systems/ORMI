import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { JSX } from "react";

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
interface WidgetDefinition {
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
	/** Default settings for the widget. */
	data: any;

	/** React component that renders the widget. */
	Component: (data: any) => JSX.Element;
}

/** Widget instance in a dashboard layout. */
interface Widget {
	/** Widget definition id. */
	widget_id: string;
	/** Unique id for the widget instance. */
	box_id: string;
	/** Widget title. */
	title: string;
	/** Widget settings. */
	settings: any;
}

export type {
	WidgetDefinition,
	Widget,
	DataRequirements,
	TopicSelectElement,
	FrameSelectElement,
};
