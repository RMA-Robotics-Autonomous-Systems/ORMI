/**
 * The TemplatesProvider's initial load. The repo has no DOM render harness,
 * so the effect body is tested directly: the provider runs it once per mount
 * (`useEffect(..., [])`, `onLoad` read through a ref).
 */

import { describe, test, expect, spyOn } from "bun:test";

import { startTemplatesLoad } from "../load-templates";
import type { Template } from "../templates-types";

const tpl = (name: string) => ({ type: "widget", name }) as unknown as Template;

/** A setter that applies updates to a held map, like React's. */
function holder(initial: Map<string, Template> = new Map()) {
	const box = { current: initial, calls: 0 };
	const set = (
		update: (prev: Map<string, Template>) => Map<string, Template>,
	) => {
		box.calls++;
		box.current = update(box.current);
	};
	return { box, set };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("startTemplatesLoad", () => {
	test("applies the loaded templates", async () => {
		const { box, set } = holder();
		startTemplatesLoad(async () => new Map([["a", tpl("A")]]), set);
		await flush();
		expect([...box.current.keys()]).toEqual(["a"]);
	});

	test("a template added while the load was in flight survives it", async () => {
		let resolve!: (m: Map<string, Template>) => void;
		const { box, set } = holder();
		startTemplatesLoad(() => new Promise((r) => (resolve = r)), set);
		await flush();

		// Added (and saved) before the slow load answered.
		set((prev) => new Map(prev).set("new", tpl("New")));
		resolve(
			new Map([
				["old", tpl("Old")],
				["new", tpl("Stale")],
			]),
		);
		await flush();

		expect(box.current.get("old")?.name).toBe("Old");
		expect(box.current.get("new")?.name).toBe("New");
	});

	test("a failed load keeps the list and logs, without throwing", async () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		try {
			const kept = new Map([["k", tpl("Kept")]]);
			const { box, set } = holder(kept);
			startTemplatesLoad(() => Promise.reject(new Error("offline")), set);
			startTemplatesLoad(() => {
				throw new Error("sync");
			}, set);
			await flush();

			expect(box.calls).toBe(0);
			expect(box.current).toBe(kept);
			expect(error).toHaveBeenCalledTimes(2);
		} finally {
			error.mockRestore();
		}
	});

	test("a cancelled load applies nothing", async () => {
		const { box, set } = holder();
		const cancel = startTemplatesLoad(
			async () => new Map([["a", tpl("A")]]),
			set,
		);
		cancel();
		await flush();
		expect(box.calls).toBe(0);
	});
});
