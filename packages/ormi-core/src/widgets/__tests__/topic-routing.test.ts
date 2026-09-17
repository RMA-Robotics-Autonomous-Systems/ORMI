/**
 * Tests for topic-first routing.
 *
 * Critical: this module decides, without asking, which widget a clicked topic
 * lands in. The failure that matters most is not a missing feature but a
 * confident wrong answer — a sensor topic bound to a control that publishes to
 * it, or a plausible number plotted from the wrong field. Both are silent in
 * the running dashboard, so they are pinned here.
 *
 * Every decision below is made from **claims**. Nothing in routing reads an
 * `accepts` list any more, so the fixtures carry two independent things: a
 * widget's `dataRequirements`, which say what its slots may take, and a claim
 * list, which says what a topic click should open. Several tests exist only to
 * hold those two apart.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import type { JsonSchema, UISchemaElement } from "@jsonforms/core";
import {
	applyTopicToSettings,
	buildTopicRoutingIndex,
	collectRoutableSlots,
	getTopicRoutingIndex,
	resetTopicRoutingIndexCache,
	resolveSchemaAtPath,
	resolveTopicCommands,
	resolveTopicRoute,
	scopeToPath,
	TOPIC_ROUTING_PALETTE,
	type RoutingDecision,
} from "../topic-routing";
import {
	buildTopicClaimIndex,
	getTopicClaimIndex,
	resetTopicClaimIndexCache,
	slotPath,
	type TopicClaim,
	type TopicClaimIndex,
} from "../topic-claims";
import type { Widget, WidgetDefinition } from "../widget-interface";
import type { DatasourceTopic } from "../../datasources/datasource-interface";

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly like the definitions shipped by ormi-std-widgets.
// ---------------------------------------------------------------------------

const topic = (name: string, type: string, rawType = ""): DatasourceTopic => ({
	topic: name,
	datasource_id: "ds-1",
	source: { id: "ds-1", title: "Robot", enable: true },
	type,
	rawType,
});

/** No-op component stand-in; routing never renders anything. */
const noopComponent = (() => null) as unknown as WidgetDefinition["Component"];

const defineWidget = (
	id: string,
	name: string,
	schema: JsonSchema,
	uischema: UISchemaElement,
	data: Record<string, unknown> = {},
): WidgetDefinition => ({
	id,
	name,
	description: name,
	schema,
	uischema,
	data,
	Component: noopComponent,
});

/** Array-backed chart: `topics: [{ topic, color, fill }]`, accepts `number`. */
const timeSeriesChart = defineWidget(
	"chart-widget-time-series",
	"Time series chart",
	{
		type: "object",
		properties: {
			title: { type: "string" },
			topics: {
				type: "array",
				items: {
					type: "object",
					properties: {
						topic: { type: "object" },
						color: { type: "string" },
						fill: { type: "boolean", default: false },
					},
				},
			},
		},
	},
	{
		type: "VerticalLayout",
		elements: [
			{ type: "Control", scope: "#/properties/title" },
			{
				type: "Control",
				scope: "#/properties/topics",
				options: {
					detail: {
						type: "Group",
						elements: [
							{
								type: "TopicSelect",
								scope: "#/properties/topic",
								options: {
									dataRequirements: { accepts: ["number"] },
								},
							},
							{ type: "Control", scope: "#/properties/color" },
						],
					},
				},
			},
		],
	} as unknown as UISchemaElement,
	{ title: "Time series chart", topics: [] },
);

/** Second array-backed chart accepting `number` — the deliberate tie. */
const echartsChart = defineWidget(
	"chart-echarts",
	"ECharts Chart",
	{
		type: "object",
		properties: {
			series: {
				type: "array",
				items: {
					type: "object",
					properties: {
						topic: { type: "object" },
						color: { type: "string" },
						type: {
							type: "string",
							enum: ["line", "bar", "scatter"],
						},
					},
				},
			},
		},
	},
	{
		type: "VerticalLayout",
		elements: [
			{
				type: "Control",
				scope: "#/properties/series",
				options: {
					detail: {
						type: "Group",
						elements: [
							{
								type: "TopicSelect",
								scope: "#/properties/topic",
								options: {
									dataRequirements: { accepts: ["number"] },
								},
							},
						],
					},
				},
			},
		],
	} as unknown as UISchemaElement,
	{ series: [] },
);

/** Control widget: declares `accepts` on a topic it PUBLISHES to. */
const buttonControl = defineWidget(
	"btn-control",
	"Button",
	{
		type: "object",
		properties: { topic: { type: "object" }, value: { type: "number" } },
	},
	{
		type: "VerticalLayout",
		elements: [
			{
				type: "TopicSelect",
				scope: "#/properties/topic",
				options: {
					dataRequirements: { accepts: ["number", "boolean"] },
					direction: "publish",
				},
			},
		],
	} as unknown as UISchemaElement,
);

/** Single-slot instrument accepting `number` or `boolean`. */
const statusIndicator = defineWidget(
	"int-status-indicator",
	"Status indicator",
	{
		type: "object",
		properties: { topic: { type: "object" } },
	},
	{
		type: "VerticalLayout",
		elements: [
			{
				type: "TopicSelect",
				scope: "#/properties/topic",
				options: {
					dataRequirements: { accepts: ["number", "boolean"] },
				},
			},
		],
	} as unknown as UISchemaElement,
);

/** Three topic-bearing arrays, each with its own accepted type. */
const scene3d = defineWidget(
	"scene-3d",
	"3D Scene",
	{
		type: "object",
		properties: {
			pointCloudLayers: {
				type: "array",
				items: {
					type: "object",
					properties: {
						label: { type: "string" },
						enabled: { type: "boolean", default: true },
						topic: { type: "object" },
						pointSize: { type: "number", default: 0.05 },
					},
				},
			},
			pathLayers: {
				type: "array",
				items: {
					type: "object",
					properties: {
						enabled: { type: "boolean", default: true },
						topic: { type: "object" },
					},
				},
			},
			mapGridLayers: {
				type: "array",
				items: {
					type: "object",
					properties: {
						enabled: { type: "boolean", default: true },
						topic: { type: "object" },
					},
				},
			},
			posePublisherConfig: {
				type: "object",
				properties: { goalTopic: { type: "object" } },
			},
		},
	},
	{
		type: "Categorization",
		elements: [
			{
				type: "Category",
				label: "Layers",
				elements: [
					{
						type: "Control",
						scope: "#/properties/pointCloudLayers",
						options: {
							detail: {
								type: "VerticalLayout",
								elements: [
									{
										type: "TopicSelect",
										scope: "#/properties/topic",
										options: {
											dataRequirements: {
												accepts: ["PointsCloud"],
											},
										},
									},
								],
							},
						},
					},
					{
						type: "Control",
						scope: "#/properties/pathLayers",
						options: {
							detail: {
								type: "VerticalLayout",
								elements: [
									{
										type: "TopicSelect",
										scope: "#/properties/topic",
										options: {
											dataRequirements: {
												accepts: ["Path"],
											},
										},
									},
								],
							},
						},
					},
					{
						type: "Control",
						scope: "#/properties/mapGridLayers",
						options: {
							detail: {
								type: "VerticalLayout",
								elements: [
									{
										type: "TopicSelect",
										scope: "#/properties/topic",
										options: {
											dataRequirements: {
												accepts: ["MapGrid"],
											},
										},
									},
								],
							},
						},
					},
				],
			},
			{
				type: "Category",
				label: "Pose Publisher",
				elements: [
					{
						type: "TopicSelect",
						scope: "#/properties/posePublisherConfig/properties/goalTopic",
						options: {
							dataRequirements: { accepts: ["Pose"] },
							direction: "publish",
						},
					},
				],
			},
		],
	} as unknown as UISchemaElement,
	{ pointCloudLayers: [], pathLayers: [], mapGridLayers: [] },
);

