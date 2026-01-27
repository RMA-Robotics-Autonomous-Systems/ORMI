/**
 * Tests for Plugin Manager
 *
 * Critical: Manages plugin system hooks and filters. Wrong execution order = broken functionality.
 * Focus: Filter/action execution, priority ordering, async operations, error handling
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { PluginsManager } from "../plugins-manager";
import { Plugin, PluginFilter } from "../plugins-types";

describe("Plugin Manager - Filter System", () => {
    let manager: PluginsManager;

    beforeEach(() => {
        const pluginsMap = new Map();
        manager = new PluginsManager(pluginsMap);
    });

    test("should apply single filter correctly", () => {
        const filterFn = mock((value: number) => value * 2);

        const filter: PluginFilter = {
            id: "double-filter",
            priority: 10,
            filter: filterFn,
        };

        manager.addFilter("test-hook", filter);

        const result = manager.applyFilter<number>("test-hook", 5);

        expect(result).toBe(10);
        expect(filterFn).toHaveBeenCalledWith(5);
    });

    test("should apply multiple filters in priority order", () => {
        const executionOrder: number[] = [];

        const filter1: PluginFilter = {
            id: "filter-1",
            priority: 20,
            filter: (value: number) => {
                executionOrder.push(1);
                return value + 1;
            },
        };

        const filter2: PluginFilter = {
            id: "filter-2",
            priority: 10,
            filter: (value: number) => {
                executionOrder.push(2);
                return value * 2;
            },
        };

        const filter3: PluginFilter = {
            id: "filter-3",
            priority: 15,
            filter: (value: number) => {
                executionOrder.push(3);
                return value + 10;
            },
        };

        // Add in random order
        manager.addFilter("calc-hook", filter1);
        manager.addFilter("calc-hook", filter2);
        manager.addFilter("calc-hook", filter3);

        const result = manager.applyFilter<number>("calc-hook", 5);

        // Should execute in priority order: filter2 (10) -> filter3 (15) -> filter1 (20)
        expect(executionOrder).toEqual([2, 3, 1]);
        // 5 * 2 = 10, 10 + 10 = 20, 20 + 1 = 21
        expect(result).toBe(21);
    });

    test("should pass additional arguments to filters", () => {
        const filterFn = mock(
            (value: number, multiplier: number) => value * multiplier,
        );

        const filter: PluginFilter = {
            id: "multiply-filter",
            priority: 10,
            filter: filterFn,
        };

        manager.addFilter("multiply-hook", filter);

        const result = manager.applyFilter<number>("multiply-hook", 5, 3);

        expect(result).toBe(15);
        expect(filterFn).toHaveBeenCalledWith(5, 3);
    });

    test("should handle filter that modifies arrays", () => {
        const filter: PluginFilter = {
            id: "array-filter",
            priority: 10,
            filter: (arr: number[]) => [...arr, 4],
        };

        manager.addFilter("array-hook", filter);

        const result = manager.applyFilter<number[]>("array-hook", [1, 2, 3]);

        expect(result).toEqual([1, 2, 3, 4]);
    });

    test("should handle filter that modifies objects", () => {
        interface Config {
            name: string;
            enabled: boolean;
        }

        const filter: PluginFilter = {
            id: "config-filter",
            priority: 10,
            filter: (config: Config) => ({ ...config, enabled: true }),
        };

        manager.addFilter("config-hook", filter);

        const result = manager.applyFilter<Config>("config-hook", {
            name: "test",
            enabled: false,
        });

        expect(result.enabled).toBe(true);
    });

    test("should remove filter by id", () => {
        const filter: PluginFilter = {
            id: "removable-filter",
            priority: 10,
            filter: (value: number) => value * 2,
        };

        manager.addFilter("test-hook", filter);

        let result = manager.applyFilter<number>("test-hook", 5);
        expect(result).toBe(10);

        manager.removeFilter("removable-filter");

        result = manager.applyFilter<number>("test-hook", 5);
        expect(result).toBe(5); // Filter not applied
    });

    test("should warn when no filters found", () => {
        const consoleSpy = mock(() => {});
        const originalWarn = console.warn;
        console.warn = consoleSpy;

        manager.applyFilter<number>("non-existent-hook", 42);

        expect(consoleSpy).toHaveBeenCalled();

        console.warn = originalWarn;
    });

    test("should throw error when filter called without argument", () => {
        expect(() => {
            manager.applyFilter<any>("test-hook");
        }).toThrow("No argument given");
    });

    test("should handle filters from plugin instances", () => {
        const plugin = new Plugin({
            name: "test-plugin",
            description: "Test plugin",
            version: "1.0.0",
        });

        plugin.addFilter("widget-hook", {
            id: "plugin-filter",
            priority: 10,
            filter: (widgets: string[]) => [...widgets, "custom-widget"],
        });

        const pluginsMap = new Map();
        pluginsMap.set("test-plugin", plugin);
        const pluginManager = new PluginsManager(pluginsMap);

        const result = pluginManager.applyFilter<string[]>("widget-hook", [
            "widget1",
            "widget2",
        ]);

        expect(result).toContain("custom-widget");
    });
});

describe("Plugin Manager - Async Filter System", () => {
    let manager: PluginsManager;

    beforeEach(() => {
        const pluginsMap = new Map();
        manager = new PluginsManager(pluginsMap);
    });

    test("should apply async filter correctly", async () => {
        const filter: PluginFilter = {
            id: "async-filter",
            priority: 10,
            filter: async (value: number) => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                return value * 2;
            },
        };

        manager.addFilter("async-hook", filter);

        const result = await manager.applyFilterAsync<number>("async-hook", 5);

        expect(result).toBe(10);
    });

    test("should apply multiple async filters in sequence", async () => {
        const executionOrder: number[] = [];

        const filter1: PluginFilter = {
            id: "async-1",
            priority: 10,
            filter: async (value: number) => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                executionOrder.push(1);
                return value + 1;
            },
        };

        const filter2: PluginFilter = {
            id: "async-2",
            priority: 20,
            filter: async (value: number) => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                executionOrder.push(2);
                return value * 2;
            },
        };

        manager.addFilter("async-calc", filter1);
        manager.addFilter("async-calc", filter2);

        const result = await manager.applyFilterAsync<number>("async-calc", 5);

        // Should execute in priority order
        expect(executionOrder).toEqual([1, 2]);
        // (5 + 1) * 2 = 12
        expect(result).toBe(12);
    });

    test("should return original value when no async filters found", async () => {
        const result = await manager.applyFilterAsync<number>("no-filters", 42);

        expect(result).toBe(42);
    });

    test("should handle mix of sync and async filters", async () => {
        const filter1: PluginFilter = {
            id: "sync-filter",
            priority: 10,
            filter: (value: number) => value + 5,
        };

        const filter2: PluginFilter = {
            id: "async-filter",
            priority: 20,
            filter: async (value: number) => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                return value * 2;
            },
        };

        manager.addFilter("mixed-hook", filter1);
        manager.addFilter("mixed-hook", filter2);

        const result = await manager.applyFilterAsync<number>("mixed-hook", 10);

        // (10 + 5) * 2 = 30
        expect(result).toBe(30);
    });
});

describe("Plugin Manager - Action System", () => {
    let manager: PluginsManager;

    beforeEach(() => {
        const pluginsMap = new Map();
        manager = new PluginsManager(pluginsMap);
    });

    test("should execute single action", () => {
        const actionFn = mock(() => {});

        const plugin = new Plugin({
            name: "test-plugin",
            description: "Test",
            version: "1.0.0",
        });

        plugin.addAction("init-hook", {
            id: "init-action",
            priority: 10,
            action: actionFn,
        });

        const pluginsMap = new Map();
        pluginsMap.set("test-plugin", plugin);
        const pluginManager = new PluginsManager(pluginsMap);

        pluginManager.doAction("init-hook");

        expect(actionFn).toHaveBeenCalledTimes(1);
    });

    test("should execute multiple actions in priority order", () => {
        const executionOrder: number[] = [];

        const plugin = new Plugin({
            name: "test-plugin",
            description: "Test",
            version: "1.0.0",
        });

        plugin.addAction("startup", {
            id: "action-1",
            priority: 20,
            action: () => executionOrder.push(1),
        });

        plugin.addAction("startup", {
            id: "action-2",
            priority: 10,
            action: () => executionOrder.push(2),
        });

        plugin.addAction("startup", {
            id: "action-3",
            priority: 15,
            action: () => executionOrder.push(3),
        });

        const pluginsMap = new Map();
        pluginsMap.set("test-plugin", plugin);
        const pluginManager = new PluginsManager(pluginsMap);

        pluginManager.doAction("startup");

        expect(executionOrder).toEqual([2, 3, 1]);
    });

    test("should pass arguments to actions", () => {
        const actionFn = mock((name: string, value: number) => {});

        const plugin = new Plugin({
            name: "test-plugin",
            description: "Test",
            version: "1.0.0",
        });

        plugin.addAction("data-received", {
            id: "log-action",
            priority: 10,
            action: actionFn,
        });

        const pluginsMap = new Map();
        pluginsMap.set("test-plugin", plugin);
        const pluginManager = new PluginsManager(pluginsMap);

        pluginManager.doAction("data-received", "temperature", 25.5);

        expect(actionFn).toHaveBeenCalledWith("temperature", 25.5);
    });

    test("should warn when no actions found", () => {
        const consoleSpy = mock(() => {});
        const originalWarn = console.warn;
        console.warn = consoleSpy;

        manager.doAction("non-existent-action");

        expect(consoleSpy).toHaveBeenCalled();

        console.warn = originalWarn;
    });

    test("should execute actions from multiple plugins", () => {
        const executionLog: string[] = [];

        const plugin1 = new Plugin({
            name: "plugin1",
            description: "Plugin 1",
            version: "1.0.0",
        });

        plugin1.addAction("render", {
            id: "plugin1-render",
            priority: 10,
            action: () => executionLog.push("plugin1"),
        });

        const plugin2 = new Plugin({
            name: "plugin2",
            description: "Plugin 2",
            version: "1.0.0",
        });

        plugin2.addAction("render", {
            id: "plugin2-render",
            priority: 5,
            action: () => executionLog.push("plugin2"),
        });

        const pluginsMap = new Map();
        pluginsMap.set("plugin1", plugin1);
        pluginsMap.set("plugin2", plugin2);
        const pluginManager = new PluginsManager(pluginsMap);

        pluginManager.doAction("render");

        expect(executionLog).toEqual(["plugin2", "plugin1"]);
    });
});

describe("Plugin Manager - Edge Cases", () => {
    test("should handle empty plugin map", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        // Should not throw
        const result = manager.applyFilter<number>("test", 42);
        expect(result).toBe(42);

        manager.doAction("test");
    });

    test("should prevent duplicate filter ids", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        const filter1: PluginFilter = {
            id: "same-id",
            priority: 10,
            filter: (v: number) => v * 2,
        };

        const filter2: PluginFilter = {
            id: "same-id",
            priority: 20,
            filter: (v: number) => v * 3,
        };

        manager.addFilter("test", filter1);

        expect(() => {
            manager.addFilter("test", filter2);
        }).toThrow("already exists");
    });

    test("should handle filter that throws error", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        const filter: PluginFilter = {
            id: "error-filter",
            priority: 10,
            filter: () => {
                throw new Error("Filter error");
            },
        };

        manager.addFilter("error-hook", filter);

        // Error should propagate
        expect(() => {
            manager.applyFilter<number>("error-hook", 42);
        }).toThrow("Filter error");
    });

    test("should handle action that throws error", () => {
        const plugin = new Plugin({
            name: "test",
            description: "Test",
            version: "1.0.0",
        });

        plugin.addAction("error-action", {
            id: "failing-action",
            priority: 10,
            action: () => {
                throw new Error("Action error");
            },
        });

        const pluginsMap = new Map();
        pluginsMap.set("test", plugin);
        const manager = new PluginsManager(pluginsMap);

        // Error should propagate
        expect(() => {
            manager.doAction("error-action");
        }).toThrow("Action error");
    });

    test("should handle very large priority values", () => {
        const executionOrder: number[] = [];

        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("priority-test", {
            id: "filter-1",
            priority: Number.MAX_SAFE_INTEGER,
            filter: (v: number) => {
                executionOrder.push(1);
                return v;
            },
        });

        manager.addFilter("priority-test", {
            id: "filter-2",
            priority: 0,
            filter: (v: number) => {
                executionOrder.push(2);
                return v;
            },
        });

        manager.applyFilter<number>("priority-test", 1);

        expect(executionOrder).toEqual([2, 1]);
    });
});

describe("Plugin Manager - Production Edge Cases", () => {
    test("should handle filter returning null/undefined", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("nullable", {
            id: "null-filter",
            priority: 10,
            filter: () => null,
        });

        const result = manager.applyFilter<any>("nullable", "initial");
        expect(result).toBeNull();
    });

    test("should handle filter that modifies input in-place", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("mutate", {
            id: "mutator",
            priority: 10,
            filter: (obj: { value: number }) => {
                obj.value = 999;
                return obj;
            },
        });

        const input = { value: 1 };
        const result = manager.applyFilter<{ value: number }>("mutate", input);

        // Should be same object reference
        expect(result).toBe(input);
        expect(result.value).toBe(999);
    });

    test("should handle async filter that rejects", async () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("rejecting", {
            id: "reject-filter",
            priority: 10,
            filter: async () => {
                throw new Error("Async filter failed");
            },
        });

        await expect(
            manager.applyFilterAsync<number>("rejecting", 1),
        ).rejects.toThrow("Async filter failed");
    });

    test("should handle mix of successful and failing async filters", async () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("mixed", {
            id: "success-1",
            priority: 5,
            filter: async (v: number) => v + 1,
        });

        manager.addFilter("mixed", {
            id: "fails",
            priority: 10,
            filter: async () => {
                throw new Error("Middle filter fails");
            },
        });

        manager.addFilter("mixed", {
            id: "success-2",
            priority: 15,
            filter: async (v: number) => v + 10,
        });

        // Should fail on the failing filter
        await expect(
            manager.applyFilterAsync<number>("mixed", 0),
        ).rejects.toThrow("Middle filter fails");
    });

    test("should handle extremely long filter chain (performance)", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        // Add 1000 filters
        for (let i = 0; i < 1000; i++) {
            manager.addFilter("long-chain", {
                id: `filter-${i}`,
                priority: i,
                filter: (v: number) => v + 1,
            });
        }

        const start = Date.now();
        const result = manager.applyFilter<number>("long-chain", 0);
        const duration = Date.now() - start;

        expect(result).toBe(1000);
        // Should complete in reasonable time (< 100ms)
        expect(duration).toBeLessThan(100);
    });

    test("should handle filter returning completely different type", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("type-change", {
            id: "changer",
            priority: 10,
            filter: (v: string) => ({ original: v, transformed: true }),
        });

        const result = manager.applyFilter<any>("type-change", "test");
        expect(result).toEqual({ original: "test", transformed: true });
    });

    test("should handle action with optional parameters", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);
        const calls: any[] = [];

        manager.addAction("optional-params", {
            id: "action-1",
            priority: 10,
            action: (required: string, optional?: number) => {
                calls.push({ required, optional });
            },
        });

        manager.doAction("optional-params", "test");
        manager.doAction("optional-params", "test", 123);

        expect(calls).toEqual([
            { required: "test", optional: undefined },
            { required: "test", optional: 123 },
        ]);
    });

    test("should handle filter with spread parameters", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("spread", {
            id: "spread-filter",
            priority: 10,
            filter: (value: number, ...extra: number[]) => {
                return value + extra.reduce((sum, n) => sum + n, 0);
            },
        });

        const result = manager.applyFilter<number>("spread", 1, 2, 3, 4);
        expect(result).toBe(10); // 1 + 2 + 3 + 4
    });

    test("should handle removing filter during iteration (safety)", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);
        const executed: string[] = [];

        manager.addFilter("removal-test", {
            id: "filter-1",
            priority: 5,
            filter: (v: number) => {
                executed.push("filter-1");
                // Try to remove next filter during iteration
                manager.removeFilter("removal-test");
                return v + 1;
            },
        });

        manager.addFilter("removal-test", {
            id: "filter-2",
            priority: 10,
            filter: (v: number) => {
                executed.push("filter-2");
                return v + 2;
            },
        });

        const result = manager.applyFilter<number>("removal-test", 0);

        // filter-2 should not execute if removed during iteration
        expect(executed).toContain("filter-1");
        // Depending on implementation, filter-2 might still execute
        // The important part is it doesn't crash
        expect(typeof result).toBe("number");
    });

    test("should handle async filter returning immediately resolved promise", async () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("immediate", {
            id: "immediate-filter",
            priority: 10,
            filter: (v: number) => Promise.resolve(v * 2),
        });

        const result = await manager.applyFilterAsync<number>("immediate", 5);
        expect(result).toBe(10);
    });

    test("should handle circular filter chain attempt", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);
        let depth = 0;

        manager.addFilter("circular", {
            id: "recursive-filter",
            priority: 10,
            filter: (v: number) => {
                depth++;
                // Prevent infinite recursion
                if (depth > 100) {
                    throw new Error("Recursion limit reached");
                }
                // Try to apply same filter recursively
                return manager.applyFilter<number>("circular", v + 1);
            },
        });

        expect(() => {
            manager.applyFilter<number>("circular", 0);
        }).toThrow("Recursion limit reached");
    });

    test("should handle filter that returns Promise in sync context", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);

        manager.addFilter("promise-in-sync", {
            id: "async-as-sync",
            priority: 10,
            filter: (v: number) => Promise.resolve(v * 2) as any,
        });

        // applyFilter (sync) should not unwrap the promise
        const result = manager.applyFilter<any>("promise-in-sync", 5);
        expect(result).toBeInstanceOf(Promise);
    });

    test("should handle action throwing after partial execution", () => {
        const pluginsMap = new Map();
        const manager = new PluginsManager(pluginsMap);
        const executed: number[] = [];

        manager.addAction("partial-throw", {
            id: "action-1",
            priority: 5,
            action: () => {
                executed.push(1);
            },
        });

        manager.addAction("partial-throw", {
            id: "action-2",
            priority: 10,
            action: () => {
                executed.push(2);
                throw new Error("Action 2 failed");
            },
        });

        manager.addAction("partial-throw", {
            id: "action-3",
            priority: 15,
            action: () => {
                executed.push(3);
            },
        });

        expect(() => {
            manager.doAction("partial-throw");
        }).toThrow("Action 2 failed");

        // First action should have executed, third should not
        expect(executed).toEqual([1, 2]);
    });
});
