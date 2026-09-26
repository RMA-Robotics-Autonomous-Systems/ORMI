import { describe, expect, it } from "bun:test";
import type { JsonSchema } from "@jsonforms/core";

import {
	describeTopicBinding,
	deriveRowTitle,
	fallbackRowTitle,
} from "../row-title";
import { deriveItemNoun, singularizeWord } from "../item-noun";

/** A chart series item, as `ormi-std-widgets` declares it (abridged). */
const SERIES_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		topic: { type: "object", title: "Topic" },
		title: { type: "string", title: "Series title" },
		color: { type: "string", title: "Color" },
	},
};

/** A teleop axis item: no name property, and a defaulted enum. */
const AXIS_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		axis: {
			type: "string",
			enum: ["linear.x", "linear.y", "angular.z"],
			default: "linear.x",
		},
		multiplier: { type: "number", default: 1 },
	},
};

describe("deriveRowTitle", () => {
	it("prefers the row's own name", () => {
		expect(
			deriveRowTitle({
				item: {
					title: "Battery voltage",
					topic: { topic: "/battery" },
				},
				itemSchema: SERIES_SCHEMA,
				index: 0,
				noun: "Series",
			}),
		).toBe("Battery voltage");
	});

	it("reads name, then label, then title", () => {
		const item = { name: "N", label: "L", title: "T" };
		expect(deriveRowTitle({ item, index: 0, noun: "Item" })).toBe("N");
		expect(
			deriveRowTitle({
				item: { label: "L", title: "T" },
				index: 0,
				noun: "Item",
			}),
		).toBe("L");
	});

	it("falls to the bound topic when the name is blank", () => {
		expect(
			deriveRowTitle({
				item: {
					title: "  ",
					topic: { topic: "/odom", type: "Odometry" },
				},
				itemSchema: SERIES_SCHEMA,
				index: 1,
				noun: "Series",
			}),
		).toBe("/odom");
	});

	it("includes the bound property of a topic binding", () => {
		expect(
			deriveRowTitle({
				item: {
					topic: { topic: "/odom", property: "pose.position.x" },
				},
				itemSchema: SERIES_SCHEMA,
				index: 0,
				noun: "Series",
			}),
		).toBe("/odom → pose.position.x");
	});

	it("ignores a name that is still the schema default", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				name: { type: "string", default: "New layer" },
				topic: { type: "object" },
			},
		};
		expect(
			deriveRowTitle({
				item: { name: "New layer" },
				itemSchema: schema,
				index: 2,
				noun: "Layer",
			}),
		).toBe("Layer 3");
		expect(
			deriveRowTitle({
				item: { name: "New layer", topic: { topic: "/scan" } },
				itemSchema: schema,
				index: 2,
				noun: "Layer",
			}),
		).toBe("/scan");
	});

	it("never takes an arbitrary first property: new teleop axes are numbered", () => {
		const item = { axis: "linear.x", multiplier: 1 };
		const titles = [0, 1].map((index) =>
			deriveRowTitle({
				item,
				itemSchema: AXIS_SCHEMA,
				index,
				noun: "Axis",
			}),
		);
		expect(titles).toEqual(["Axis 1", "Axis 2"]);
	});

	it("honours a declared elementLabelProp, default or not", () => {
		const input = {
			itemSchema: AXIS_SCHEMA,
			index: 0,
			noun: "Axis",
			labelProp: "axis",
		};
		expect(deriveRowTitle({ ...input, item: { axis: "angular.z" } })).toBe(
			"angular.z",
		);
		expect(deriveRowTitle({ ...input, item: { axis: "linear.x" } })).toBe(
			"linear.x",
		);
		expect(deriveRowTitle({ ...input, item: { axis: "" } })).toBe("Axis 1");
	});

	it("titles a row that is itself a topic binding", () => {
		expect(
			deriveRowTitle({
				item: { topic: "/tf_static", type: "TFMessage" },
				index: 0,
				noun: "Topic",
			}),
		).toBe("/tf_static");
	});

	it("finds a binding held under another property name", () => {
		expect(
			deriveRowTitle({
				item: { source: { topic: "/gps/fix" }, weight: 2 },
				index: 0,
				noun: "Layer",
			}),
		).toBe("/gps/fix");
	});

	it("titles a scalar row by its value", () => {
		expect(deriveRowTitle({ item: "/tf", index: 0, noun: "Topic" })).toBe(
			"/tf",
		);
		expect(deriveRowTitle({ item: 0, index: 0, noun: "Value" })).toBe("0");
		expect(deriveRowTitle({ item: "", index: 3, noun: "Topic" })).toBe(
			"Topic 4",
		);
	});

	it("never returns an empty heading", () => {
		for (const item of [undefined, null, {}, [], "", { title: "" }]) {
			expect(
				deriveRowTitle({ item, index: 0, noun: "Series" }).length,
			).toBeGreaterThan(0);
		}
	});
});

describe("describeTopicBinding", () => {
	it("rejects a binding with no topic name", () => {
		expect(describeTopicBinding({ topic: "" })).toBeUndefined();
		expect(describeTopicBinding({ type: "Image" })).toBeUndefined();
		expect(describeTopicBinding(undefined)).toBeUndefined();
	});
});

describe("fallbackRowTitle", () => {
	it("is one-based", () => {
		expect(fallbackRowTitle("Series", 0)).toBe("Series 1");
	});
});

describe("deriveItemNoun", () => {
	it("keeps invariant plurals", () => {
		expect(deriveItemNoun("Series")).toEqual({
			singularTitle: "Series",
			singular: "series",
			plural: "series",
		});
	});

	it("inflects only the last word and keeps acronyms", () => {
		expect(deriveItemNoun("Point Cloud Layers")).toEqual({
			singularTitle: "Point Cloud Layer",
			singular: "point cloud layer",
			plural: "point cloud layers",
		});
		expect(deriveItemNoun("IMU Topics").singular).toBe("IMU topic");
	});

	it("ignores a required asterisk and falls back to item", () => {
		expect(deriveItemNoun("Conditions*").singularTitle).toBe("Condition");
		expect(deriveItemNoun(undefined).plural).toBe("items");
		expect(deriveItemNoun("  ").singular).toBe("item");
	});

	it("capitalises a lowercase label for the heading", () => {
		expect(deriveItemNoun("topics").singularTitle).toBe("Topic");
	});
});

describe("singularizeWord", () => {
	it.each([
		["Axes", "Axis"],
		["Batteries", "Battery"],
		["Boxes", "Box"],
		["Patches", "Patch"],
		["Geofences", "Geofence"],
		["Status", "Status"],
		["Classes", "Class"],
		["Anchors", "Anchor"],
		["Radius", "Radius"],
		["TOPICS", "TOPIC"],
		["QUERIES", "QUERY"],
	])("%s → %s", (plural, singular) => {
		expect(singularizeWord(plural)).toBe(singular);
	});
});
