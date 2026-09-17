/**
 * Tests for the created-topics store.
 *
 * The defect this module exists to fix: a topic the operator created was handed
 * back to the one picker that opened the creator dialog and stored in that
 * widget's settings, and nothing else in the app ever heard about it. No
 * `AVAILABLE_TOPICS` contributor could name it — it is on no wire yet, which is
 * the whole reason the operator had to create it — so the topics panel, every
 * other widget's picker and the routing index were blind to it until the robot
 * itself started advertising it. Reloading the page was the workaround, and the
 * reload was doing the work.
 *
 * Every assertion below is about something invisible in a running dashboard:
 * a missing row looks like a topic that has not arrived yet, and a duplicated
 * one looks like two robots. Neither shows up in a type check.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { PluginsHooks, PluginsManager } from "@workspace/ormi-plugins";

import {
	getCreatedTopicsStore,
	type CreatedTopicsStore,
} from "../created-topics";
import type { DatasourceTopic } from "../datasource-interface";

/** A topic as a datasource or the creator dialog would produce it. */
const topic = (
	name: string,
	sourceId = "ds-1",
	type = "Movement",
): DatasourceTopic => ({
	topic: name,
	datasource_id: "foxglove",
	source: { id: sourceId, title: "Robot", enable: true },
	type,
	rawType: "geometry_msgs/msg/Twist",
});

/** A fresh manager, so each test gets its own store and filter registration. */
const newManager = () => new PluginsManager(new Map());

/** Read `AVAILABLE_TOPICS` exactly as every picker and the topics panel do. */
const listTopics = (manager: PluginsManager, seed: DatasourceTopic[] = []) =>
	manager.applyFilterAsync<DatasourceTopic[]>(
		PluginsHooks.AVAILABLE_TOPICS,
		seed,
	);

/** Stand in for a datasource that enumerates `names` from its own channels. */
const registerDatasource = (manager: PluginsManager, names: string[]): void => {
	manager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
		id: "fake-datasource-topics",
		priority: 100,
		filter: (topics: DatasourceTopic[]) => [
			...topics,
			...names.map((name) => topic(name)),
		],
	});
};

describe("created topics reach AVAILABLE_TOPICS", () => {
	let manager: PluginsManager;
	let store: CreatedTopicsStore;

	beforeEach(() => {
		manager = newManager();
		store = getCreatedTopicsStore(manager);
	});

	test("a declared topic is listed on the very next read", async () => {
		expect(await listTopics(manager)).toEqual([]);

		store.declare(topic("/cmd_vel"));

		const listed = await listTopics(manager);
		expect(listed.map((entry) => entry.topic)).toEqual(["/cmd_vel"]);
		expect(listed[0]!.type).toBe("Movement");
	});

	test("it is listed beside the topics the datasource enumerates", async () => {
		registerDatasource(manager, ["/odom", "/scan"]);
		store.declare(topic("/cmd_vel"));

		const listed = await listTopics(manager);
		expect(listed.map((entry) => entry.topic).sort()).toEqual([
			"/cmd_vel",
			"/odom",
			"/scan",
		]);
	});

	test("a topic the datasource has meanwhile advertised is not listed twice", async () => {
		// The ordinary end state for a publisher: the operator creates it, a
		// control advertises it, the bridge picks it up and the datasource
		// starts enumerating it. Two rows share one React key in the topics
		// panel, so a duplicate is not cosmetic.
		store.declare(topic("/cmd_vel"));
		registerDatasource(manager, ["/cmd_vel", "/odom"]);

		const listed = await listTopics(manager);
		expect(
			listed.filter((entry) => entry.topic === "/cmd_vel"),
		).toHaveLength(1);
	});

	test("the same topic on two datasources stays two topics", async () => {
		store.declare(topic("/cmd_vel", "ds-1"));
		store.declare(topic("/cmd_vel", "ds-2"));

		const listed = await listTopics(manager);
		expect(listed.map((entry) => entry.source.id).sort()).toEqual([
			"ds-1",
			"ds-2",
		]);
	});

	test("an unconfigured topic slot is never listed", async () => {
		// Widget settings legitimately hold half-bound slots, and the publisher
		// provider hands them straight through.
		store.declare({} as DatasourceTopic);
		store.declare(topic(""));
		store.declare({
			...topic("/x"),
			source: { id: "" },
		} as DatasourceTopic);

		expect(await listTopics(manager)).toEqual([]);
	});

	test("listeners fire on declare, so a list on screen refreshes at once", () => {
		let notified = 0;
		const unsubscribe = store.subscribe(() => {
			notified++;
		});

		store.declare(topic("/cmd_vel"));
		expect(notified).toBe(1);

		unsubscribe();
		store.declare(topic("/other"));
		expect(notified).toBe(1);
	});

	test("the snapshot keeps its identity until the contents change", () => {
		const before = store.list();
		expect(store.list()).toBe(before);

		store.declare(topic("/cmd_vel"));
		expect(store.list()).not.toBe(before);
	});

	test("one store per manager, so every surface sees the same topics", () => {
		expect(getCreatedTopicsStore(manager)).toBe(store);
		expect(getCreatedTopicsStore(newManager())).not.toBe(store);
	});
});

