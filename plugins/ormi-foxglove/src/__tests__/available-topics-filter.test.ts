/**
 * `AVAILABLE_TOPICS` answers with the datasource as it is NOW.
 *
 * Operator report: "when we add a datasource and change its name, it doesn't
 * update in the dashboard topics — we have to reload the dashboard." The filter
 * used to be registered inside an effect that captured `settings` from the
 * render it last ran in, so every listed topic kept reporting the datasource's
 * title from before the rename until something unrelated (a new channel, a
 * reload) re-ran that effect.
 *
 * The hook is a PULL filter, so the fix is to resolve the settings when the
 * filter is invoked rather than when it is registered — which is exactly what
 * these tests pin. They deliberately register the filter ONCE and then mutate
 * the state behind it: a regression that goes back to capturing state at
 * registration time fails here even though nothing about the registration
 * changed.
 */

import { describe, test, expect } from "bun:test";
import type { Channel } from "@foxglove/ws-protocol";

import type { DatasourceTopic } from "@workspace/ormi-core/datasources";

import { createAvailableTopicsFilter } from "../available-topics-filter";
import type { FoxgloveDataSourceSettings } from "../types";

/** Settings as `GlobalDataSourcesProvider` spreads them into the provider. */
const settings = (title: string): FoxgloveDataSourceSettings => ({
	id: "datasource_1",
	title,
	enable: true,
	toasts: false,
	transformTreeTopics: [],
	url: "ws://robot.local:8765",
	reconnectTimeout: 2,
});

/** One advertised channel, as the Foxglove server describes it. */
const channel = (id: number, topic: string, schemaName: string): Channel =>
	({
		id,
		topic,
		encoding: "cdr",
		schemaName,
		schema: "",
	}) as Channel;

describe("createAvailableTopicsFilter", () => {
	test("lists one topic per advertised channel, attributed to the datasource", async () => {
		const filter = createAvailableTopicsFilter({
			getSettings: () => settings("Robot A"),
			getChannels: () =>
				new Map([
					[1, channel(1, "/odom", "nav_msgs/msg/Odometry")],
					[2, channel(2, "/scan", "sensor_msgs/msg/LaserScan")],
				]),
		});

		const topics = await filter([]);

		expect(topics.map((topic) => topic.topic)).toEqual(["/odom", "/scan"]);
		expect(
			topics.every((topic) => topic.datasource_id === "datasource_1"),
		).toBe(true);
		expect(topics[0]!.rawType).toBe("nav_msgs/msg/Odometry");
	});

	test("a rename is visible on the next call, with no re-registration", async () => {
		let current = settings("Old name");
		const channels = new Map([
			[1, channel(1, "/odom", "nav_msgs/msg/Odometry")],
		]);

		// Registered once, exactly as the provider registers it.
		const filter = createAvailableTopicsFilter({
			getSettings: () => current,
			getChannels: () => channels,
		});

		const before = await filter([]);
		expect(before[0]!.source.title).toBe("Old name");

		// The operator renames the datasource. The provider re-renders; the
		// filter registration is untouched.
		current = { ...current, title: "New name" };

		const after = await filter([]);
		expect(after[0]!.source.title).toBe("New name");
		// Same instance id: a rename must not re-key the topic, or every widget
		// bound to it would lose its binding.
		expect(after[0]!.datasource_id).toBe("datasource_1");
	});

	test("a channel advertised after registration is listed on the next call", async () => {
		const channels = new Map<number, Channel>();
		const filter = createAvailableTopicsFilter({
			getSettings: () => settings("Robot A"),
			getChannels: () => channels,
		});

		expect(await filter([])).toEqual([]);

		channels.set(1, channel(1, "/odom", "nav_msgs/msg/Odometry"));

		expect((await filter([])).map((topic) => topic.topic)).toEqual([
			"/odom",
		]);
	});

	test("appends to the incoming list instead of replacing it", async () => {
		const other: DatasourceTopic = {
			topic: "/other",
			datasource_id: "datasource_2",
			source: { ...settings("Robot B"), id: "datasource_2" },
			type: "",
			rawType: "std_msgs/msg/String",
		};

		const filter = createAvailableTopicsFilter({
			getSettings: () => settings("Robot A"),
			getChannels: () =>
				new Map([[1, channel(1, "/odom", "nav_msgs/msg/Odometry")]]),
		});

		const topics = await filter([other]);
		expect(topics.map((topic) => topic.topic)).toEqual(["/other", "/odom"]);
	});

	test("a failing datasource yields the list it was given, never a rejection", async () => {
		// AVAILABLE_TOPICS is applied across every datasource in the workspace:
		// a throw here would take the whole topic list down, not just these rows.
		const filter = createAvailableTopicsFilter({
			getSettings: () => {
				throw new Error("settings unavailable");
			},
			getChannels: () => new Map(),
		});

		const incoming: DatasourceTopic[] = [];
		expect(await filter(incoming)).toBe(incoming);
	});
});
