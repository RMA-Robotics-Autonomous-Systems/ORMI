"use client";

import { LoadgenSourceProvider } from "./loadgen-source";
import {
	LoadSinkDefinition,
	LOAD_SINK_WIDGET_ID,
	LOADGEN_DATASOURCE_ID,
} from "./widgets/load-sink";

import { LoadgenSettings } from ".";
import {
	Datasource,
	DatasourceDefinition,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";

const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {
	datasources.push({
		id: "loadgen-source",
		name: "Load Generator",
		description:
			"Synthetic load datasource: configurable topics, rates, payload shapes, bursts, and fault injection",

		schema: {
			title: "Load Generator",
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				enable: { type: "boolean", title: "Enable" },

				preset: {
					type: "string",
					title: "Load preset",
					enum: ["light", "medium", "heavy", "custom"],
					default: "medium",
				},

				transport: {
					type: "string",
					title: "Transport",
					enum: ["worker", "main-thread"],
					default: "worker",
				},

				generators: {
					type: "array",
					title: "Generators",
					items: {
						type: "object",
						properties: {
							topicPrefix: {
								type: "string",
								title: "Topic prefix",
							},
							topicCount: {
								type: "integer",
								title: "Topic count",
								minimum: 1,
							},
							type: {
								type: "string",
								title: "Type",
								enum: [
									"scalar",
									"object",
									"pointcloud",
									"malformed",
								],
							},
							rateHz: {
								type: "number",
								title: "Rate (Hz)",
								minimum: 0.1,
							},
							payloadBytes: {
								type: "integer",
								title: "Payload (bytes)",
								minimum: 0,
							},
							burst: {
								type: "object",
								title: "Burst",
								properties: {
									periodMs: {
										type: "integer",
										title: "Period (ms)",
										minimum: 1,
									},
									dutyPct: {
										type: "number",
										title: "Duty (%)",
										minimum: 0,
										maximum: 100,
									},
								},
								required: ["periodMs", "dutyPct"],
							},
							transfer: {
								type: "boolean",
								title: "Transfer buffers (pointcloud)",
							},
						},
						required: [
							"topicPrefix",
							"topicCount",
							"type",
							"rateHz",
							"payloadBytes",
						],
					},
				},

				faults: {
					type: "object",
					title: "Faults",
					properties: {
						crashAfterMs: {
							type: "integer",
							title: "Crash after (ms)",
							minimum: 1,
						},
						subscribeHangMs: {
							type: "integer",
							title: "Subscribe hang (ms)",
							minimum: 1,
						},
					},
				},
			},
		},

		// Preset is always shown; the raw generators array and fault knobs are
		// only revealed under the "custom" preset (rule idiom matches the
		// std-widgets configs: SHOW when a scope's value equals a const).
		uischema: {
			type: "VerticalLayout",
			elements: [
				{ type: "Control", scope: "#/properties/title" },
				{ type: "Control", scope: "#/properties/enable" },
				{ type: "Control", scope: "#/properties/preset" },
				// Transport is orthogonal to the preset — always visible, never
				// gated by the preset rule.
				{ type: "Control", scope: "#/properties/transport" },
				{
					type: "Control",
					scope: "#/properties/generators",
					rule: {
						effect: "SHOW",
						condition: {
							scope: "#/properties/preset",
							schema: { const: "custom" },
						},
					},
				},
				{
					type: "Control",
					scope: "#/properties/faults",
					rule: {
						effect: "SHOW",
						condition: {
							scope: "#/properties/preset",
							schema: { const: "custom" },
						},
					},
				},
			],
		},

		// Default to the medium preset. The generators array below is only used
		// when the user switches the preset to "custom"; it starts from a sane,
		// punishing multi-generator mix.
		data: {
			id: "",
			title: "",
			enable: true,
			preset: "medium",
			transport: "worker",
			generators: [
				{
					topicPrefix: "load/scalar",
					topicCount: 25,
					type: "scalar",
					rateHz: 60,
					payloadBytes: 256,
					transfer: false,
				},
				{
					topicPrefix: "load/obj",
					topicCount: 15,
					type: "object",
					rateHz: 30,
					payloadBytes: 8192,
					transfer: false,
				},
				{
					topicPrefix: "load/cloud",
					topicCount: 3,
					type: "pointcloud",
					rateHz: 20,
					payloadBytes: 1200000,
					transfer: true,
				},
			],
		},

		Provider: (props) => LoadgenSourceProvider(props),
	} as DatasourceDefinition<LoadgenSettings>);

	return datasources;
};

/** WIDGETS_LIST filter: register the loadgen widgets. */
const widgetsExport = (widgets: WidgetDefinition<any>[]) => {
	widgets.push(LoadSinkDefinition());

	return widgets;
};

/**
 * WIDGET_LIST_WITH_DATASOURCE filter: hide the Load Sink unless at least one
 * enabled loadgen datasource exists.
 */
const widgetFilters = (
	widgets: WidgetDefinition[],
	datasources: Datasource[],
) => {
	const hasLoadgen = datasources.some(
		(datasource) =>
			datasource.datasource_id === LOADGEN_DATASOURCE_ID &&
			datasource.settings.enable,
	);

	if (!hasLoadgen) {
		return widgets.filter((widget) => widget.id !== LOAD_SINK_WIDGET_ID);
	}

	return widgets;
};

export default dataSourceExport;
export { widgetsExport, widgetFilters };
