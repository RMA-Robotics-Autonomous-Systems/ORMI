/**
 * Axis grouping decides how many y axes a chart grows. Getting it wrong is not
 * subtle — one axis per series eats the plotting area — but it is also the
 * dual-scale feature itself (speed against battery voltage on one chart), so
 * the grouping key is worth pinning down.
 */

import { describe, expect, test } from "bun:test";
import type { SelectedTopic } from "@workspace/ormi-core/datasources";
import {
	ChartSeriesSettings,
	resolveChartAxes,
	resolveDash,
	resolveLineWidth,
	resolvePointSize,
	resolveSeriesLabel,
} from "../chart-series";

/** Minimal SelectedTopic stand-in; the axis grouping never reads the wire. */
const topic = (name: string, property = ""): SelectedTopic =>
	({
		topic: name,
		datasource_id: "ds-1",
		source: { id: "ds-1", title: "Robot", enable: true },
		type: "number",
		rawType: "std_msgs/msg/Float64",
		property,
	}) as unknown as SelectedTopic;

/** Build a series with the given overrides. */
const series = (
	overrides: Partial<ChartSeriesSettings> = {},
): ChartSeriesSettings => ({
	topic: topic("/speed"),
	...overrides,
});

describe("resolveChartAxes", () => {
	test("collapses series that agree onto one axis", () => {
		const { axes, scaleKeys } = resolveChartAxes([
			series(),
			series(),
			series(),
		]);

		expect(axes).toHaveLength(1);
		expect(scaleKeys).toEqual(["y0", "y0", "y0"]);
		expect(axes[0]).toEqual({
			scale: "y0",
			side: "left",
			label: undefined,
			min: null,
			max: null,
		});
	});

	test("gives a right-hand series its own axis", () => {
		const { axes, scaleKeys } = resolveChartAxes([
			series({ axis: { yLabel: "m/s" } }),
			series({ axis: { side: "right", yLabel: "V" } }),
		]);

		expect(scaleKeys).toEqual(["y0", "y1"]);
		expect(axes.map((axis) => axis.side)).toEqual(["left", "right"]);
		expect(axes.map((axis) => axis.label)).toEqual(["m/s", "V"]);
	});

	test("separates axes that differ only in bounds", () => {
		const { axes } = resolveChartAxes([
			series({ axis: { yMin: 0, yMax: 10 } }),
			series({ axis: { yMin: 0, yMax: 100 } }),
		]);

		expect(axes).toHaveLength(2);
		expect(axes[0]!.max).toBe(10);
		expect(axes[1]!.max).toBe(100);
	});

	test("merges the chart-wide axis field by field under the series' own", () => {
		// Automatic topic placement seeds an appended series with the first
		// value of every enum it finds, so a routed series arrives carrying
		// `{ side: "left" }` and nothing else. Replacing the chart-wide axis
		// wholesale would make it silently ignore the configured bounds.
		const { axes, scaleKeys } = resolveChartAxes(
			[series(), series({ axis: { side: "left" } })],
			{ yMin: -1, yMax: 1, yLabel: "rad/s" },
		);

		expect(axes).toHaveLength(1);
		expect(scaleKeys).toEqual(["y0", "y0"]);
		expect(axes[0]).toMatchObject({
			min: -1,
			max: 1,
			label: "rad/s",
			side: "left",
		});
	});

	test("lets a series override one field of the chart-wide axis", () => {
		const { axes } = resolveChartAxes(
			[series({ axis: { side: "right" } })],
			{ yLabel: "V" },
		);

		expect(axes[0]).toMatchObject({ side: "right", label: "V" });
	});

	test("treats a blank label and a non-numeric bound as unset", () => {
		const { axes } = resolveChartAxes([
			series({
				axis: {
					yLabel: "   ",
					yMin: Number.NaN,
					yMax: undefined,
				},
			}),
		]);

		expect(axes[0]).toMatchObject({
			label: undefined,
			min: null,
			max: null,
		});
	});

	test("returns nothing for a chart with no series", () => {
		expect(resolveChartAxes([])).toEqual({ axes: [], scaleKeys: [] });
	});
});

describe("resolveSeriesLabel", () => {
	test("prefers the configured title", () => {
		expect(resolveSeriesLabel(series({ title: "Ground speed" }))).toBe(
			"Ground speed",
		);
	});

	test("falls back to the topic name", () => {
		expect(resolveSeriesLabel(series())).toBe("/speed");
		expect(resolveSeriesLabel(series({ title: "  " }))).toBe("/speed");
	});

	test("names the bound property when the series plots one", () => {
		expect(
			resolveSeriesLabel(
				series({ topic: topic("/odom", "twist-twist-linear-x") }),
			),
		).toBe("/odom.twist.twist.linear.x");
	});
});

describe("resolveDash", () => {
	test("leaves a solid stroke undashed", () => {
		expect(resolveDash("solid", 1)).toBeUndefined();
		expect(resolveDash(undefined, 1)).toBeUndefined();
	});

	test("scales the pattern with line width so a thick dash stays visible", () => {
		expect(resolveDash("dashed", 1)).toEqual([5, 3]);
		expect(resolveDash("dashed", 4)).toEqual([20, 12]);
		expect(resolveDash("dotted", 2)).toEqual([2, 6]);
	});
});

describe("resolveLineWidth / resolvePointSize", () => {
	test("default when unset", () => {
		expect(resolveLineWidth(series())).toBe(1);
		expect(resolvePointSize(series())).toBe(4);
	});

	test("honour a configured value", () => {
		expect(resolveLineWidth(series({ lineWidth: 3 }))).toBe(3);
		expect(resolvePointSize(series({ pointSize: 9 }))).toBe(9);
	});

	test("reject values uPlot cannot draw", () => {
		expect(resolveLineWidth(series({ lineWidth: 0 }))).toBe(1);
		expect(resolveLineWidth(series({ lineWidth: -2 }))).toBe(1);
		expect(resolveLineWidth(series({ lineWidth: 1e6 }))).toBe(20);
		expect(resolvePointSize(series({ pointSize: Number.NaN }))).toBe(4);
		expect(resolvePointSize(series({ pointSize: 1e6 }))).toBe(40);
	});
});
