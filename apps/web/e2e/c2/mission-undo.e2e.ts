import { expect, test, type Locator, type Page } from "@playwright/test";

import { blockExternalRequests, openMissionControl } from "./c2-page";
import { FakeC2, type FakeFeature, type Position } from "./fake-c2";

/**
 * One undo history for the mission, in a real browser.
 *
 * A mission is three working copies (the draft, the behaviour graph, the
 * map's assets) edited from two panels. Undo takes back the last thing done
 * to the mission whichever panel did it, an undo back to what was saved
 * leaves the mission clean, and Save keeps the history. The C2 is the fake.
 */

const MAP_NAME = "e2e-site";
const MISSION_ID = "e2e-mission-0001";
const MISSION_NAME = "Recon north";
/** The site's centre (a field near Brussels). */
const SITE: Position = [4.396, 50.844];

/** A library waypoint on the map, for importing into the mission. */
function gate(): FakeFeature {
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

interface Harness {
	fake: FakeC2;
	refused: string[];
}

/**
 * Seed a stored mission (no graph yet, its assets stored empty on the site
 * map), open the page with the mission browser and the node editor beside
 * the map, and open the mission.
 */
async function openMission(page: Page, baseURL: string): Promise<Harness> {
	const fake = new FakeC2();
	fake.seedMap(MAP_NAME, [gate()]);
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
function graphPanel(page: Page): Locator {
	return page
		.locator(".flexlayout__tab")
		.filter({ has: page.getByRole("group", { name: "Graph mode" }) });
}

/** A node editor toolbar button by its text. */
function nodeButton(page: Page, name: string): Locator {
	return graphPanel(page).getByRole("button", { name, exact: true });
}

/** The node editor's "unsaved" badge: its graph differs from the saved one. */
function unsavedBadge(page: Page): Locator {
	return graphPanel(page).getByText("unsaved", { exact: true });
}

/** Nodes drawn on the node editor's canvas. */
function graphNodes(page: Page): Locator {
	return graphPanel(page).locator(".react-flow__node");
}

/** Nothing reached a path the fake does not serve, nor left the machine. */
function expectNoStrayRequests({ fake, refused }: Harness): void {
	expect(
		fake.unhandled.map((r) => `${r.method} ${r.path}`),
		"C2 requests the fake does not implement",
	).toEqual([]);
	expect(refused, "requests to hosts outside the test").toEqual([]);
}

/** Every request that writes, in order. */
function writes(fake: FakeC2): string[] {
	return fake.requests
		.filter((r) => r.method !== "GET")
		.map((r) => `${r.method} ${r.path}`);
}

test.describe("C2 mission: one undo history", () => {
	test("a node added, then Undo: the mission is clean again; Redo makes it unsaved", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!);
		const undo = graphPanel(page).getByRole("button", { name: "Undo" });
		const redo = graphPanel(page).getByRole("button", { name: "Redo" });
		await expect(undo).toBeDisabled();
		await expect(unsavedBadge(page)).toBeHidden();

		await nodeButton(page, "Condition").click();
		await expect(graphNodes(page)).toHaveCount(1);
		await expect(unsavedBadge(page)).toBeVisible();
		await expect(undo).toHaveAttribute("title", "Undo: Add node (Ctrl+Z)");

		await undo.click();
		await expect(graphNodes(page)).toHaveCount(0);
		await expect(unsavedBadge(page)).toBeHidden();
		await expect(undo).toBeDisabled();
		await expect(redo).toBeEnabled();

		await redo.click();
		await expect(graphNodes(page)).toHaveCount(1);
		await expect(unsavedBadge(page)).toBeVisible();
		await expect(redo).toBeDisabled();

		expect(writes(harness.fake)).toEqual([]);
		expectNoStrayRequests(harness);
	});

	test("saved, then Undo: the mission is unsaved again, and the undo sends nothing", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!);
		await nodeButton(page, "Condition").click();
		await expect(unsavedBadge(page)).toBeVisible();

		await nodeButton(page, "Save mission").click();
		await expect(unsavedBadge(page)).toBeHidden();
		await expect
			.poll(() => harness.fake.missionDocument(`${MISSION_ID}:graph`))
			.toBeDefined();
		const written = writes(harness.fake);
		expect(written.length).toBeGreaterThan(0);
		expect(
			(
				harness.fake.missionDocument(`${MISSION_ID}:graph`)?.graph as {
					nodes: unknown[];
				}
			).nodes,
		).toHaveLength(1);

		// The history survived the save.
		const undo = graphPanel(page).getByRole("button", { name: "Undo" });
		await expect(undo).toBeEnabled();
		await undo.click();
		await expect(graphNodes(page)).toHaveCount(0);
		await expect(unsavedBadge(page)).toBeVisible();

		// Nothing was written by the undo: the stored graph keeps its node.
		await page.waitForTimeout(500);
		expect(writes(harness.fake)).toEqual(written);
		expect(
			(
				harness.fake.missionDocument(`${MISSION_ID}:graph`)?.graph as {
					nodes: unknown[];
				}
			).nodes,
		).toHaveLength(1);
		expectNoStrayRequests(harness);
	});
});
