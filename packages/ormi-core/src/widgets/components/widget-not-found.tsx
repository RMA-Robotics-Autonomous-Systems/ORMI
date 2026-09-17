import React, { JSX } from "react";
import { PuzzleIcon } from "lucide-react";

import { WidgetDefinition } from "../widget-interface";
import {
	UnsupportedWidgetCard,
	WIDGET_DEFINITION_MISSING_ID,
} from "./widget-status";

/**
 * Body of the placeholder definition.
 *
 * The placeholder is a shared singleton, so it knows neither the stored
 * `widget_id` nor the instance title — `WidgetHost` detects the missing
 * definition itself and renders {@link UnsupportedWidgetCard} with both. This
 * body is the last resort for any other consumer that renders
 * `definition.Component` directly, and says the same thing with less detail
 * rather than falling back to a crash.
 *
 * @returns React element.
 */
const UnsupportedWidgetPlaceholder = (): JSX.Element => (
	<UnsupportedWidgetCard reason="missing-definition" />
);

/**
 * Placeholder definition returned by the dashboard resolver when no loaded
 * plugin provides a stored `widget_id`.
 *
 * The resolver's contract is non-nullable — every call site uses
 * `definition.Component` and `definition.schema` unconditionally — so the
 * absence of a definition is carried by this object rather than by `null`.
 * Its reserved id is what {@link isWidgetDefinitionMissing} tests for.
 */
export const widgetNotFound = {
	id: WIDGET_DEFINITION_MISSING_ID,
	name: "Unsupported widget",
	description: "No plugin in this build provides this widget type.",
	icon: <PuzzleIcon />,
	schema: {
		type: "object",
		properties: {},
	},
	uischema: {
		type: "Control",
		scope: "#",
	},
	data: {},
	Component: UnsupportedWidgetPlaceholder,
} as WidgetDefinition;
