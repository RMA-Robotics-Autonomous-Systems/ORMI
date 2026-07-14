/**
 * Tests for the indexed-dispatch broker (P4 Part 1).
 *
 * The derived flat index must reproduce the pre-index dispatch behaviour
 * EXACTLY. Each test below locks one of the invariants the copy-on-write index
 * has to preserve: global ascending-priority order, stable ties across plugins
 * (with the "basic" plugin last), filter threading, the `doAction` boolean
 * fan-out contract, warn-once-per-hook, in-flight snapshot correctness under
 * registration churn, and removal-by-id via the id→hooks map.
 */

import { describe, test, expect, spyOn } from "bun:test";

import { metrics } from "@workspace/utils/metrics";

import { PluginsManager } from "../plugins-manager";
import { Plugin, PluginAction, PluginFilter } from "../plugins-types";

const makeManager = () => new PluginsManager(new Map());

/**
 * Reference order: replicates the OLD dispatch's flatten (plugin-insertion →
 * inner-map-insertion order) + stable sort by ascending priority, read from the
 * manager's own source-of-truth plugin map. The indexed dispatch must match it.
 */
function referenceFilterOrder(manager: PluginsManager, hook: string): string[] {
	const filters: PluginFilter[] = [];
	manager.getPlugins().forEach((plugin) => {
		plugin.filters.get(hook)?.forEach((f) => filters.push(f));
	});
	filters.sort((a, b) => a.priority - b.priority);
	return filters.map((f) => f.id);
}

function referenceActionOrder(manager: PluginsManager, hook: string): string[] {
	const actions: PluginAction[] = [];
	manager.getPlugins().forEach((plugin) => {
		plugin.actions.get(hook)?.forEach((a) => actions.push(a));
	});
	actions.sort((a, b) => a.priority - b.priority);
	return actions.map((a) => a.id);
}

describe("Indexed dispatch - ordering parity", () => {
	test("filter order equals the reference flatten+sort across plugins, basic, and ties", () => {
		const order: string[] = [];
		const rec = (id: string) => (v: number) => {
			order.push(id);
			return v;
		};

		const p1 = new Plugin({ name: "p1", version: "1.0.0" });
		const p2 = new Plugin({ name: "p2", version: "1.0.0" });

		// Deliberate priority ties (10) across p1, p2, and basic to lock stable
		// ordering, plus spread priorities (1, 5, 20) to lock ascending order.
		p1.addFilter("h", { id: "p1-a", priority: 10, filter: rec("p1-a") });
		p1.addFilter("h", { id: "p1-b", priority: 5, filter: rec("p1-b") });
		p2.addFilter("h", { id: "p2-a", priority: 10, filter: rec("p2-a") });
		p2.addFilter("h", { id: "p2-b", priority: 20, filter: rec("p2-b") });

		const map = new Map();
		map.set("p1", p1);
		map.set("p2", p2);
		const manager = new PluginsManager(map);

		// Registered through the manager => land on the "basic" plugin (last).
		manager.addFilter("h", {
			id: "basic-a",
			priority: 10,
			filter: rec("basic-a"),
		});
		manager.addFilter("h", {
			id: "basic-b",
			priority: 1,
			filter: rec("basic-b"),
		});

		manager.applyFilter<number>("h", 0);

		// Indexed order matches the reference derived from the same state.
		expect(order).toEqual(referenceFilterOrder(manager, "h"));
		// And the concrete order: ascending priority; ties keep plugin-insertion
		// order with "basic" last.
		expect(order).toEqual([
			"basic-b",
			"p1-b",
			"p1-a",
			"p2-a",
			"basic-a",
			"p2-b",
		]);
	});

	test("action order equals the reference across plugins with equal-priority ties", () => {
		const order: string[] = [];
		const rec = (id: string) => () => order.push(id);

		const p1 = new Plugin({ name: "p1", version: "1.0.0" });
		const p2 = new Plugin({ name: "p2", version: "1.0.0" });
		p1.addAction("h", { id: "p1-x", priority: 5, action: rec("p1-x") });
		p2.addAction("h", { id: "p2-x", priority: 5, action: rec("p2-x") });

		const map = new Map();
		map.set("p1", p1);
		map.set("p2", p2);
		const manager = new PluginsManager(map);
		manager.addAction("h", {
			id: "basic-x",
			priority: 5,
			action: rec("basic-x"),
		});

		manager.doAction("h");

		expect(order).toEqual(referenceActionOrder(manager, "h"));
		// All equal priority => pure insertion order, basic last.
		expect(order).toEqual(["p1-x", "p2-x", "basic-x"]);
	});

	test("order is stable after add/remove churn (rebuild reproduces the reference)", () => {
		const order: string[] = [];
		const rec = (id: string) => (v: number) => {
			order.push(id);
			return v;
		};
		const manager = makeManager();

		manager.addFilter("h", { id: "a", priority: 10, filter: rec("a") });
		manager.addFilter("h", { id: "b", priority: 10, filter: rec("b") });
		manager.addFilter("h", { id: "c", priority: 5, filter: rec("c") });
		manager.removeFilter("b");
		manager.addFilter("h", { id: "d", priority: 10, filter: rec("d") });

		manager.applyFilter<number>("h", 0);

		expect(order).toEqual(referenceFilterOrder(manager, "h"));
		// c(5) first; then the priority-10 survivors in surviving-insertion order.
		expect(order).toEqual(["c", "a", "d"]);
	});
});