/** Map widget: a primary marker array plus a secondary numeric channel. */
const mapViewer = defineWidget(
	"map-box-viewer",
	"Maps",
	{
		type: "object",
		properties: {
			topics: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: { type: "string" },
						makerType: {
							type: "string",
							enum: ["simple", "heatmap"],
						},
						topic: { type: "object" },
						numericalTopic: { type: "object" },
					},
				},
			},
			localTopics: {
				type: "object",
				properties: {
					pathTopics: {
						type: "array",
						items: {
							type: "object",
							properties: {
								topic: { type: "object" },
								gpsOriginTopic: {
									type: "object",
									title: "GPS Origin",
								},
							},
							required: ["topic", "gpsOriginTopic"],
						},
					},
					imuTopics: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								topic: { type: "object" },
								gpsOriginTopic: {
									type: "object",
									title: "GPS Origin",
								},
							},
							required: ["name", "topic", "gpsOriginTopic"],
						},
					},
				},
			},
		},
	},
	{
		type: "Categorization",
		elements: [
			{
				type: "Category",
				label: "Topics",
				elements: [
					{
						type: "Control",
						scope: "#/properties/topics",
						options: {
							detail: {
								type: "VerticalLayout",
								elements: [
									{
										type: "TopicSelect",
										scope: "#/properties/topic",
										options: {
											dataRequirements: {
												accepts: [
													"GeolocationPosition",
												],
											},
										},
									},
									{
										type: "TopicSelect",
										scope: "#/properties/numericalTopic",
										options: {
											dataRequirements: {
												accepts: ["number"],
											},
											role: "secondary",
										},
									},
								],
							},
						},
					},
					{
						type: "Control",
						scope: "#/properties/localTopics/properties/imuTopics",
						options: {
							detail: {
								type: "VerticalLayout",
								elements: [
									{
										type: "Control",
										scope: "#/properties/name",
									},
									{
										type: "TopicSelect",
										scope: "#/properties/topic",
										options: {
											dataRequirements: {
												accepts: ["IMU"],
											},
										},
									},
									{
										type: "TopicSelect",
										scope: "#/properties/gpsOriginTopic",
										options: {
											dataRequirements: {
												accepts: [
													"GeolocationPosition",
												],
											},
											role: "secondary",
										},
									},
								],
							},
						},
					},
					{
						type: "Control",
						scope: "#/properties/localTopics/properties/pathTopics",
						options: {
							detail: {
								type: "VerticalLayout",
								elements: [
									{
										type: "TopicSelect",
										scope: "#/properties/topic",
										options: {
											dataRequirements: {
												accepts: [
													"Path",
													"PointsCloud",
												],
											},
										},
									},
									{
										type: "TopicSelect",
										scope: "#/properties/gpsOriginTopic",
										options: {
											dataRequirements: {
												accepts: [
													"GeolocationPosition",
												],
											},
											role: "secondary",
										},
									},
								],
							},
						},
					},
				],
			},
		],
	} as unknown as UISchemaElement,
	{ localTopics: { pathTopics: [], imuTopics: [] } },
);

/** Raw viewer: a TopicSelect with no data requirements at all. */
const jsonViewer = defineWidget(
	"json-viewer",
	"Json viewer",
	{ type: "object", properties: { topic: { type: "object" } } },
	{
		type: "VerticalLayout",
		elements: [{ type: "TopicSelect", scope: "#/properties/topic" }],
	} as unknown as UISchemaElement,
);

const ALL_DEFINITIONS = [
	timeSeriesChart,
	echartsChart,
	buttonControl,
	statusIndicator,
	scene3d,
	mapViewer,
	jsonViewer,
];

const widget = (boxId: string, widgetId: string, title: string): Widget => ({
	box_id: boxId,
	widget_id: widgetId,
	title,
	settings: {},
});

const noWidgets = new Map<string, Widget>();

beforeEach(() => {
	resetTopicRoutingIndexCache();
	resetTopicClaimIndexCache();
});

// ---------------------------------------------------------------------------

/**
 * Shaped like the real airspeed gauge: an honest `accepts: ["Movement"]` on a
 * widget that is nonetheless the wrong answer to a `/cmd_vel` click, because
 * `Movement` covers a commanded velocity and a measured one alike. Nothing on
 * the slot says so — its plugin says so, with an `"alternative"` claim.
 */
const airspeedGauge = defineWidget(
	"airspeed",
	"Speed indicator",
	{ type: "object", properties: { topic: { type: "object" } } },
	{
		type: "VerticalLayout",
		elements: [
			{
				type: "TopicSelect",
				scope: "#/properties/topic",
				options: {
					dataRequirements: { accepts: ["Movement"] },
				},
			},
		],
	} as unknown as UISchemaElement,
);

/** The teleop control that publishes to the same topic. */
const teleopControl = defineWidget(
	"teleop",
	"Teleop",
	{ type: "object", properties: { cmdVel: { type: "object" } } },
	{
		type: "VerticalLayout",
		elements: [
			{
				type: "TopicSelect",
				scope: "#/properties/cmdVel",
				options: {
					direction: "publish",
					dataRequirements: { accepts: ["Movement"] },
				},
			},
		],
	} as unknown as UISchemaElement,
);

/**
 * The claims the fixture plugins would register, mirroring the real ones.
 *
 * Read as a table: each line is a sentence a plugin wrote down, and every
 * decision in this file follows from these and nothing else.
 */
const CLAIMS: TopicClaim[] = [
	{
		type: "number",
		widgetId: "chart-widget-time-series",
		slot: "topics[].topic",
		role: "default",
	},
	{
		type: "number",
		widgetId: "chart-echarts",
		slot: "series[].topic",
		role: "alternative",
	},
	{
		type: "number",
		widgetId: "int-status-indicator",
		slot: "topic",
		role: "alternative",
	},
	{ type: "number", widgetId: "btn-control", slot: "topic", role: "command" },
	{
		type: "boolean",
		widgetId: "btn-control",
		slot: "topic",
		role: "command",
	},
	{
		type: "PointsCloud",
		widgetId: "scene-3d",
		slot: "pointCloudLayers[].topic",
		role: "default",
	},
	{
		type: "Path",
		widgetId: "scene-3d",
		slot: "pathLayers[].topic",
		role: "default",
	},
	{
		type: "MapGrid",
		widgetId: "scene-3d",
		slot: "mapGridLayers[].topic",
		role: "default",
	},
	{
		type: "Pose",
		widgetId: "scene-3d",
		slot: "posePublisherConfig.goalTopic",
		role: "command",
	},
	{
		type: "GeolocationPosition",
		widgetId: "map-box-viewer",
		slot: "topics[].topic",
		role: "default",
	},
	{
		type: "IMU",
		widgetId: "map-box-viewer",
		slot: "localTopics.imuTopics[].topic",
		role: "default",
	},
	{
		type: "Path",
		widgetId: "map-box-viewer",
		slot: "localTopics.pathTopics[].topic",
		role: "alternative",
	},
	{
		type: "PointsCloud",
		widgetId: "map-box-viewer",
		slot: "localTopics.pathTopics[].topic",
		role: "alternative",
	},
	{ type: "*", widgetId: "json-viewer", slot: "topic", role: "fallback" },
];

/** Only the claims naming one of the given widgets, as that registry would see. */
const claimsFor = (...widgetIds: string[]): TopicClaim[] =>
	CLAIMS.filter((claim) => widgetIds.includes(claim.widgetId));

/** Resolve claims against a registry, the way `useTopicRouter` does. */
const indexFor = (
	definitions: WidgetDefinition[],
	claims: TopicClaim[],
): TopicClaimIndex =>
	buildTopicClaimIndex(claims, getTopicRoutingIndex(definitions));

/** Route a topic against a registry and its claims. */
const route = (
	picked: DatasourceTopic,
	definitions: WidgetDefinition[],
	claims: TopicClaim[],
	widgets: Map<string, Widget> = noWidgets,
): RoutingDecision =>
	resolveTopicRoute({
		topic: picked,
		widgets,
		claims: indexFor(definitions, claims),
	});

// ---------------------------------------------------------------------------

