/**
 * Tests for the map's "this entry is not configured yet" detection.
 *
 * A false negative puts a half-configured entry back in front of a marker that
 * reads `topic.source.id`, which is how the map came to take its whole tile
 * down with a `TypeError`. A false positive hides an entry that works from an
 * operator, with no way to tell why it vanished. Neither shows up in a type
 * check, and both are invisible until a robot is in the field.
 */

import { describe, test, expect } from "bun:test";
import {
	findUnconfiguredEntries,
	isEntryConfigured,
	GPS_ENTRY_SLOTS,
	LOCAL_ENTRY_SLOTS,
} from "../unconfigured-entries";

/**
 * A settings entry, built the way JSON-parsed settings arrive: a plain object
 * whose shape is whatever was saved, not a declared interface.
 */
const entry = (fields: Record<string, unknown>) => fields;

/** A bound topic, as the picker writes it into settings. */
const topic = (name: string) => ({
	topic: name,
	datasource_id: "ds-1",
	source: { id: "ds-1", title: "Robot", enable: true },
	type: "GeolocationPosition",
	rawType: "sensor_msgs/NavSatFix",
	property: "",
});

describe("isEntryConfigured", () => {
	test("a GPS entry with its topic bound is drawable", () => {
		expect(
			isEntryConfigured(
				entry({ name: "Robot", topic: topic("/fix") }),
				GPS_ENTRY_SLOTS,
			),
		).toBe(true);
	});

	test("a GPS entry with no topic is not drawable", () => {
		expect(
			isEntryConfigured(entry({ name: "Robot" }), GPS_ENTRY_SLOTS),
		).toBe(false);
	});

	test("a local entry needs both its topic and its GPS origin", () => {
		const both = entry({
			name: "Plan",
			topic: topic("/plan"),
			gpsOriginTopic: topic("/fix"),
		});
		expect(isEntryConfigured(both, LOCAL_ENTRY_SLOTS)).toBe(true);

		// What the topic-first router produces: one topic written into a new
		// array item whose sibling GPS origin it cannot fill.
		expect(
			isEntryConfigured(
				entry({ name: "Plan", topic: topic("/plan") }),
				LOCAL_ENTRY_SLOTS,
			),
		).toBe(false);
		expect(
			isEntryConfigured(
				entry({ name: "Plan", gpsOriginTopic: topic("/fix") }),
				LOCAL_ENTRY_SLOTS,
			),
		).toBe(false);
	});

	test("a half-written topic object is not a bound topic", () => {
		expect(
			isEntryConfigured(
				entry({ name: "Robot", topic: { topic: "/fix" } }),
				GPS_ENTRY_SLOTS,
			),
		).toBe(false);
	});

	test("a missing entry is not drawable", () => {
		expect(isEntryConfigured(undefined, GPS_ENTRY_SLOTS)).toBe(false);
	});
});

describe("findUnconfiguredEntries", () => {
	test("reports nothing when every entry is bound", () => {
		expect(
			findUnconfiguredEntries(
				[entry({ name: "Robot", topic: topic("/fix") })],
				"Topics",
				GPS_ENTRY_SLOTS,
			),
		).toEqual([]);
	});

	test("reports an absent or empty list as nothing to report", () => {
		expect(
			findUnconfiguredEntries(undefined, "Topics", GPS_ENTRY_SLOTS),
		).toEqual([]);
		expect(findUnconfiguredEntries([], "Topics", GPS_ENTRY_SLOTS)).toEqual(
			[],
		);
	});

	test("names the entry and every slot it is waiting for", () => {
		const found = findUnconfiguredEntries(
			[entry({ name: "Plan" })],
			"Path Topics",
			LOCAL_ENTRY_SLOTS,
		);

		expect(found).toHaveLength(1);
		expect(found[0]?.section).toBe("Path Topics");
		expect(found[0]?.name).toBe("Plan");
		expect(found[0]?.missing).toEqual(["Topic", "GPS Origin"]);
	});

	test("falls back to the entry's position when it has no name", () => {
		const found = findUnconfiguredEntries(
			[entry({ name: "  " }), entry({})],
			"IMU Topics",
			LOCAL_ENTRY_SLOTS,
		);

		expect(found.map((e) => e.name)).toEqual(["Entry 1", "Entry 2"]);
		expect(new Set(found.map((e) => e.id)).size).toBe(2);
	});

	test("reports only the entries that are incomplete", () => {
		const found = findUnconfiguredEntries(
			[
				entry({ name: "Robot", topic: topic("/fix") }),
				entry({ name: "Drone" }),
				entry({ name: "Rover", topic: topic("/rover/fix") }),
			],
			"Topics",
			GPS_ENTRY_SLOTS,
		);

		expect(found.map((e) => e.name)).toEqual(["Drone"]);
		expect(found[0]?.missing).toEqual(["Topic"]);
	});
});