describe("retained topics follow their publisher", () => {
	let manager: PluginsManager;
	let store: CreatedTopicsStore;

	beforeEach(() => {
		manager = newManager();
		store = getCreatedTopicsStore(manager);
	});

	test("a live publisher's topic is listed and released on unmount", async () => {
		const release = store.retain(topic("/cmd_vel"));
		expect((await listTopics(manager)).map((t) => t.topic)).toEqual([
			"/cmd_vel",
		]);

		release();
		expect(await listTopics(manager)).toEqual([]);
	});

	test("release is idempotent and refcounted across publishers", async () => {
		const first = store.retain(topic("/cmd_vel"));
		const second = store.retain(topic("/cmd_vel"));

		first();
		first();
		expect((await listTopics(manager)).map((t) => t.topic)).toEqual([
			"/cmd_vel",
		]);

		second();
		expect(await listTopics(manager)).toEqual([]);
	});

	test("a topic the operator created outlives the widget that used it", async () => {
		store.declare(topic("/cmd_vel"));
		const release = store.retain(topic("/cmd_vel"));

		release();
		expect((await listTopics(manager)).map((t) => t.topic)).toEqual([
			"/cmd_vel",
		]);

		store.forget(topic("/cmd_vel"));
		expect(await listTopics(manager)).toEqual([]);
	});

	test("forgetting a topic a publisher still advertises keeps it listed", async () => {
		store.declare(topic("/cmd_vel"));
		store.retain(topic("/cmd_vel"));

		expect(store.forget(topic("/cmd_vel"))).toBe(false);
		expect((await listTopics(manager)).map((t) => t.topic)).toEqual([
			"/cmd_vel",
		]);
	});

	test("dispose removes the contribution", async () => {
		store.declare(topic("/cmd_vel"));
		store.dispose();

		expect(await listTopics(manager)).toEqual([]);
	});
});

describe("forgetSource", () => {
	test("drops declared topics of the removed datasource only", () => {
		const store = getCreatedTopicsStore(newManager());
		store.declare(topic("/a", "ds-1"));
		store.declare(topic("/b", "ds-2"));

		expect(store.forgetSource("ds-1")).toBe(true);
		expect(store.list().map((entry) => entry.topic)).toEqual(["/b"]);
		store.dispose();
	});

	test("keeps a topic a live publisher is still advertising", () => {
		const store = getCreatedTopicsStore(newManager());
		const advertised = topic("/cmd_vel", "ds-1");
		store.declare(advertised);
		const release = store.retain(advertised);

		// Removing the datasource must not erase something demonstrably on the
		// wire; the publisher's own unmount is what releases it.
		store.forgetSource("ds-1");
		expect(store.list()).toHaveLength(1);

		release();
		expect(store.list()).toHaveLength(0);
		store.dispose();
	});

	test("reports no change when the datasource declared nothing", () => {
		const store = getCreatedTopicsStore(newManager());
		store.declare(topic("/a", "ds-1"));

		expect(store.forgetSource("ds-2")).toBe(false);
		store.dispose();
	});
});