describe("scope and schema resolution", () => {
	test("converts a flat scope to a dot path", () => {
		expect(scopeToPath("#/properties/topic")).toBe("topic");
	});

	test("converts a nested scope to a dot path", () => {
		expect(
			scopeToPath("#/properties/localTopics/properties/pathTopics"),
		).toBe("localTopics.pathTopics");
	});

	test("returns an empty path for the root scope or a missing scope", () => {
		expect(scopeToPath("#")).toBe("");
		expect(scopeToPath(undefined)).toBe("");
	});

	test("resolves a nested schema node", () => {
		const node = resolveSchemaAtPath(
			mapViewer.schema,
			"localTopics.pathTopics",
		);
		expect(node?.type).toBe("array");
	});

	test("returns undefined for a path that does not exist", () => {
		expect(resolveSchemaAtPath(mapViewer.schema, "nope.nope")).toBe(
			undefined,
		);
	});
});

describe("slot index", () => {
	test("marks an array-backed slot and records the array path", () => {
		const slots = collectRoutableSlots(timeSeriesChart);
		expect(slots.length).toBe(1);
		expect(slots[0]!.isArray).toBe(true);
		expect(slots[0]!.arrayPath).toBe("topics");
		expect(slots[0]!.path).toBe("topic");
	});

	test("marks a single slot and records the absolute path", () => {
		const slots = collectRoutableSlots(statusIndicator);
		expect(slots[0]!.isArray).toBe(false);
		expect(slots[0]!.arrayPath).toBe(undefined);
		expect(slots[0]!.path).toBe("topic");
	});

	test("descends through Categorization and Category layouts", () => {
		const slots = collectRoutableSlots(scene3d);
		expect(slots.map((slot) => slot.arrayPath)).toEqual([
			"pointCloudLayers",
			"pathLayers",
			"mapGridLayers",
			undefined,
		]);
	});

	test("records a nested single slot at its full settings path", () => {
		const slots = collectRoutableSlots(scene3d);
		const publisher = slots.find((slot) => !slot.isArray)!;
		expect(publisher.path).toBe("posePublisherConfig.goalTopic");
		expect(publisher.direction).toBe("publish");
	});

	test("defaults direction to subscribe and role to primary", () => {
		const slot = collectRoutableSlots(timeSeriesChart)[0]!;
		expect(slot.direction).toBe("subscribe");
		expect(slot.role).toBe("primary");
	});

	test("spells a claim path the way a plugin writes one", () => {
		// The one string a claim and the walker have to agree on. An
		// array-backed slot says which array; a single slot is its dot path.
		expect(slotPath(collectRoutableSlots(timeSeriesChart)[0]!)).toBe(
			"topics[].topic",
		);
		expect(slotPath(collectRoutableSlots(statusIndicator)[0]!)).toBe(
			"topic",
		);
		expect(
			slotPath(
				collectRoutableSlots(scene3d).find((slot) => !slot.isArray)!,
			),
		).toBe("posePublisherConfig.goalTopic");
	});

	test("indexes a slot with no data requirements like any other", () => {
		// It used to be flagged `universal` and offered as a raw viewer for
		// every unmatched topic, which quietly made any widget whose author
		// simply had not declared a type a candidate for everything. Being a
		// raw viewer is now something a plugin says, not something a missing
		// declaration implies.
		const slot = collectRoutableSlots(jsonViewer)[0]!;
		expect(slot.requirements).toBe(undefined);
		expect(slot.direction).toBe("subscribe");
	});

	test("does not treat an object-valued Control detail as an array target", () => {
		const slots = collectRoutableSlots(scene3d);
		expect(
			slots.every((slot) => slot.arrayPath !== "posePublisherConfig"),
		).toBe(true);
	});

	test("skips widgets with no TopicSelect at all", () => {
		const plain = defineWidget(
			"plain",
			"Plain",
			{ type: "object", properties: { title: { type: "string" } } },
			{
				type: "VerticalLayout",
				elements: [{ type: "Control", scope: "#/properties/title" }],
			} as unknown as UISchemaElement,
		);
		const index = buildTopicRoutingIndex([plain, timeSeriesChart]);

		// A widget with no TopicSelect is still indexed — a slotless claim
		// names one, and excluding it here made that claim unresolvable — but
		// it contributes no slots.
		expect(index.entries.map((entry) => entry.widgetId)).toEqual([
			"plain",
			"chart-widget-time-series",
		]);
		expect(index.byWidgetId.get("plain")?.slots).toEqual([]);
	});

	test("memoises on definition content, not array identity", () => {
		const first = getTopicRoutingIndex([...ALL_DEFINITIONS]);
		const second = getTopicRoutingIndex([...ALL_DEFINITIONS]);
		expect(second).toBe(first);
	});

	test("rebuilds when a slot moves", () => {
		const first = getTopicRoutingIndex([timeSeriesChart]);
		const changed = defineWidget(
			timeSeriesChart.id,
			timeSeriesChart.name,
			timeSeriesChart.schema,
			{
				type: "VerticalLayout",
				elements: [
					{
						type: "TopicSelect",
						scope: "#/properties/topic",
						options: {
							dataRequirements: { accepts: ["Vector3"] },
						},
					},
				],
			} as unknown as UISchemaElement,
		);
		expect(getTopicRoutingIndex([changed])).not.toBe(first);
	});
});

describe("a claim the registry cannot honour is dropped, never guessed at", () => {
	/**
	 * Each of these would otherwise route a topic somewhere nobody stated.
	 * Dropping rather than throwing is deliberate: a plugin can be disabled,
	 * and a dashboard that crashes because a claim outlived its widget is worse
	 * than one that asks.
	 */

	const claim = (over: Partial<TopicClaim>): TopicClaim => ({
		type: "number",
		widgetId: "int-status-indicator",
		slot: "topic",
		role: "default",
		...over,
	});

	const claimed = (over: Partial<TopicClaim>) =>
		indexFor(ALL_DEFINITIONS, [claim(over)]).claimedWidgetIds.size;

	test("a widget this build does not ship", () => {
		expect(claimed({ widgetId: "ghost-widget" })).toBe(0);
	});

	test("a slot the widget does not have", () => {
		expect(claimed({ slot: "nope" })).toBe(0);
	});

	test("an array slot named as if it were a single one", () => {
		expect(
			claimed({ widgetId: "chart-widget-time-series", slot: "topic" }),
		).toBe(0);
		expect(
			claimed({
				widgetId: "chart-widget-time-series",
				slot: "topics[].topic",
			}),
		).toBe(1);
	});

	test("a command that does not name a publish slot", () => {
		expect(claimed({ role: "command" })).toBe(0);
	});

	test("a display claim that names a publish slot", () => {
		// The direction this must never fail in: a viewer claim on a slot the
		// widget writes to would command a robot on a topic click.
		expect(
			claimed({
				widgetId: "btn-control",
				slot: "topic",
				role: "default",
			}),
		).toBe(0);
		expect(
			claimed({
				widgetId: "btn-control",
				slot: "topic",
				role: "command",
			}),
		).toBe(1);
	});

	test("a claim on a secondary slot", () => {
		expect(
			claimed({
				widgetId: "map-box-viewer",
				slot: "topics[].numericalTopic",
			}),
		).toBe(0);
	});

	test("a wildcard that is not a fallback, and a fallback that is not a wildcard", () => {
		expect(claimed({ type: "*" })).toBe(0);
		expect(claimed({ role: "fallback" })).toBe(0);
		expect(
			claimed({ widgetId: "json-viewer", type: "*", role: "fallback" }),
		).toBe(1);
	});

	test("a registry with no claims at all routes nothing", () => {
		const decision = route(
			topic("/battery", "number"),
			ALL_DEFINITIONS,
			[],
		);
		expect(decision.kind).toBe("none");
		expect(decision.reason).toContain("number");
	});
});