describe("Indexed dispatch - filter threading & mutation", () => {
	test("threads the accumulator through filters in priority order", () => {
		const manager = makeManager();
		manager.addFilter("h", {
			id: "add1",
			priority: 20,
			filter: (v: number) => v + 1,
		});
		manager.addFilter("h", {
			id: "mul2",
			priority: 10,
			filter: (v: number) => v * 2,
		});

		// (5 * 2) + 1 = 11
		expect(manager.applyFilter<number>("h", 5)).toBe(11);
	});

	test("preserves in-place mutation and identity", () => {
		const manager = makeManager();
		manager.addFilter("h", {
			id: "mutate",
			priority: 10,
			filter: (obj: { value: number }) => {
				obj.value = 999;
				return obj;
			},
		});

		const input = { value: 1 };
		const result = manager.applyFilter<{ value: number }>("h", input);
		expect(result).toBe(input);
		expect(result.value).toBe(999);
	});

	test("supports a type-changing chain and a null-returning filter", () => {
		const typeChange = makeManager();
		typeChange.addFilter("h", {
			id: "to-object",
			priority: 10,
			filter: (v: string) => ({ original: v, wrapped: true }),
		});
		expect(typeChange.applyFilter<any>("h", "x")).toEqual({
			original: "x",
			wrapped: true,
		});

		const nullable = makeManager();
		nullable.addFilter("h", {
			id: "to-null",
			priority: 10,
			filter: () => null,
		});
		expect(nullable.applyFilter<any>("h", "seed")).toBeNull();
	});

	test("passes extra args to each filter (threaded, not just the first)", () => {
		const manager = makeManager();
		manager.addFilter("h", {
			id: "f1",
			priority: 10,
			filter: (v: number, m: number) => v * m,
		});
		manager.addFilter("h", {
			id: "f2",
			priority: 20,
			filter: (v: number, m: number) => v + m,
		});

		// (5 * 3) + 3 = 18
		expect(manager.applyFilter<number>("h", 5, 3)).toBe(18);
	});

	test("threads async filters in priority order", async () => {
		const manager = makeManager();
		manager.addFilter("h", {
			id: "a",
			priority: 10,
			filter: async (v: number) => v + 1,
		});
		manager.addFilter("h", {
			id: "b",
			priority: 20,
			filter: async (v: number) => v * 2,
		});

		// (5 + 1) * 2 = 12
		expect(await manager.applyFilterAsync<number>("h", 5)).toBe(12);
	});
});

describe("Indexed dispatch - action fan-out & boolean contract", () => {
	test("fires every action from multiple plugins in priority order and returns true", () => {
		const log: string[] = [];
		const p1 = new Plugin({ name: "p1", version: "1.0.0" });
		p1.addAction("render", {
			id: "p1",
			priority: 10,
			action: () => log.push("p1"),
		});
		const p2 = new Plugin({ name: "p2", version: "1.0.0" });
		p2.addAction("render", {
			id: "p2",
			priority: 5,
			action: () => log.push("p2"),
		});

		const map = new Map();
		map.set("p1", p1);
		map.set("p2", p2);
		const manager = new PluginsManager(map);

		expect(manager.doAction("render")).toBe(true);
		expect(log).toEqual(["p2", "p1"]);
	});

	test("zero/absent handlers => returns false", () => {
		const manager = makeManager();
		expect(manager.doAction("nobody-home")).toBe(false);
	});

	test("a throwing action propagates and aborts the remaining handlers (today's behaviour)", () => {
		const manager = makeManager();
		const executed: number[] = [];
		manager.addAction("h", {
			id: "a1",
			priority: 5,
			action: () => executed.push(1),
		});
		manager.addAction("h", {
			id: "a2",
			priority: 10,
			action: () => {
				executed.push(2);
				throw new Error("boom");
			},
		});
		manager.addAction("h", {
			id: "a3",
			priority: 15,
			action: () => executed.push(3),
		});

		expect(() => manager.doAction("h")).toThrow("boom");
		// The throw propagates; the handler after the thrower does not run.
		expect(executed).toEqual([1, 2]);
	});
});

