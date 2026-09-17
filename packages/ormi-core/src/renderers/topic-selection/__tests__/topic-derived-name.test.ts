/**
 * Tests for naming a thing after the topic it shows.
 *
 * Both directions fail quietly. Deriving too little leaves the operator typing
 * the name of the topic they picked one row above, forever — the complaint this
 * exists to answer. Deriving too much silently replaces a name the operator
 * typed, which they will not notice until they are looking for a panel that is
 * no longer called what they called it.
 */

import { describe, test, expect } from "bun:test";
import type { JsonSchema } from "@jsonforms/core";
import {
	deriveNameFromTopic,
	resolveDerivedNameUpdates,
} from "../topic-derived-name";

/** A widget whose settings hold an array of named, topic-backed layers. */
const layerSchema: JsonSchema = {
	type: "object",
	properties: {
		title: { type: "string" },
		layers: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
					markerType: { type: "string", enum: ["simple", "heatmap"] },
					topic: { type: "object" },
					numericalTopic: { type: "object" },
				},
			},
		},
	},
};

const gps = { topic: "/robot/gps" };
const other = { topic: "/robot/other_gps" };

describe("deriveNameFromTopic", () => {
	test("is the topic name", () => {
		expect(deriveNameFromTopic(gps)).toBe("/robot/gps");
	});

	test("has nothing to derive from an absent or blank topic", () => {
		expect(deriveNameFromTopic(undefined)).toBe("");
		expect(deriveNameFromTopic({})).toBe("");
		expect(deriveNameFromTopic({ topic: "   " })).toBe("");
	});
});

describe("resolveDerivedNameUpdates", () => {
	test("names an array item after the topic bound into it", () => {
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{}] },
				path: "layers.0.topic",
				next: gps,
			}),
		).toEqual([{ path: "layers.0.name", value: "/robot/gps" }]);
	});

	test("fills a blank name as readily as a missing one", () => {
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{ name: "   " }] },
				path: "layers.0.topic",
				next: gps,
			}),
		).toEqual([{ path: "layers.0.name", value: "/robot/gps" }]);
	});

	test("never overwrites a name the operator typed", () => {
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{ name: "Front rover" }] },
				path: "layers.0.topic",
				previous: other,
				next: gps,
			}),
		).toEqual([]);
	});

	test("re-derives a name that is still the previous topic's", () => {
		// The operator rebinding the slot has not adopted the old topic's name.
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{ name: "/robot/other_gps" }] },
				path: "layers.0.topic",
				previous: other,
				next: gps,
			}),
		).toEqual([{ path: "layers.0.name", value: "/robot/gps" }]);
	});

	test("treats the schema default as a placeholder, not a choice", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				name: { type: "string", default: "New layer" },
				topic: { type: "object" },
			},
		};

		expect(
			resolveDerivedNameUpdates({
				rootSchema: schema,
				rootData: { name: "New layer" },
				path: "topic",
				next: gps,
			}),
		).toEqual([{ path: "name", value: "/robot/gps" }]);
	});

	test("a secondary slot names nothing", () => {
		// A heatmap's weighting channel is not what the layer is.
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{}] },
				path: "layers.0.numericalTopic",
				next: { topic: "/robot/signal" },
				role: "secondary",
			}),
		).toEqual([]);
	});

	test("names the widget's own title for a top-level slot", () => {
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: {},
				path: "topic",
				next: gps,
			}),
		).toEqual([{ path: "title", value: "/robot/gps" }]);
	});

	test("writes nothing when the name is already the derived one", () => {
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{ name: "/robot/gps" }] },
				path: "layers.0.topic",
				next: gps,
			}),
		).toEqual([]);
	});

	test("ignores properties that are not free-text strings", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				// An enum named `label` is a choice, not a caption.
				label: { type: "string", enum: ["a", "b"] },
				name: { type: "number" },
				topic: { type: "object" },
			},
		};

		expect(
			resolveDerivedNameUpdates({
				rootSchema: schema,
				rootData: {},
				path: "topic",
				next: gps,
			}),
		).toEqual([]);
	});

	test("has nothing to say without a schema, a topic or a name property", () => {
		expect(
			resolveDerivedNameUpdates({
				rootData: { layers: [{}] },
				path: "layers.0.topic",
				next: gps,
			}),
		).toEqual([]);
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{}] },
				path: "layers.0.topic",
				next: undefined,
			}),
		).toEqual([]);
		expect(
			resolveDerivedNameUpdates({
				rootSchema: {
					type: "object",
					properties: { topic: { type: "object" } },
				},
				rootData: {},
				path: "topic",
				next: gps,
			}),
		).toEqual([]);
	});

	test("leaves a non-string value alone rather than replacing it", () => {
		expect(
			resolveDerivedNameUpdates({
				rootSchema: layerSchema,
				rootData: { layers: [{ name: 42 }] },
				path: "layers.0.topic",
				next: gps,
			}),
		).toEqual([]);
	});
});