describe("commands are offered, never automatic", () => {
	const numberTopic = topic("/battery", "number");

	/** Widget ids an automatic decision would act on — empty for an ask. */
	const automaticWidgetIds = (decision: RoutingDecision): string[] =>
		decision.kind === "append" || decision.kind === "create"
			? [decision.option.widgetId]
			: [];

	const offeredWidgetIds = (decision: RoutingDecision): string[] =>
		decision.kind === "ask"
			? decision.options.map((option) => option.widgetId)
			: automaticWidgetIds(decision);

	test("a number topic is never placed in a publishing control", () => {
		const decision = route(numberTopic, ALL_DEFINITIONS, CLAIMS);
		expect(automaticWidgetIds(decision)).not.toContain("btn-control");
	});

	test("a boolean topic is never placed in a publishing control", () => {
		const decision = route(
			topic("/estop", "boolean"),
			ALL_DEFINITIONS,
			CLAIMS,
		);
		expect(automaticWidgetIds(decision)).not.toContain("btn-control");
	});

	test("a command-only claim asks instead of placing the control", () => {
		const decision = route(
			numberTopic,
			[buttonControl],
			claimsFor("btn-control"),
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.map((option) => option.widgetId)).toEqual([
				"btn-control",
			]);
			expect(decision.options[0]!.direction).toBe("publish");
			expect(decision.reason).toContain("command");
		}
	});

	test("a command is offered after the raw viewer", () => {
		const decision = route(
			numberTopic,
			[buttonControl, jsonViewer],
			claimsFor("btn-control", "json-viewer"),
		);
		expect(decision.kind).toBe("ask");
		// The raw viewer is a way to *see* the topic, so it leads; commanding a
		// robot with it is offered last.
		expect(offeredWidgetIds(decision)).toEqual([
			"json-viewer",
			"btn-control",
		]);
	});

	test("a claimed display beats a control that accepts the same type", () => {
		const decision = route(
			numberTopic,
			[statusIndicator, buttonControl],
			[
				{
					type: "number",
					widgetId: "int-status-indicator",
					slot: "topic",
					role: "default",
				},
				...claimsFor("btn-control"),
			],
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("int-status-indicator");
			expect(decision.option.direction).toBe("subscribe");
		}
	});

	test("a tie between viewers still lists every control last", () => {
		const decision = route(
			numberTopic,
			[timeSeriesChart, echartsChart, buttonControl],
			[
				{
					type: "number",
					widgetId: "chart-widget-time-series",
					slot: "topics[].topic",
					role: "default",
				},
				{
					type: "number",
					widgetId: "chart-echarts",
					slot: "series[].topic",
					role: "default",
				},
				...claimsFor("btn-control"),
			],
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.map((option) => option.direction)).toEqual([
				"subscribe",
				"subscribe",
				"publish",
			]);
		}
	});

	test("an open publishing control is never an append target", () => {
		const open = new Map([
			["box-1", widget("box-1", "btn-control", "Arm")],
		]);
		const decision = route(numberTopic, ALL_DEFINITIONS, CLAIMS, open);
		expect(decision.kind).not.toBe("append");
	});
});

describe("slots that need a companion topic", () => {
	const imu = topic("/imu/data", "IMU");
	const mapClaims = claimsFor("map-box-viewer");

	test("names the sibling topic the item schema also requires", () => {
		const slot = collectRoutableSlots(mapViewer).find(
			(entry) =>
				entry.arrayPath === "localTopics.imuTopics" &&
				entry.path === "topic",
		)!;
		// The schema title, so the operator reads what the settings form calls
		// it rather than the property name.
		expect(slot.requiresCompanions).toEqual(["GPS Origin"]);
	});

	test("a required property that is not a topic is not a companion", () => {
		// `name` is required too, but seedArrayItem fills it — only an unbound
		// topic leaves the widget dereferencing something that is not there.
		const slot = collectRoutableSlots(mapViewer).find(
			(entry) =>
				entry.arrayPath === "localTopics.imuTopics" &&
				entry.path === "topic",
		)!;
		expect(slot.requiresCompanions).not.toContain("name");
	});

	test("a slot that stands on its own reports no companions", () => {
		expect(
			collectRoutableSlots(timeSeriesChart)[0]!.requiresCompanions,
		).toEqual([]);
		expect(
			collectRoutableSlots(statusIndicator)[0]!.requiresCompanions,
		).toEqual([]);
	});

	test("a default claim on a companion-needing slot is still never automatic", () => {
		// The one rule a plugin cannot state for itself: it says which widget,
		// the schema says the entry is incomplete without a sibling topic, and
		// appending one regardless crashes the tile.
		const decision = route(imu, [mapViewer], mapClaims);
		expect(decision.kind).toBe("ask");
	});

	test("the ask names the topic that is still missing", () => {
		const decision = route(imu, [mapViewer], mapClaims);
		if (decision.kind !== "ask") throw new Error("expected an ask");
		expect(decision.reason).toContain("GPS Origin");
		expect(decision.options.map((option) => option.widgetId)).toEqual([
			"map-box-viewer",
		]);
		expect(decision.options[0]?.slot?.requiresCompanions).toEqual([
			"GPS Origin",
		]);
	});

	test("an open map is offered as an append, never appended to silently", () => {
		const open = new Map([
			["box-1", widget("box-1", "map-box-viewer", "Maps")],
		]);
		const decision = route(imu, [mapViewer], mapClaims, open);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			const append = decision.options.find(
				(option) => option.kind === "append",
			);
			expect(append?.boxId).toBe("box-1");
			expect(append?.slot?.requiresCompanions).toEqual(["GPS Origin"]);
		}
	});

	test("a raw viewer still follows the companion-needing map", () => {
		const decision = route(
			imu,
			[mapViewer, jsonViewer],
			[...mapClaims, ...claimsFor("json-viewer")],
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.map((option) => option.widgetId)).toEqual([
				"map-box-viewer",
				"json-viewer",
			]);
		}
	});

	test("an item whose required properties are all fillable still auto-routes", () => {
		const layers = defineWidget(
			"layer-stack",
			"Layer stack",
			{
				type: "object",
				properties: {
					layers: {
						type: "array",
						items: {
							type: "object",
							properties: {
								name: { type: "string" },
								topic: { type: "object" },
							},
							required: ["name", "topic"],
						},
					},
				},
			},
			{
				type: "VerticalLayout",
				elements: [
					{
						type: "Control",
						scope: "#/properties/layers",
						options: {
							detail: {
								type: "VerticalLayout",
								elements: [
									{
										type: "Control",
										scope: "#/properties/name",
									},
									{
										type: "TopicSelect",
										scope: "#/properties/topic",
										options: {
											dataRequirements: {
												accepts: ["IMU"],
											},
										},
									},
								],
							},
						},
					},
				],
			} as unknown as UISchemaElement,
		);
		const decision = route(
			imu,
			[layers],
			[
				{
					type: "IMU",
					widgetId: "layer-stack",
					slot: "layers[].topic",
					role: "default",
				},
			],
		);
		expect(decision.kind).toBe("create");
	});
});

describe("compatibility is not routing", () => {
	test("a widget that accepts a type is not a destination for it", () => {
		// The status indicator's `accepts` lists `number` and `boolean`, and
		// under the old resolver that alone made it a candidate. Nothing claims
		// it here, so a boolean click has nowhere claimed to go.
		const decision = route(
			topic("/estop", "boolean"),
			[statusIndicator],
			[],
		);
		expect(decision.kind).toBe("none");
	});

	test("an IMU topic is not routed to a number chart through its properties", () => {
		// IMU carries numeric leaves, so isTopicCompatible says yes. Claims are
		// matched on the topic's own type, so the question never arises — which
		// is the point: the chart would plot a plausible wrong field.
		const decision = route(
			topic("/imu", "IMU"),
			[timeSeriesChart, jsonViewer],
			[
				...claimsFor("chart-widget-time-series"),
				...claimsFor("json-viewer"),
			],
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.map((option) => option.widgetId)).toEqual([
				"json-viewer",
			]);
		}
	});

	test("an open chart is not an append target for a property-only match", () => {
		const open = new Map([
			["box-1", widget("box-1", "chart-widget-time-series", "Chart")],
		]);
		const decision = route(
			topic("/imu", "IMU"),
			[timeSeriesChart, jsonViewer],
			[
				...claimsFor("chart-widget-time-series"),
				...claimsFor("json-viewer"),
			],
			open,
		);
		expect(decision.kind).not.toBe("append");
	});
});

