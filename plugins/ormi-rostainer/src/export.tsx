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
		required: ["title"],
	},
	uischema: {
		type: "VerticalLayout",
		elements: [
			{ type: "Control", scope: "#/properties/title" },
			// This widget reads a `diagnostic_msgs/msg/DiagnosticArray` and
			// nothing else. It used to declare no `dataRequirements` at all,
			// on the belief that the type was invisible to the picker — it is
			// not: this plugin ships no datasource of its own, so the topic
			// arrives through Foxglove or ROSBridge, both of which convert
			// that schema to the `DiagnosticArray` webapp type. The effect of
			// the missing declaration was that routing counted the slot as a
			// universal raw viewer and offered ROSTainer for every topic in
			// the build, including ones it can only fail to parse. Being a raw
			// viewer is now something a plugin claims, so the inference is
			// gone — but the declaration is still what makes the picker offer
			// the right topics.
			//
			// Both forms are declared because they answer different questions:
			// `accepts` matches the converted webapp type, `acceptsRaw` the
			// wire schema, which is what a datasource that passes the message
			// through unconverted reports.
			{
				type: "TopicSelect",
				scope: "#/properties/topic",
				options: {
					dataRequirements: {
						accepts: ["DiagnosticArray"],
						acceptsRaw: ["diagnostic_msgs/msg/DiagnosticArray"],
					},
				},
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
