"use client";

import React from "react";
import { BoxesIcon } from "lucide-react";
import type {
	WidgetDefinition,
	TopicSelectElement,
} from "@workspace/ormi-core/widgets";
import {
	RostainerStatusWidget,
	type RostainerStatusWidgetProps,
} from "./widgets/rostainer-status-widget";

const rostainerStatusWidget = {
	id: "rostainer-status-widget",
	name: "ROSTainer Status",
	description:
		"Monitor and control Docker containers managed by ROSTainer. Shows container state, health, uptime, and provides Restart / Pull actions.",
	titleProp: "title",
	icon: <BoxesIcon />,
	schema: {
		type: "object",
		properties: {
			title: { type: "string", title: "Title" },
			topic: { type: "object", title: "Status topic" },
		},
		required: ["title", "topic"],
	},
	uischema: {
		type: "VerticalLayout",
		elements: [
			{ type: "Control", scope: "#/properties/title" },
			// No dataRequirements: ROSTainer publishes a raw
			// `diagnostic_msgs/msg/DiagnosticArray` topic and the datasource is
			// content-agnostic — it exposes no webapp `type` for it, so the core
			// `accepts` filter (which matches on webapp type only) cannot select
			// it. The widget consumes the raw message directly and parses it
			// defensively instead of relying on a type mapping.
			{
				type: "TopicSelect",
				scope: "#/properties/topic",
			} as TopicSelectElement,
		],
	},
	data: { title: "ROSTainer" },
	Component: RostainerStatusWidget,
} as WidgetDefinition<RostainerStatusWidgetProps>;

const widgetDefinitions: WidgetDefinition<RostainerStatusWidgetProps>[] = [
	rostainerStatusWidget,
];

export { widgetDefinitions };
