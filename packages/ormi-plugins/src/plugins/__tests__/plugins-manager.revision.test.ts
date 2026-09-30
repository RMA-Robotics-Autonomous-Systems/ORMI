/**
 * Filter registration revisions and change notification.
 *
 * A pull filter's result can only be read by applying it, so a component that
 * applies a filter during render learns about a later registration only
 * through this: the revision is its `useSyncExternalStore` snapshot and
 * `subscribeFilters` its subscription.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { PluginsManager } from "../plugins-manager";
import { Plugin } from "../plugins-types";
import {
	combinedFilterRevision,
	subscribeFilterHooks,
} from "../components/plugins-provider";

/** A filter that passes its input through. */
const identity = (value: unknown) => value;

describe("filter revisions", () => {
	let manager: PluginsManager;

	beforeEach(() => {
		manager = new PluginsManager(new Map());
	});

	test("start at 0, including hooks registered in plugin constructors", () => {
		const plugin = new Plugin({
			name: "p",
			description: "",
			version: "1",
		});
		plugin.addFilter("widgets", { id: "w", priority: 1, filter: identity });
		const seeded = new PluginsManager(new Map([["p", plugin]]));

		expect(seeded.getFilterRevision("widgets")).toBe(0);
		expect(manager.getFilterRevision("never-seen")).toBe(0);
	});

	test("grow on add and on remove, per hook", () => {
		manager.addFilter("a", { id: "f1", priority: 1, filter: identity });
		expect(manager.getFilterRevision("a")).toBe(1);
		expect(manager.getFilterRevision("b")).toBe(0);

		manager.removeFilter("f1");
		expect(manager.getFilterRevision("a")).toBe(2);
	});

	test("a remove of an unknown id changes nothing and notifies no one", () => {
		const heard: string[] = [];
		manager.subscribeFilters((hook) => heard.push(String(hook)));

		manager.removeFilter("nope");

		expect(heard).toEqual([]);
		expect(manager.getFilterRevision("a")).toBe(0);
	});

	test("listeners hear each change after it is in the index", () => {
		const seen: number[][] = [];
		manager.subscribeFilters(() => {
			seen.push(manager.applyFilter<number[]>("list", []));
		});

		manager.addFilter("list", {
			id: "push-1",
			priority: 1,
			filter: (list: number[]) => [...list, 1],
		});
		manager.removeFilter("push-1");

		expect(seen).toEqual([[1], []]);
	});

	test("an id registered under several hooks announces each hook on remove", () => {
		manager.addFilter("a", { id: "shared", priority: 1, filter: identity });
		manager.addFilter("b", { id: "shared", priority: 1, filter: identity });
		const heard: string[] = [];
		manager.subscribeFilters((hook) => heard.push(String(hook)));

		manager.removeFilter("shared");

		expect(heard.sort()).toEqual(["a", "b"]);
	});

	test("unsubscribe stops notifications, even from inside a notification", () => {
		let calls = 0;
		const unsubscribe = manager.subscribeFilters(() => {
			calls += 1;
			unsubscribe();
		});
		let otherCalls = 0;
		manager.subscribeFilters(() => {
			otherCalls += 1;
		});

		manager.addFilter("a", { id: "f1", priority: 1, filter: identity });
		manager.addFilter("a", { id: "f2", priority: 1, filter: identity });

		expect(calls).toBe(1);
		expect(otherCalls).toBe(2);
	});
});

describe("watching a set of hooks", () => {
	const WATCHED = ["widgets", "gate"] as const;

	test("the combined revision moves with any watched hook, not with others", () => {
		const manager = new PluginsManager(new Map());
		const before = combinedFilterRevision(manager, WATCHED);

		manager.addFilter("topics", { id: "t", priority: 1, filter: identity });
		expect(combinedFilterRevision(manager, WATCHED)).toBe(before);

		manager.addFilter("gate", { id: "g", priority: 1, filter: identity });
		expect(combinedFilterRevision(manager, WATCHED)).not.toBe(before);
	});

	test("the subscription fires for watched hooks only", () => {
		const manager = new PluginsManager(new Map());
		let changes = 0;
		const unsubscribe = subscribeFilterHooks(manager, WATCHED, () => {
			changes += 1;
		});

		manager.addFilter("topics", { id: "t", priority: 1, filter: identity });
		expect(changes).toBe(0);

		manager.addFilter("widgets", {
			id: "w",
			priority: 1,
			filter: identity,
		});
		manager.removeFilter("w");
		expect(changes).toBe(2);

		unsubscribe();
		manager.addFilter("gate", { id: "g", priority: 1, filter: identity });
		expect(changes).toBe(2);
	});
});