describe("scene-3d array disambiguation", () => {
	const sceneClaims = claimsFor("scene-3d");

	test("a PointsCloud topic picks the point cloud layer array", () => {
		const decision = route(
			topic("/lidar", "PointsCloud"),
			[scene3d],
			sceneClaims,
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.slot?.arrayPath).toBe("pointCloudLayers");
		}
	});

	test("a Path topic picks the path layer array", () => {
		const decision = route(topic("/plan", "Path"), [scene3d], sceneClaims);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.slot?.arrayPath).toBe("pathLayers");
		}
	});

	test("a MapGrid topic picks the map grid layer array", () => {
		const decision = route(
			topic("/map", "MapGrid"),
			[scene3d],
			sceneClaims,
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.slot?.arrayPath).toBe("mapGridLayers");
		}
	});

	test("the claim names the slot, so no rule has to guess between three", () => {
		// Under the old resolver a widget's slot was picked by comparing how
		// narrow each `accepts` list was, which is arithmetic rather than a
		// statement. Here the plugin simply said which array.
		expect(
			sceneClaims.map((entry) => `${entry.type}:${entry.slot}`),
		).toEqual([
			"PointsCloud:pointCloudLayers[].topic",
			"Path:pathLayers[].topic",
			"MapGrid:mapGridLayers[].topic",
			"Pose:posePublisherConfig.goalTopic",
		]);
	});

	test("a Pose topic is offered the scene's publish slot, never placed in it", () => {
		const decision = route(
			topic("/goal_pose", "Pose"),
			[scene3d],
			sceneClaims,
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.length).toBe(1);
			expect(decision.options[0]!.direction).toBe("publish");
			expect(decision.options[0]?.slot?.path).toBe(
				"posePublisherConfig.goalTopic",
			);
		}
	});
});

describe("defaults, priorities and ties", () => {
	const numberTopic = topic("/battery", "number");
	const charts = [timeSeriesChart, echartsChart];

	const chartClaims = (
		...over: [number | undefined, number | undefined]
	): TopicClaim[] => [
		{
			type: "number",
			widgetId: "chart-widget-time-series",
			slot: "topics[].topic",
			role: "default",
			...(over[0] === undefined ? {} : { priority: over[0] }),
		},
		{
			type: "number",
			widgetId: "chart-echarts",
			slot: "series[].topic",
			role: "default",
			...(over[1] === undefined ? {} : { priority: over[1] }),
		},
	];

	test("a sole default is the answer", () => {
		const decision = route(
			numberTopic,
			charts,
			claimsFor("chart-widget-time-series"),
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("chart-widget-time-series");
			expect(decision.reason).toContain("declared");
		}
	});

	test("two defaults at the same priority ask", () => {
		// Both plugins said "this is the destination" and nothing said which
		// wins. Picking one silently is the failure this design removes.
		const decision = route(
			numberTopic,
			charts,
			chartClaims(undefined, undefined),
		);
		expect(decision.kind).toBe("ask");
		expect(decision.reason).toContain("2 widgets are declared");
	});

	test("a lower priority breaks the tie", () => {
		const decision = route(numberTopic, charts, chartClaims(20, 10));
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("chart-echarts");
		}
	});

	test("an alternative never wins, whatever its priority", () => {
		const decision = route(numberTopic, charts, [
			{
				type: "number",
				widgetId: "chart-echarts",
				slot: "series[].topic",
				role: "alternative",
				priority: -100,
			},
		]);
		expect(decision.kind).toBe("ask");
	});

	test("a claim resolves on the raw type when there is no webapp type", () => {
		const rawWidget = defineWidget(
			"swarm-log",
			"Swarm log",
			{ type: "object", properties: { topic: { type: "object" } } },
			{
				type: "VerticalLayout",
				elements: [
					{
						type: "TopicSelect",
						scope: "#/properties/topic",
						options: {
							dataRequirements: {
								accepts: [],
								acceptsRaw: ["c2_msgs/msg/SwarmLog"],
							},
						},
					},
				],
			} as unknown as UISchemaElement,
		);
		const decision = route(
			topic("/swarm", "", "c2_msgs/msg/SwarmLog"),
			[rawWidget, jsonViewer],
			[
				{
					type: "c2_msgs/msg/SwarmLog",
					widgetId: "swarm-log",
					slot: "topic",
					role: "default",
				},
				...claimsFor("json-viewer"),
			],
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("swarm-log");
		}
	});

	test("a webapp-type claim leads a raw-type one for the same topic", () => {
		// Both name spaces are looked up; the converted type is the one the
		// product speaks, so it is offered first.
		const dual = topic("/camera", "Image", "sensor_msgs/msg/Image");
		const decision = route(
			dual,
			[statusIndicator, jsonViewer],
			[
				{
					type: "Image",
					widgetId: "int-status-indicator",
					slot: "topic",
					role: "alternative",
				},
				{
					type: "sensor_msgs/msg/Image",
					widgetId: "json-viewer",
					slot: "topic",
					role: "alternative",
				},
			],
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.map((option) => option.widgetId)).toEqual([
				"int-status-indicator",
				"json-viewer",
			]);
		}
	});
});

describe("appending to an open viewer", () => {
	test("a second number topic joins the open chart", () => {
		const open = new Map([
			["box-1", widget("box-1", "chart-widget-time-series", "Speeds")],
		]);
		const decision = route(
			topic("/battery", "number"),
			[timeSeriesChart, echartsChart],
			CLAIMS,
			open,
		);
		expect(decision.kind).toBe("append");
		if (decision.kind === "append") {
			expect(decision.option.boxId).toBe("box-1");
			expect(decision.option.instanceTitle).toBe("Speeds");
		}
	});

	test("an open viewer beats a default claim naming a different widget", () => {
		const open = new Map([
			["box-1", widget("box-1", "chart-widget-time-series", "Speeds")],
		]);
		const decision = route(
			topic("/battery", "number"),
			[timeSeriesChart, echartsChart],
			[
				{
					type: "number",
					widgetId: "chart-widget-time-series",
					slot: "topics[].topic",
					role: "default",
					priority: 20,
				},
				{
					type: "number",
					widgetId: "chart-echarts",
					slot: "series[].topic",
					role: "default",
					priority: 10,
				},
			],
			open,
		);
		// Context outranks the stated default: the operator is looking at a
		// chart that can take this series, and opening a second one beside it
		// is not what they asked for.
		expect(decision.kind).toBe("append");
		if (decision.kind === "append") {
			expect(decision.option.boxId).toBe("box-1");
		}
	});

	test("an open widget claimed only as an alternative is not appended to", () => {
		const open = new Map([
			["box-1", widget("box-1", "chart-widget-time-series", "Speeds")],
		]);
		const decision = route(
			topic("/battery", "number"),
			[timeSeriesChart, echartsChart],
			[
				{
					type: "number",
					widgetId: "chart-widget-time-series",
					slot: "topics[].topic",
					role: "alternative",
				},
				{
					type: "number",
					widgetId: "chart-echarts",
					slot: "series[].topic",
					role: "default",
				},
			],
			open,
		);
		// Its plugin said this chart is never the automatic answer for a
		// number, and being already open does not overrule that.
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("chart-echarts");
		}
	});

	test("an unclaimed open widget is never an append target", () => {
		const open = new Map([
			["box-1", widget("box-1", "chart-echarts", "Currents")],
		]);
		const decision = route(
			topic("/battery", "number"),
			[timeSeriesChart, echartsChart],
			claimsFor("chart-widget-time-series"),
			open,
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("chart-widget-time-series");
		}
	});

	test("two open viewers ask, and offer both instances plus creation", () => {
		const open = new Map([
			["box-1", widget("box-1", "chart-widget-time-series", "Speeds")],
			["box-2", widget("box-2", "chart-echarts", "Currents")],
		]);
		const decision = route(
			topic("/battery", "number"),
			[timeSeriesChart, echartsChart],
			[
				{
					type: "number",
					widgetId: "chart-widget-time-series",
					slot: "topics[].topic",
					role: "default",
				},
				{
					type: "number",
					widgetId: "chart-echarts",
					slot: "series[].topic",
					role: "default",
				},
			],
			open,
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(
				decision.options.filter((option) => option.kind === "append")
					.length,
			).toBe(2);
			expect(
				decision.options.filter((option) => option.kind === "create")
					.length,
			).toBe(2);
		}
	});

	test("an open single-slot instrument is not an append target", () => {
		const open = new Map([
			["box-1", widget("box-1", "int-status-indicator", "Battery")],
		]);
		const decision = route(
			topic("/battery", "number"),
			[statusIndicator],
			[
				{
					type: "number",
					widgetId: "int-status-indicator",
					slot: "topic",
					role: "default",
				},
			],
			open,
		);
		expect(decision.kind).toBe("create");
	});

	test("an open 3D scene takes both a point cloud and a path", () => {
		const open = new Map([["box-1", widget("box-1", "scene-3d", "Scene")]]);
		for (const [name, type, arrayPath] of [
			["/lidar", "PointsCloud", "pointCloudLayers"],
			["/plan", "Path", "pathLayers"],
		] as const) {
			const decision = route(
				topic(name, type),
				[scene3d],
				claimsFor("scene-3d"),
				open,
			);
			expect(decision.kind).toBe("append");
			if (decision.kind === "append") {
				expect(decision.option.slot?.arrayPath).toBe(arrayPath);
			}
		}
	});
});

