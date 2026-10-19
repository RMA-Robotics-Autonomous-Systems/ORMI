import { afterEach, describe, expect, it } from "bun:test";

import { createMapServersLoader } from "../map-servers-provider";
import {
	MAP_SERVERS_UNAVAILABLE,
	getMapServersState,
	setMapServersState,
	type MapServersState,
} from "../map-servers-store";
import { appStore } from "../../store";
import { mapServersAtom } from "../map-servers-store";
import { geoServer, xyzServer } from "./map-layers-fixtures";
import type { MapServerRecord } from "../model";

afterEach(() => setMapServersState(MAP_SERVERS_UNAVAILABLE));

/** A load the test resolves by hand. */
function deferred() {
	let resolve!: (value: MapServerRecord[] | null) => void;
	const promise = new Promise<MapServerRecord[] | null>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

/** Every state the atom takes, in order. */
function recordStates(): MapServersState["status"][] {
	const seen: MapServersState["status"][] = [];
	appStore.sub(mapServersAtom, () => {
		seen.push(appStore.get(mapServersAtom).status);
	});
	return seen;
}

/** A loader whose `load` reads its `onLoad` through `getOnLoad`, like the provider's ref. */
function bound(getOnLoad: () => () => Promise<MapServerRecord[] | null>) {
	const loader = createMapServersLoader();
	return {
		load: (options?: { discard?: boolean }) =>
			loader.load(getOnLoad(), options),
		cancel: loader.cancel,
	};
}

describe("createMapServersLoader", () => {
	it("settles on the loaded list", async () => {
		const loader = bound(() => async () => [xyzServer]);
		expect(await loader.load()).toBe(true);
		const state = getMapServersState();
		expect(state.status === "settled" && state.servers).toEqual([
			xyzServer,
		]);
	});

	it("a plain refresh that fails keeps the settled list", async () => {
		let next: MapServerRecord[] | null = [xyzServer];
		const loader = bound(() => async () => next);
		await loader.load();
		next = null;
		expect(await loader.load()).toBe(false);
		expect(getMapServersState().status).toBe("settled");
	});

	it("a plain refresh that throws before any list is failed", async () => {
		const loader = bound(() => async () => {
			throw new Error("network");
		});
		setMapServersState({ status: "waiting" });
		expect(await loader.load()).toBe(false);
		expect(getMapServersState().status).toBe("failed");
	});

	it("a discard refresh reads waiting first, then the new list", async () => {
		let pending = deferred();
		const loader = bound(() => () => pending.promise);
		pending.resolve([xyzServer]);
		await loader.load();

		pending = deferred();
		const seen = recordStates();
		const result = loader.load({ discard: true });
		expect(getMapServersState().status).toBe("waiting");
		pending.resolve([geoServer()]);
		expect(await result).toBe(true);
		const state = getMapServersState();
		expect(state.status === "settled" && state.servers[0]?.id).toBe("s1");
		expect(seen).toEqual(["waiting", "settled"]);
	});

	it("a discard refresh that fails is failed, never the old list", async () => {
		let next: MapServerRecord[] | null = [xyzServer];
		const loader = bound(() => async () => next);
		await loader.load();
		next = null;
		expect(await loader.load({ discard: true })).toBe(false);
		expect(getMapServersState().status).toBe("failed");
	});

	it("a later load supersedes one in flight, and cancel drops both", async () => {
		const first = deferred();
		const second = deferred();
		const queue = [first, second];
		const loader = bound(() => () => queue.shift()!.promise);
		const a = loader.load();
		const b = loader.load();
		second.resolve([geoServer()]);
		first.resolve([xyzServer]);
		expect(await a).toBe(false);
		expect(await b).toBe(true);
		const state = getMapServersState();
		expect(state.status === "settled" && state.servers[0]?.id).toBe("s1");

		const third = deferred();
		queue.push(third);
		const c = loader.load();
		loader.cancel();
		third.resolve([xyzServer]);
		expect(await c).toBe(false);
		const after = getMapServersState();
		expect(after.status === "settled" && after.servers[0]?.id).toBe("s1");
	});
});
