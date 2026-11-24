import { expect, type Locator, type Page } from "@playwright/test";

import { blockExternalRequests, openMissionControl } from "./c2-page";
import { FakeC2, type FakeFeature, type Position } from "./fake-c2";

/**
 * A stored mission open in the mission browser, beside the mission map and
 * the node editor: what the specs of the mission's own editing share (its
 * undo history, its keys, its selection). The C2 is the fake.
 */

export const MAP_NAME = "e2e-site";
export const MISSION_ID = "e2e-mission-0001";
export const MISSION_NAME = "Recon north";
/** The site's centre (a field near Brussels). */
export const SITE: Position = [4.396, 50.844];
export const SITE_ZOOM = 17.5;

/** A library waypoint on the map, for importing into the mission. */
export function gate(): FakeFeature {
	return {
		type: "Feature",
		properties: {
			feature_id: "e2e-waypoint-gate",
			name: "Gate",
			feature_type: "waypoint",
		},
		geometry: { type: "Point", coordinates: SITE },
	};
}

export interface Harness {
	fake: FakeC2;
	refused: string[];
}

/**
 * Seed a stored mission (no graph yet, its assets stored empty on the site
 * map), open the page with the mission browser and the node editor beside
 * the map, and open the mission.
 *
 * @param page - The page under test.
 * @param baseURL - The app's origin.
 * @param features - The site map's features; the Gate waypoint by default.
 */
export async function openMission(
	page: Page,
	baseURL: string,
	features: FakeFeature[] = [gate()],
): Promise<Harness> {
	const fake = new FakeC2();
	fake.seedMap(MAP_NAME, features);
	fake.seedMissionDocument({
		mission_id: MISSION_ID,
		name: MISSION_NAME,
		behavior: 0,
		objective: { geometries: [] },
		vehicles: [],
	});
	fake.seedMissionDocument({
		mission_id: `${MISSION_ID}:assets`,
		kind: "ormi-mission-assets",
		mission_ref: MISSION_ID,
		map: MAP_NAME,
		features: [],
		updated_at: "2026-11-24T00:00:00.000Z",
	});
	const refused = await blockExternalRequests(page, baseURL);
	await fake.install(page);
	await openMissionControl(page, MAP_NAME, { graph: true });

	await page
		.getByRole("list", { name: "Missions" })
		.getByRole("button", { name: MISSION_NAME, exact: true })
		.click();
	// The node editor has loaded the mission: its tools are there.
	await expect(nodeButton(page, "Condition")).toBeEnabled();
	return { fake, refused };
}

/** The node editor's panel. */
export function graphPanel(page: Page): Locator {
	return page
		.locator(".flexlayout__tab")
		.filter({ has: page.getByRole("group", { name: "Graph mode" }) });
}

/** The mission map's panel. */
export function mapPanel(page: Page): Locator {
	return page
		.locator(".flexlayout__tab")
		.filter({ has: page.getByRole("group", { name: "Map context" }) });
}

/** A node editor toolbar button by its text. */
export function nodeButton(page: Page, name: string): Locator {
	return graphPanel(page).getByRole("button", { name, exact: true });
}

/** The node editor's "unsaved" badge: its graph differs from the saved one. */
export function unsavedBadge(page: Page): Locator {
	return graphPanel(page).getByText("unsaved", { exact: true });
}

/** Nodes drawn on the node editor's canvas. */
export function graphNodes(page: Page): Locator {
	return graphPanel(page).locator(".react-flow__node");
}

/** Press a key with focus on an element inside a panel. */
export async function pressIn(target: Locator, key: string): Promise<void> {
	await target.focus();
	await target.press(key);
}

/** Nothing reached a path the fake does not serve, nor left the machine. */
export function expectNoStrayRequests({ fake, refused }: Harness): void {
	expect(
		fake.unhandled.map((r) => `${r.method} ${r.path}`),
		"C2 requests the fake does not implement",
	).toEqual([]);
	expect(refused, "requests to hosts outside the test").toEqual([]);
}

/** Every request that writes, in order. */
export function writes(fake: FakeC2): string[] {
	return fake.requests
		.filter((r) => r.method !== "GET")
		.map((r) => `${r.method} ${r.path}`);
}
