/**
 * The chart is the destination topic-first routing picks for a `number` topic,
 * and the append path writes an item into `topics[]` from the schema alone.
 * That contract lives half in core's router and half in this widget's schema
 * and uischema, so it can only be broken from here — by renaming the array,
 * restructuring the detail layout, or giving `color` a default and quietly
 * overriding the palette that keeps two series on one chart distinguishable.
 */

import { expect, test } from "bun:test";
import {
	TOPIC_ROUTING_PALETTE,
	applyTopicToSettings,
	collectRoutableSlots,
	createWidgetSettings,
	slotPath,
} from "@workspace/ormi-core/widgets";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";
import { TimeSeriesChartDefinition } from "../timeseries-chart";
import { topicClaims } from "../../../topic-claims";
import type { ChartSeriesSettings } from "../chart-series";

/**
 * The routing helpers take the registry's erased definition type; the widget's
 * own settings generic is narrower, which the erased `Component` signature
 * cannot accept. The registry does the same widening when it collects
 * definitions into `WidgetDefinition<any>[]`.
 */
const routable = (): WidgetDefinition =>
	TimeSeriesChartDefinition() as unknown as WidgetDefinition;

/** A numeric topic as the routing index sees one. */
const numberTopic = (name: string): DatasourceTopic =>
	({
		topic: name,
		datasource_id: "ds-1",
		source: { id: "ds-1", title: "Robot", enable: true },
		type: "number",
		rawType: "std_msgs/msg/Float64",
	}) as unknown as DatasourceTopic;

test("the chart exposes exactly one array-backed subscribe slot for numbers", () => {
	const definition = routable();
	const slots = collectRoutableSlots(definition);

	expect(slots).toHaveLength(1);
	expect(slots[0]).toMatchObject({
		widgetId: "chart-widget-time-series",
		arrayPath: "topics",
		path: "topic",
		isArray: true,
		// A chart reads its topics. Marking this slot "publish" would remove
		// the chart from the routing index entirely.
		direction: "subscribe",
		role: "primary",
	});
	expect(slots[0]!.requirements?.accepts).toEqual(["number"]);
});

test("the plugin claims `number` for exactly this slot", () => {
	// The other half of the contract, and the half that is now a statement
	// rather than an inference: routing opens this chart for a `number` topic
	// because the plugin says so, naming the slot by the same string
	// `slotPath` produces. Renaming the array breaks the claim, not the
	// mapping quietly.
	const slot = collectRoutableSlots(routable())[0]!;
	const claim = topicClaims.find(
		(entry) => entry.type === "number" && entry.role === "default",
	);

	expect(claim).toBeDefined();
	expect(claim!.widgetId).toBe("chart-widget-time-series");
	expect(claim!.slot).toBe(slotPath(slot));
});

test("appending a routed topic yields a drawable series without opening the dialog", () => {
	const definition = routable();
	const slot = collectRoutableSlots(definition)[0]!;

	let settings = createWidgetSettings(definition);
	for (const name of ["/speed", "/voltage"]) {
		settings = applyTopicToSettings(
			settings,
			slot,
			numberTopic(name),
			definition.schema,
		).settings;
	}

	const series = settings.topics as ChartSeriesSettings[];
	expect(series).toHaveLength(2);
	expect(series.map((entry) => entry.topic.topic)).toEqual([
		"/speed",
		"/voltage",
	]);

	// `color` must stay default-less in the schema or the palette cursor never
	// runs and every routed series is the same colour.
	expect(series[0]!.color).toBe(TOPIC_ROUTING_PALETTE[0]);
	expect(series[1]!.color).toBe(TOPIC_ROUTING_PALETTE[1]);

	expect(series[0]).toMatchObject({
		type: "line",
		lineStyle: "solid",
		lineWidth: 1,
		fill: false,
		points: false,
	});
});