describe("raw viewers and unclaimed topics", () => {
	test("a type nothing claims falls back to asking with the raw viewers", () => {
		const decision = route(
			topic("/diag", "", "diagnostic_msgs/msg/DiagnosticArray"),
			ALL_DEFINITIONS,
			CLAIMS,
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.map((option) => option.widgetId)).toEqual([
				"json-viewer",
			]);
			expect(decision.reason).toContain("raw viewer");
		}
	});

	test("a type nothing claims at all, with no raw viewer, says so", () => {
		const decision = route(
			topic("/lidar", "PointsCloud"),
			[statusIndicator],
			claimsFor("int-status-indicator"),
		);
		expect(decision.kind).toBe("none");
		expect(decision.reason).toContain("PointsCloud");
	});

	test("a raw viewer never wins over a claimed destination", () => {
		const decision = route(
			topic("/lidar", "PointsCloud"),
			[scene3d, jsonViewer],
			[...claimsFor("scene-3d"), ...claimsFor("json-viewer")],
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("scene-3d");
		}
	});

	test("raw viewers are ordered by priority, never chosen", () => {
		const second = defineWidget(
			"tree-viewer",
			"Tree viewer",
			jsonViewer.schema,
			jsonViewer.uischema,
		);
		const decision = route(
			topic("/diag", "", "diagnostic_msgs/msg/DiagnosticArray"),
			[jsonViewer, second],
			[
				{
					type: "*",
					widgetId: "json-viewer",
					slot: "topic",
					role: "fallback",
					priority: 20,
				},
				{
					type: "*",
					widgetId: "tree-viewer",
					slot: "topic",
					role: "fallback",
					priority: 10,
				},
			],
		);
		expect(decision.kind).toBe("ask");
		if (decision.kind === "ask") {
			expect(decision.options.map((option) => option.widgetId)).toEqual([
				"tree-viewer",
				"json-viewer",
			]);
		}
	});
});

describe("the claim index is memoised on its inputs", () => {
	test("the same claims and registry return the same index", () => {
		const index = getTopicRoutingIndex(ALL_DEFINITIONS);
		const first = getTopicClaimIndex(CLAIMS, index);
		expect(getTopicClaimIndex(CLAIMS, index)).toBe(first);
	});

	test("a new claim list rebuilds it", () => {
		const index = getTopicRoutingIndex(ALL_DEFINITIONS);
		const first = getTopicClaimIndex(CLAIMS, index);
		expect(getTopicClaimIndex([...CLAIMS], index)).not.toBe(first);
	});
});

describe("applying a route to settings", () => {
	const lidar = topic("/lidar", "PointsCloud");

	test("writes a single slot at its absolute path", () => {
		const slot = collectRoutableSlots(statusIndicator)[0]!;
		const { settings } = applyTopicToSettings(
			{ title: "Battery" },
			slot,
			topic("/battery", "number"),
			statusIndicator.schema,
		);
		expect((settings.topic as { topic: string }).topic).toBe("/battery");
		expect(settings.title).toBe("Battery");
	});

	test("writes a nested single slot without dropping its siblings", () => {
		const slot = collectRoutableSlots(scene3d).find(
			(entry) => entry.path === "posePublisherConfig.goalTopic",
		)!;
		const { settings } = applyTopicToSettings(
			{ posePublisherConfig: { enabled: true, frameId: "map" } },
			slot,
			topic("/goal_pose", "Pose"),
			scene3d.schema,
		);
		const config = settings.posePublisherConfig as Record<string, unknown>;
		expect(config.enabled).toBe(true);
		expect(config.frameId).toBe("map");
		expect((config.goalTopic as { topic: string }).topic).toBe(
			"/goal_pose",
		);
	});

	test("appends to an array slot, creating the array when absent", () => {
		const slot = collectRoutableSlots(mapViewer).find(
			(entry) => entry.arrayPath === "topics",
		)!;
		const { settings } = applyTopicToSettings(
			{ title: "Maps" },
			slot,
			topic("/gps", "GeolocationPosition"),
			mapViewer.schema,
		);
		const topics = settings.topics as Record<string, unknown>[];
		expect(topics.length).toBe(1);
		expect((topics[0]!.topic as { topic: string }).topic).toBe("/gps");
	});

	test("appends into a nested array path", () => {
		const slot = collectRoutableSlots(mapViewer).find(
			(entry) => entry.arrayPath === "localTopics.pathTopics",
		)!;
		const { settings } = applyTopicToSettings(
			{ localTopics: { pathTopics: [], imuTopics: [] } },
			slot,
			topic("/plan", "Path"),
			mapViewer.schema,
		);
		const local = settings.localTopics as Record<string, unknown[]>;
		expect(local.pathTopics!.length).toBe(1);
		expect(local.imuTopics!.length).toBe(0);
	});

	test("keeps existing array entries by reference", () => {
		const slot = collectRoutableSlots(timeSeriesChart)[0]!;
		const first = applyTopicToSettings(
			{ topics: [] },
			slot,
			topic("/a", "number"),
			timeSeriesChart.schema,
		).settings;
		const existing = (first.topics as unknown[])[0];

		const second = applyTopicToSettings(
			first,
			slot,
			topic("/b", "number"),
			timeSeriesChart.schema,
		).settings;

		expect((second.topics as unknown[]).length).toBe(2);
		expect((second.topics as unknown[])[0]).toBe(existing);
	});

	test("does not mutate the settings it was given", () => {
		const slot = collectRoutableSlots(timeSeriesChart)[0]!;
		const original = { topics: [] as unknown[] };
		applyTopicToSettings(
			original,
			slot,
			topic("/a", "number"),
			timeSeriesChart.schema,
		);
		expect(original.topics.length).toBe(0);
	});

	test("cycles the palette so appended series are distinguishable", () => {
		const slot = collectRoutableSlots(timeSeriesChart)[0]!;
		let settings: Record<string, unknown> = { topics: [] };
		for (let i = 0; i < 3; i++) {
			settings = applyTopicToSettings(
				settings,
				slot,
				topic(`/n${i}`, "number"),
				timeSeriesChart.schema,
			).settings;
		}
		const colors = (settings.topics as { color: string }[]).map(
			(entry) => entry.color,
		);
		expect(colors).toEqual([
			TOPIC_ROUTING_PALETTE[0]!,
			TOPIC_ROUTING_PALETTE[1]!,
			TOPIC_ROUTING_PALETTE[2]!,
		]);
	});

	test("seeds schema defaults so an appended layer is enabled", () => {
		const slot = collectRoutableSlots(scene3d).find(
			(entry) => entry.arrayPath === "pointCloudLayers",
		)!;
		const { settings } = applyTopicToSettings(
			{ pointCloudLayers: [] },
			slot,
			lidar,
			scene3d.schema,
		);
		const layer = (
			settings.pointCloudLayers as Record<string, unknown>[]
		)[0]!;
		expect(layer.enabled).toBe(true);
		expect(layer.pointSize).toBe(0.05);
		expect(layer.label).toBe("/lidar");
	});

	test("seeds the first enum value when a property has no default", () => {
		const slot = collectRoutableSlots(mapViewer).find(
			(entry) => entry.arrayPath === "topics",
		)!;
		const { settings } = applyTopicToSettings(
			{},
			slot,
			topic("/gps", "GeolocationPosition"),
			mapViewer.schema,
		);
		const marker = (settings.topics as Record<string, unknown>[])[0]!;
		expect(marker.makerType).toBe("simple");
		expect(marker.name).toBe("/gps");
	});

	test("carries a per-slot buffer size onto the bound topic", () => {
		const buffered = defineWidget(
			"buffered",
			"Buffered",
			{ type: "object", properties: { topic: { type: "object" } } },
			{
				type: "VerticalLayout",
				elements: [
					{
						type: "TopicSelect",
						scope: "#/properties/topic",
						options: {
							dataRequirements: { accepts: ["number"] },
							buffer: 256,
						},
					},
				],
			} as unknown as UISchemaElement,
		);
		const slot = collectRoutableSlots(buffered)[0]!;
		expect(slot.bufferSize).toBe(256);
		const { selected } = applyTopicToSettings(
			{},
			slot,
			topic("/battery", "number"),
			buffered.schema,
		);
		expect(selected.bufferSize).toBe(256);
	});

	test("binds the whole message, never a guessed property", () => {
		const slot = collectRoutableSlots(timeSeriesChart)[0]!;
		const { selected } = applyTopicToSettings(
			{ topics: [] },
			slot,
			topic("/battery", "number"),
			timeSeriesChart.schema,
		);
		expect(selected.property).toBe("");
	});
});

