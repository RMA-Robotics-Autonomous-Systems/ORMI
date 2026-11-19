import { expect, type Page } from "@playwright/test";

import {
	FAKE_C2_TOKEN,
	FAKE_DB_URL,
	FAKE_MISSION_CONTROL_URL,
	type Position,
} from "./fake-c2";

/**
 * Opening the C2 Mission Control page in a known state, and reading the map.
 *
 * The page keeps its arrangement and its datasources in local storage (the
 * plugin-page rule in AGENTS.md), under the key below. Each test writes its
 * own arrangement into a fresh browser context before the page loads, so a
 * run never inherits a layout, a datasource or a C2 URL from a previous one.
 */

/** Route of the page under test. */
export const C2_PAGE_PATH = "/plugin-pages/c2-mission-control";

/**
 * The page's local-storage key. Mirrors `STORAGE_KEY` in
 * `plugins/ormi-c2-control/src/page/mission-control-page.tsx`; a bump there
 * makes the page ignore this seed and open its default layout, which the
 * specs detect (no map panel with the seeded map).
 */
export const C2_STORAGE_KEY = "ormi-c2-mission-control-v3";

/**
 * Local-storage key of the newest devlog entry read. Mirrors `STORAGE_KEY` in
 * `apps/web/components/devlogs/devlog-provider.tsx`.
 */
const DEVLOG_SEEN_KEY = "ormi:last-devlog";

/** Instance id of the seeded C2 datasource. */
export const E2E_DATASOURCE_ID = "e2e-c2-datasource";

/**
 * A raster basemap on a host that never resolves, answered with a blank tile
 * by {@link blockExternalRequests}. Keeps the run offline and deterministic.
 */
const E2E_TILE_TEMPLATE = "http://tiles-e2e.invalid/{z}/{x}/{y}.png";

/** A 1x1 transparent PNG. */
const BLANK_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
	"base64",
);

/**
 * The stored arrangement: the C2 datasource pointing at the fake, and the
 * mission map alone in one FlexLayout tabset, opened on `mapName`.
 *
 * @param mapName - The map the widget opens on (`defaultMap`).
 * @returns The value to store under {@link C2_STORAGE_KEY}.
 */
export function seededArrangement(mapName: string): string {
	const widget = {
		widget_id: "c2-mission-map-widget",
		box_id: "c2-map",
		title: "Mission Map",
		settings: {
			title: "Mission Map",
			mapUrl: E2E_TILE_TEMPLATE,
			mapLayers: [],
			defaultMap: mapName,
		},
	};
	const datasource = {
		datasource_id: "c2-control-source",
		title: "C2 (e2e fake)",
		settings: {
			id: E2E_DATASOURCE_ID,
			title: "C2 (e2e fake)",
			enable: true,
			missionControlUrl: FAKE_MISSION_CONTROL_URL,
			dbUrl: FAKE_DB_URL,
			missionControlToken: FAKE_C2_TOKEN,
		},
	};
	const flex = {
		global: {
			tabEnableClose: false,
			tabSetEnableMaximize: false,
			splitterSize: 4,
		},
		borders: [],
		layout: {
			type: "row",
			weight: 100,
			children: [
				{
					type: "tabset",
					weight: 100,
					children: [
						{
							type: "tab",
							id: "c2-map",
							name: "Mission Map",
							component: "c2-map",
							config: {},
						},
					],
				},
			],
		},
	};
	return JSON.stringify({
		layouts: { flex },
		widgets: [["c2-map", widget]],
		datasources: [[E2E_DATASOURCE_ID, datasource]],
		locked: false,
	});
}

/**
 * Answer every request that would leave the machine: the e2e basemap host
 * gets a blank tile, anything else is recorded and aborted. The C2 hosts are
 * routed by the fake, which is installed after this and so takes precedence
 * (Playwright runs the most recently registered matching route first).
 *
 * @param page - The page under test.
 * @param baseURL - The app's own origin, which is let through.
 * @returns The external URLs that were refused, for the spec to assert on.
 */
export async function blockExternalRequests(
	page: Page,
	baseURL: string,
): Promise<string[]> {
	const refused: string[] = [];
	const own = new URL(baseURL).origin;
	await page.route(
		(url) => url.origin !== own && url.protocol.startsWith("http"),
		async (route) => {
			const url = new URL(route.request().url());
			if (url.hostname === "tiles-e2e.invalid") {
				await route.fulfill({
					status: 200,
					contentType: "image/png",
					body: BLANK_PNG,
				});
				return;
			}
			refused.push(route.request().url());
			await route.abort("blockedbyclient");
		},
	);
	return refused;
}