describe("Indexed dispatch - warn once per hook", () => {
	test("empty filter hook warns exactly once, then re-arms after a registration", () => {
		const manager = makeManager();
		const spy = spyOn(console, "warn").mockImplementation(() => {});
		try {
			for (let i = 0; i < 5; i++) manager.applyFilter<number>("empty", 1);
			expect(spy).toHaveBeenCalledTimes(1);

			// A registration clears the warned flag; removing it re-empties the hook.
			manager.addFilter("empty", {
				id: "temp",
				priority: 10,
				filter: (v: number) => v,
			});
			manager.removeFilter("temp");

			for (let i = 0; i < 5; i++) manager.applyFilter<number>("empty", 1);
			expect(spy).toHaveBeenCalledTimes(2);
		} finally {
			spy.mockRestore();
		}
	});

	test("empty action hook warns exactly once across repeated dispatches", () => {
		const manager = makeManager();
		const spy = spyOn(console, "warn").mockImplementation(() => {});
		try {
			for (let i = 0; i < 10; i++) manager.doAction("empty-action");
			expect(spy).toHaveBeenCalledTimes(1);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("Indexed dispatch - snapshot correctness under churn (critical)", () => {
	test("in-flight fan-out uses the pre-dispatch snapshot; next dispatch reflects the change", () => {
		const manager = makeManager();
		const order: string[] = [];
		let mutated = false;

		const a3: PluginAction = {
			id: "a3",
			priority: 15,
			action: () => order.push("a3"),
		};

		// a1 runs first and, during the pass, adds a3 and removes a2 on the SAME
		// hook (simulating reconnect churn re-issuing subscribe/unsubscribe).
		manager.addAction("h", {
			id: "a1",
			priority: 10,
			action: () => {
				order.push("a1");
				if (!mutated) {
					mutated = true;
					manager.addAction("h", a3);
					manager.removeAction("a2");
				}
			},
		});
		manager.addAction("h", {
			id: "a2",
			priority: 20,
			action: () => order.push("a2"),
		});

		// First pass iterates the frozen snapshot [a1, a2]: a2 still runs even
		// though a1 removed it mid-pass, and the freshly-added a3 does NOT run.
		manager.doAction("h");
		expect(order).toEqual(["a1", "a2"]);

		// Second pass sees the published change: a2 gone, a3 present.
		order.length = 0;
		manager.doAction("h");
		expect(order).toEqual(["a1", "a3"]);
	});

	test("a filter added during fan-out does not join the in-flight pass", () => {
		const manager = makeManager();
		const order: string[] = [];
		let added = false;

		manager.addFilter("h", {
			id: "f1",
			priority: 10,
			filter: (v: number) => {
				order.push("f1");
				if (!added) {
					added = true;
					manager.addFilter("h", {
						id: "f2",
						priority: 20,
						filter: (x: number) => {
							order.push("f2");
							return x;
						},
					});
				}
				return v;
			},
		});

		manager.applyFilter<number>("h", 0);
		// f2 was added mid-pass but the snapshot only had f1.
		expect(order).toEqual(["f1"]);

		order.length = 0;
		manager.applyFilter<number>("h", 0);
		// Next pass includes the published f2.
		expect(order).toEqual(["f1", "f2"]);
	});
});

describe("Indexed dispatch - removal by id", () => {
	test("removeFilter rebuilds the right hook via id→hooks; others survive", () => {
		const manager = makeManager();
		manager.addFilter("h", {
			id: "keep",
			priority: 10,
			filter: (v: number) => v + 1,
		});
		manager.addFilter("h", {
			id: "drop",
			priority: 20,
			filter: (v: number) => v * 10,
		});

		expect(manager.applyFilter<number>("h", 1)).toBe(20); // (1+1)*10

		manager.removeFilter("drop");
		expect(manager.applyFilter<number>("h", 1)).toBe(2); // only "keep"
	});

	test("removeAction rebuilds the right hook and flips the boolean to false when emptied", () => {
		const manager = makeManager();
		manager.addAction("h2", { id: "a1", priority: 10, action: () => {} });

		expect(manager.doAction("h2")).toBe(true);
		manager.removeAction("a1");
		expect(manager.doAction("h2")).toBe(false);
	});

	test("removes a filter/action that was pre-registered on a passed-in plugin (seed path)", () => {
		const plugin = new Plugin({ name: "seeded", version: "1.0.0" });
		plugin.addFilter("h", {
			id: "seed-filter",
			priority: 10,
			filter: (v: number) => v * 10,
		});
		plugin.addAction("act", {
			id: "seed-action",
			priority: 10,
			action: () => {},
		});

		const map = new Map();
		map.set("seeded", plugin);
		const manager = new PluginsManager(map);

		// Seeded registrations are live in the index.
		expect(manager.applyFilter<number>("h", 2)).toBe(20);
		expect(manager.doAction("act")).toBe(true);

		// Removing by id (no hook name) reaches into the seeded plugin's maps.
		manager.removeFilter("seed-filter");
		manager.removeAction("seed-action");

		expect(manager.applyFilter<number>("h", 2)).toBe(2); // filter gone
		expect(manager.doAction("act")).toBe(false); // action gone
	});

	test("clears an id from BOTH hooks it was registered under (multi-hook Set branch)", () => {
		const manager = makeManager();
		manager.addFilter("h1", {
			id: "dup",
			priority: 10,
			filter: (v: number) => v + 1,
		});
		manager.addFilter("h2", {
			id: "dup",
			priority: 10,
			filter: (v: number) => v + 100,
		});

		expect(manager.applyFilter<number>("h1", 0)).toBe(1);
		expect(manager.applyFilter<number>("h2", 0)).toBe(100);

		manager.removeFilter("dup");

		// Both hooks are now empty — the id was cleared from every hook it lived under.
		expect(manager.applyFilter<number>("h1", 0)).toBe(0);
		expect(manager.applyFilter<number>("h2", 0)).toBe(0);

		// Same for actions sharing one id across two hooks.
		const log: string[] = [];
		manager.addAction("a1", {
			id: "adup",
			priority: 10,
			action: () => log.push("a1"),
		});
		manager.addAction("a2", {
			id: "adup",
			priority: 10,
			action: () => log.push("a2"),
		});

		manager.removeAction("adup");
		expect(manager.doAction("a1")).toBe(false);
		expect(manager.doAction("a2")).toBe(false);
	});

	test("removing a non-existent id is a no-op", () => {
		const manager = makeManager();
		manager.addFilter("h", {
			id: "real",
			priority: 10,
			filter: (v: number) => v + 1,
		});

		expect(() => manager.removeFilter("ghost")).not.toThrow();
		expect(() => manager.removeAction("ghost")).not.toThrow();
		// The real filter is untouched.
		expect(manager.applyFilter<number>("h", 1)).toBe(2);
	});
});

describe("Indexed dispatch - metric gating", () => {
	test("records a heavy-tier sample only when metrics.heavy is on", () => {
		const manager = makeManager();
		manager.addAction("h", { id: "a", priority: 10, action: () => {} });

		const countDispatches = () => {
			const snap = metrics.snapshot();
			const idx = snap.counters.names.indexOf("broker.dispatches");
			return idx === -1 ? 0 : snap.counters.values[idx]!;
		};

		const wasHeavy = metrics.heavy;
		try {
			// Off: no extra recording.
			metrics.heavy = false;
			const before = countDispatches();
			manager.doAction("h");
			expect(countDispatches()).toBe(before);

			// On: one recorded dispatch.
			metrics.heavy = true;
			const beforeHeavy = countDispatches();
			manager.doAction("h");
			expect(countDispatches()).toBe(beforeHeavy + 1);
		} finally {
			metrics.heavy = wasHeavy;
		}
	});

	test("applyFilter records a heavy-tier sample only when metrics.heavy is on", () => {
		const manager = makeManager();
		manager.addFilter("h", {
			id: "f",
			priority: 10,
			filter: (v: number) => v,
		});

		const countDispatches = () => {
			const snap = metrics.snapshot();
			const idx = snap.counters.names.indexOf("broker.dispatches");
			return idx === -1 ? 0 : snap.counters.values[idx]!;
		};

		const wasHeavy = metrics.heavy;
		try {
			metrics.heavy = false;
			const before = countDispatches();
			manager.applyFilter<number>("h", 1);
			expect(countDispatches()).toBe(before);

			metrics.heavy = true;
			const beforeHeavy = countDispatches();
			manager.applyFilter<number>("h", 1);
			expect(countDispatches()).toBe(beforeHeavy + 1);
		} finally {
			metrics.heavy = wasHeavy;
		}
	});
});