// ---------------------------------------------------------------------------
// `role: "alternative"` — a destination that is offered, never assumed.
// ---------------------------------------------------------------------------

describe("alternatives", () => {
	const movement = topic("/cmd_vel", "Movement");
	const gaugeClaim: TopicClaim = {
		type: "Movement",
		widgetId: "airspeed",
		slot: "topic",
		role: "alternative",
	};
	const teleopClaim: TopicClaim = {
		type: "Movement",
		widgetId: "teleop",
		slot: "cmdVel",
		role: "command",
	};

	test("a sole alternative asks instead of creating", () => {
		expect(route(movement, [airspeedGauge], [gaugeClaim]).kind).toBe("ask");
	});

	test("the gauge and the teleop control are both offered for a /cmd_vel", () => {
		const decision = route(
			movement,
			[airspeedGauge, teleopControl],
			[gaugeClaim, teleopClaim],
		);

		expect(decision.kind).toBe("ask");
		if (decision.kind !== "ask") return;

		// The display leads, the control follows — and the control says it
		// commands, so nobody adds one thinking they are watching a value.
		expect(decision.options.map((option) => option.widgetId)).toEqual([
			"airspeed",
			"teleop",
		]);
		expect(decision.options.map((option) => option.direction)).toEqual([
			"subscribe",
			"publish",
		]);
	});

	test("it is per type, which is what the old slot-level flag could not be", () => {
		// The gauge has one slot and reads a `Vector3` as well. Declining to be
		// automatic for `Movement` used to mean declining for `Vector3` too,
		// because the flag lived on the slot. A claim is per type, so the same
		// slot can be the destination for one and an alternative for the other.
		const decision = route(
			topic("/imu/mag", "Vector3"),
			[airspeedGauge],
			[
				gaugeClaim,
				{
					type: "Vector3",
					widgetId: "airspeed",
					slot: "topic",
					role: "default",
				},
			],
		);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("airspeed");
		}
	});

	test("a default still wins outright beside an alternative", () => {
		const movementChart = defineWidget(
			"movement-chart",
			"Movement chart",
			{ type: "object", properties: { topic: { type: "object" } } },
			{
				type: "VerticalLayout",
				elements: [
					{
						type: "TopicSelect",
						scope: "#/properties/topic",
						options: {
							dataRequirements: { accepts: ["Movement"] },
						},
					},
				],
			} as unknown as UISchemaElement,
		);

		const decision = route(
			movement,
			[airspeedGauge, movementChart],
			[
				gaugeClaim,
				{
					type: "Movement",
					widgetId: "movement-chart",
					slot: "topic",
					role: "default",
				},
			],
		);

		expect(decision.kind).toBe("create");
		if (decision.kind !== "create") return;
		expect(decision.option.widgetId).toBe("movement-chart");
	});

	test("an open alternative is not appended to automatically", () => {
		const open = new Map<string, Widget>([
			["box-1", widget("box-1", "airspeed", "Speed")],
		]);

		expect(
			route(
				movement,
				[airspeedGauge, teleopControl],
				[gaugeClaim, teleopClaim],
				open,
			).kind,
		).toBe("ask");
	});
});

// ---------------------------------------------------------------------------