/**
 * Seed the arrangement and open the page. The context must be fresh (one
 * per test is Playwright's default), so the seed is the only stored state.
 *
 * @param page - The page under test.
 * @param mapName - The map the widget opens on.
 */
export async function openMissionControl(
	page: Page,
	mapName: string,
): Promise<void> {
	const seed = seededArrangement(mapName);
	// The "What's new" dialog opens by itself over any page while there are
	// devlog entries this browser has not read, and a fresh context has read
	// none. Mark the newest one read, the way closing the dialog does.
	const devlogs = await page.request.get("/api/devlogs");
	expect(devlogs.ok(), "GET /api/devlogs").toBe(true);
	const latestDevlog =
		((await devlogs.json()) as { id?: string }[])[0]?.id ?? "";
	await page.addInitScript(
		([key, value, devlogKey, devlogId]) => {
			// Once per context: a reload in the same test keeps what the page
			// itself saved since.
			if (window.sessionStorage.getItem("e2e-seeded")) return;
			window.localStorage.clear();
			window.localStorage.setItem(key, value);
			if (devlogId) window.localStorage.setItem(devlogKey, devlogId);
			window.sessionStorage.setItem("e2e-seeded", "1");
		},
		[C2_STORAGE_KEY, seed, DEVLOG_SEEN_KEY, latestDevlog] as const,
	);
	await page.goto(C2_PAGE_PATH);
	await expect(page.locator(".maplibregl-map")).toBeVisible();
	await exposeMap(page);
}

/**
 * Find the MapLibre instance of the mission map and keep it on
 * `window.__e2eMap` for later `page.evaluate` calls.
 *
 * The plugin exposes no handle on its map, and needs none: react-map-gl
 * renders its container `div` (the element MapLibre marks `.maplibregl-map`)
 * with a `MapContext` provider directly inside it whose value holds the
 * `MapRef`. React DOM keeps each element's fiber on a `__reactFiber$<id>`
 * property, so the test walks from the container to that provider. This
 * leans on React DOM internals, which is acceptable in a test and nowhere
 * else; if a React upgrade moves them, this throws with a message that says
 * so rather than the specs failing on a pixel.
 *
 * @param page - The page under test.
 */
export async function exposeMap(page: Page): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const el = document.querySelector(".maplibregl-map");
					if (!el) return "no .maplibregl-map element";
					const key = Object.keys(el).find((k) =>
						k.startsWith("__reactFiber$"),
					);
					if (!key) return "no React fiber on the map container";
					type Fiber = {
						child: Fiber | null;
						sibling: Fiber | null;
						memoizedProps?: {
							value?: { map?: { getMap?: () => unknown } | null };
						};
					};
					const root = (el as unknown as Record<string, Fiber>)[key];
					const queue: Fiber[] = root?.child ? [root.child] : [];
					for (let i = 0; i < queue.length && i < 200; i++) {
						const fiber = queue[i]!;
						const ref = fiber.memoizedProps?.value?.map;
						if (ref && typeof ref.getMap === "function") {
							const map = ref.getMap() as {
								loaded(): boolean;
							};
							if (!map.loaded()) return "map not loaded yet";
							(
								window as unknown as { __e2eMap: unknown }
							).__e2eMap = map;
							return "ok";
						}
						if (fiber.child) queue.push(fiber.child);
						if (fiber.sibling) queue.push(fiber.sibling);
					}
					return "no react-map-gl MapContext under the map container";
				}),
			{ message: "the MapLibre instance of the mission map" },
		)
		.toBe("ok");
}

/**
 * Put the camera on a site, north up and flat, and wait until it is still.
 *
 * @param page - The page under test.
 * @param center - Camera centre.
 * @param zoom - Zoom level.
 */
export async function jumpTo(
	page: Page,
	center: Position,
	zoom: number,
): Promise<void> {
	await page.evaluate(
		([c, z]) => {
			const map = (
				window as unknown as {
					__e2eMap: {
						stop(): void;
						jumpTo(o: unknown): void;
					};
				}
			).__e2eMap;
			map.stop();
			map.jumpTo({ center: c, zoom: z, bearing: 0, pitch: 0 });
		},
		[center, zoom] as const,
	);
	await waitForIdleMap(page);
}

/**
 * Wait until the map is not moving and has rendered its sources.
 * @param page - The page under test.
 */
export async function waitForIdleMap(page: Page): Promise<void> {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const map = (
					window as unknown as {
						__e2eMap: {
							isMoving(): boolean;
							areTilesLoaded(): boolean;
						};
					}
				).__e2eMap;
				return !map.isMoving() && map.areTilesLoaded();
			}),
		)
		.toBe(true);
}

/**
 * Page coordinates of geographic positions, through the live map.
 *
 * @param page - The page under test.
 * @param positions - `[lng, lat]` positions.
 * @returns `{x, y}` in page CSS pixels, in the same order.
 */
export async function toScreen(
	page: Page,
	positions: Position[],
): Promise<{ x: number; y: number }[]> {
	return page.evaluate((ps) => {
		const map = (
			window as unknown as {
				__e2eMap: {
					project(p: [number, number]): { x: number; y: number };
					getContainer(): HTMLElement;
				};
			}
		).__e2eMap;
		const box = map.getContainer().getBoundingClientRect();
		return ps.map((p) => {
			const xy = map.project(p);
			return { x: box.left + xy.x, y: box.top + xy.y };
		});
	}, positions);
}

/**
 * The geographic position under a page coordinate.
 *
 * @param page - The page under test.
 * @param point - Page CSS pixels.
 * @returns `[lng, lat]`.
 */
export async function toLngLat(
	page: Page,
	point: { x: number; y: number },
): Promise<Position> {
	return page.evaluate((pt) => {
		const map = (
			window as unknown as {
				__e2eMap: {
					unproject(p: [number, number]): {
						lng: number;
						lat: number;
					};
					getContainer(): HTMLElement;
				};
			}
		).__e2eMap;
		const box = map.getContainer().getBoundingClientRect();
		const ll = map.unproject([pt.x - box.left, pt.y - box.top]);
		return [ll.lng, ll.lat] as [number, number];
	}, point);
}

/**
 * Rendered features of some layers at a page coordinate, with their
 * properties. Layers the map does not have are skipped.
 *
 * @param page - The page under test.
 * @param point - Page CSS pixels.
 * @param layerPrefix - Layer ids to query start with this.
 * @param radius - Half-size of the query box, in pixels.
 * @returns `{ layer, properties }` for each hit.
 */
export async function renderedAt(
	page: Page,
	point: { x: number; y: number },
	layerPrefix: string,
	radius = 3,
): Promise<{ layer: string; properties: Record<string, unknown> }[]> {
	return page.evaluate(
		([pt, prefix, r]) => {
			const map = (
				window as unknown as {
					__e2eMap: {
						getContainer(): HTMLElement;
						getStyle(): { layers: { id: string }[] };
						queryRenderedFeatures(
							box: [[number, number], [number, number]],
							options: { layers: string[] },
						): {
							layer: { id: string };
							properties: Record<string, unknown>;
						}[];
					};
				}
			).__e2eMap;
			const box = map.getContainer().getBoundingClientRect();
			const x = pt.x - box.left;
			const y = pt.y - box.top;
			const layers = map
				.getStyle()
				.layers.map((l) => l.id)
				.filter((id) => id.startsWith(prefix));
			if (layers.length === 0) return [];
			return map
				.queryRenderedFeatures(
					[
						[x - r, y - r],
						[x + r, y + r],
					],
					{ layers },
				)
				.map((f) => ({ layer: f.layer.id, properties: f.properties }));
		},
		[point, layerPrefix, radius] as const,
	);
}

/**
 * Whether the map's style currently has a layer.
 * @param page - The page under test.
 * @param id - Layer id.
 * @returns True when the layer is in the style.
 */
export async function hasLayer(page: Page, id: string): Promise<boolean> {
	return page.evaluate(
		(layerId) =>
			Boolean(
				(
					window as unknown as {
						__e2eMap: { getLayer(id: string): unknown };
					}
				).__e2eMap.getLayer(layerId),
			),
		id,
	);
}

/**
 * Drag with the mouse in small steps, as an operator does.
 * @param page - The page under test.
 * @param from - Page CSS pixels to press at.
 * @param to - Page CSS pixels to release at.
 */
export async function drag(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
): Promise<void> {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 2, from.y + 2, { steps: 2 });
	await page.mouse.move(to.x, to.y, { steps: 12 });
	await page.mouse.up();
}