describe("resolveTopicCommands", () => {
	/**
	 * The parity defect: `resolveTopicRoute` never returns a control, so the
	 * controls only ever appeared in an `ask` — which only happens when the
	 * *display* answer is a tie. For every topic with an obvious viewer, which
	 * is most of them, the row's chooser never opened and the control was
	 * unreachable from the topic list entirely. This resolver is what lets a
	 * surface offer the controls at the same cost as the viewer, and the rules
	 * below are what stop that from becoming an over-offer.
	 */

	const movement = topic("/cmd_vel", "Movement");
	const teleopClaim: TopicClaim = {
		type: "Movement",
		widgetId: "teleop",
		slot: "cmdVel",
		role: "command",
	};

	const commands = (definitions: WidgetDefinition[], claims: TopicClaim[]) =>
		resolveTopicCommands({
			topic: movement,
			claims: indexFor(definitions, claims),
		});

	test("a control that claims the topic is offered", () => {
		const offered = commands([teleopControl], [teleopClaim]);
		expect(offered.map((option) => option.widgetId)).toEqual(["teleop"]);
		expect(offered[0]!.direction).toBe("publish");
		expect(offered[0]!.kind).toBe("create");
	});

	test("it is reachable for a topic whose display decision is forced", () => {
		// The case the split exists for: one viewer wins outright, so the
		// decision is a `create` carrying no options at all and the control
		// used to have nowhere to appear.
		const movementViewer = defineWidget(
			"movement-viewer",
			"Movement viewer",
			{ type: "object", properties: { topic: { type: "object" } } },
			{
				type: "VerticalLayout",
				elements: [
					{
						type: "TopicSelect",
						scope: "#/properties/topic",
						options: {
							dataRequirements: { accepts: ["Movement"] },
						},
					},
				],
			} as unknown as UISchemaElement,
		);

		const definitions = [movementViewer, teleopControl];
		const claims: TopicClaim[] = [
			{
				type: "Movement",
				widgetId: "movement-viewer",
				slot: "topic",
				role: "default",
			},
			teleopClaim,
		];

		const decision = route(movement, definitions, claims);
		expect(decision.kind).toBe("create");
		if (decision.kind === "create") {
			expect(decision.option.widgetId).toBe("movement-viewer");
		}

		expect(commands(definitions, claims).map((o) => o.widgetId)).toEqual([
			"teleop",
		]);
	});

	test("a topic no control claims offers nothing", () => {
		expect(
			resolveTopicCommands({
				topic: topic("/camera", "Image"),
				claims: indexFor(ALL_DEFINITIONS, CLAIMS),
			}),
		).toEqual([]);
	});

	test("a widget that can display the topic is not also offered as a control", () => {
		// Routing calls such a widget a viewer. Listing it in both groups would
		// put a control under the pointer of an operator reading a list of
		// viewers, which is the one direction this split must never fail in.
		const dualPurpose = defineWidget(
			"dual",
			"Dual",
			{
				type: "object",
				properties: {
					readback: { type: "object" },
					command: { type: "object" },
				},
			},
			{
				type: "VerticalLayout",
				elements: [
					{
						type: "TopicSelect",
						scope: "#/properties/readback",
						options: {
							dataRequirements: { accepts: ["Movement"] },
						},
					},
					{
						type: "TopicSelect",
						scope: "#/properties/command",
						options: {
							direction: "publish",
							dataRequirements: { accepts: ["Movement"] },
						},
					},
				],
			} as unknown as UISchemaElement,
		);

		expect(
			commands(
				[dualPurpose],
				[
					{
						type: "Movement",
						widgetId: "dual",
						slot: "readback",
						role: "default",
					},
					{
						type: "Movement",
						widgetId: "dual",
						slot: "command",
						role: "command",
					},
				],
			),
		).toEqual([]);
	});

	test("an unclaimed control is never offered", () => {
		expect(commands([teleopControl], [])).toEqual([]);
	});

	test("the display decision is untouched by any of this", () => {
		const decision = route(
			movement,
			[airspeedGauge, teleopControl],
			[
				{
					type: "Movement",
					widgetId: "airspeed",
					slot: "topic",
					role: "alternative",
				},
				teleopClaim,
			],
		);

		// Still an ask, still never a command as the automatic answer.
		expect(decision.kind).toBe("ask");
		if (decision.kind !== "ask") return;
		expect(
			decision.options.filter((option) => option.direction === "publish"),
		).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// One destination, offered once.
// ---------------------------------------------------------------------------

describe("a widget is never offered twice for one topic", () => {
	/** A widget whose message has both a webapp name and a wire schema name. */
	const diagnostics = defineWidget(
		"diagnostics-panel",
		"Diagnostics",
		{ type: "object", properties: { topic: { type: "object" } } },
		{
			type: "VerticalLayout",
			elements: [
				{
					type: "TopicSelect",
					scope: "#/properties/topic",
					options: {
						dataRequirements: {
							accepts: ["DiagnosticArray"],
							acceptsRaw: ["diagnostic_msgs/msg/DiagnosticArray"],
						},
					},
				},
			],
		} as unknown as UISchemaElement,
	);

	/**
	 * Both spellings, as a plugin must declare them: it ships no datasource, so
	 * it cannot know whether the operator connects through a transport that
	 * converts the schema or one that passes it through.
	 */
	const bothSpellings: TopicClaim[] = [
		{
			type: "DiagnosticArray",
			widgetId: "diagnostics-panel",
			slot: "topic",
			role: "default",
		},
		{
			type: "diagnostic_msgs/msg/DiagnosticArray",
			widgetId: "diagnostics-panel",
			slot: "topic",
			role: "default",
		},
	];

	test("a topic carrying both names still resolves to one destination", () => {
		const decision = route(
			topic(
				"/docker/status",
				"DiagnosticArray",
				"diagnostic_msgs/msg/DiagnosticArray",
			),
			[diagnostics],
			bothSpellings,
		);

		// Two claims for one widget+slot are one destination spelled twice.
		// Grouped as two defaults they tie, and a tie asks — so the duplicate
		// showed up both as a repeated row and as a question with one answer.
		expect(decision.kind).toBe("create");
		if (decision.kind !== "create") return;
		expect(decision.option.widgetId).toBe("diagnostics-panel");
	});

	test("it is listed once when the decision is an ask", () => {
		const decision = route(
			topic(
				"/docker/status",
				"DiagnosticArray",
				"diagnostic_msgs/msg/DiagnosticArray",
			),
			[diagnostics, jsonViewer],
			[
				...bothSpellings.map((claim) => ({
					...claim,
					role: "alternative" as const,
				})),
				...claimsFor("json-viewer"),
			],
		);

		expect(decision.kind).toBe("ask");
		if (decision.kind !== "ask") return;

		const ids = decision.options.map((option) => option.widgetId);
		expect(ids.filter((id) => id === "diagnostics-panel")).toHaveLength(1);
	});

	test("a widget that claims a type and is also a raw viewer appears once", () => {
		const decision = route(
			topic("/anything", "DiagnosticArray", ""),
			[diagnostics],
			[
				bothSpellings[0]!,
				{
					type: "*",
					widgetId: "diagnostics-panel",
					slot: "topic",
					role: "fallback",
				},
			],
		);

		if (decision.kind !== "create") {
			const ids = (decision as { options: { widgetId: string }[] })
				.options;
			expect(
				ids.filter((o) => o.widgetId === "diagnostics-panel"),
			).toHaveLength(1);
			return;
		}
		expect(decision.option.widgetId).toBe("diagnostics-panel");
	});
});

// ---------------------------------------------------------------------------
// Widgets that discover their own topics.
// ---------------------------------------------------------------------------

describe("a claim without a slot", () => {
	/** Shaped like the diagnostics panel: no TopicSelect anywhere. */
	const discovering = defineWidget(
		"diagnostics-widget",
		"Diagnostics",
		{ type: "object", properties: { title: { type: "string" } } },
		{
			type: "VerticalLayout",
			elements: [{ type: "Control", scope: "#/properties/title" }],
		} as unknown as UISchemaElement,
		{ title: "Diagnostics" },
	);

	const discovers: TopicClaim[] = [
		{
			type: "DiagnosticArray",
			widgetId: "diagnostics-widget",
			role: "default",
		},
	];

	test("routes to the widget and binds nothing", () => {
		const decision = route(
			topic("/diagnostics", "DiagnosticArray"),
			[discovering],
			discovers,
		);

		expect(decision.kind).toBe("create");
		if (decision.kind !== "create") return;
		expect(decision.option.widgetId).toBe("diagnostics-widget");
		// The absence is the point: a caller that wrote a topic here would be
		// writing into a path the widget does not have.
		expect(decision.option.slot).toBeUndefined();
		expect(decision.option.direction).toBe("subscribe");
	});

	test("an open instance is reported as already showing it", () => {
		const open = new Map<string, Widget>([
			["box-1", widget("box-1", "diagnostics-widget", "Diagnostics")],
		]);

		const decision = route(
			topic("/other_diagnostics", "DiagnosticArray"),
			[discovering],
			discovers,
			open,
		);

		// Not `create` — a second identical panel showing the same merged view
		// is the wrong answer. Not `none` either: that means nothing can show
		// the topic, which is the opposite of what is true here.
		expect(decision.kind).toBe("present");
		if (decision.kind !== "present") return;
		expect(decision.boxId).toBe("box-1");
		expect(decision.reason).toContain("/other_diagnostics");
	});

	test("is dropped when its widget has slots it should have named", () => {
		const decision = route(
			topic("/n", "number"),
			[timeSeriesChart],
			[
				{
					type: "number",
					widgetId: "chart-widget-time-series",
					role: "default",
				},
			],
		);

		// Forgetting the slot on a widget that has one would otherwise create
		// that widget with an empty picker while the operator believes their
		// topic was bound.
		expect(decision.kind).toBe("none");
	});

	test("coexists with a slotted claim on the same type, each offered once", () => {
		const decision = route(
			topic("/docker/status", "DiagnosticArray"),
			[discovering, jsonViewer],
			[
				{
					type: "DiagnosticArray",
					widgetId: "diagnostics-widget",
					role: "alternative",
				},
				...claimsFor("json-viewer"),
			],
		);

		expect(decision.kind).toBe("ask");
		if (decision.kind !== "ask") return;
		const ids = decision.options.map((option) => option.widgetId);
		expect(ids.filter((id) => id === "diagnostics-widget")).toHaveLength(1);
	});
});
