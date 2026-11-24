import { expect, test } from "@playwright/test";

import { jumpTo, toScreen, waitForIdleMap } from "./c2-page";
import {
	MISSION_ID,
	SITE,
	SITE_ZOOM,
	expectNoStrayRequests,
	graphNodes,
	graphPanel,
	mapPanel,
	nodeButton,
	openMission,
	pressIn,
	unsavedBadge,
	writes,
} from "./mission-harness";

/**
 * One undo history for the mission, in a real browser.
 *
 * A mission is three working copies (the draft, the behaviour graph, the
 * map's assets) edited from two panels. Undo takes back the last thing done
 * to the mission whichever panel did it, an undo back to what was saved
 * leaves the mission clean, and Save keeps the history. The C2 is the fake.
 */

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

	test("an asset imported on the map, then a node added: Ctrl+Z from either panel takes the node back, then the asset", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!);
		const map = mapPanel(page);
		await map.getByRole("radio", { name: "Mission" }).click();
		await waitForIdleMap(page);
		await jumpTo(page, SITE, SITE_ZOOM);

		// Pick the library waypoint and import it.
		const [at] = await toScreen(page, [SITE]);
		await page.mouse.click(at!.x, at!.y);
		await map.getByRole("button", { name: "Import into mission" }).click();
		const mapUndo = map.getByRole("button", { name: "Undo" });
		await expect(mapUndo).toHaveAttribute(
			"title",
			"Undo: Import Gate (Ctrl+Z)",
		);

		await nodeButton(page, "Condition").click();
		await expect(graphNodes(page)).toHaveCount(1);
		// The map's Undo reaches the step the node editor took.
		await expect(mapUndo).toHaveAttribute(
			"title",
			"Undo: Add node (Ctrl+Z)",
		);

		await test.step("Ctrl+Z on the map", async () => {
			const canvas = map.locator(".maplibregl-canvas");
			await pressIn(canvas, "Control+z");
			await expect(graphNodes(page)).toHaveCount(0);
			await expect(mapUndo).toHaveAttribute(
				"title",
				"Undo: Import Gate (Ctrl+Z)",
			);
			await pressIn(canvas, "Control+z");
			await expect(mapUndo).toBeDisabled();
			await expect(
				map.getByRole("button", { name: "Redo" }),
			).toHaveAttribute("title", "Redo: Import Gate (Ctrl+Shift+Z)");
		});

		await test.step("Ctrl+Shift+Z in the node editor does both again", async () => {
			const pane = graphPanel(page).locator(".react-flow__pane");
			await pressIn(pane, "Control+Shift+z");
			await pressIn(pane, "Control+Shift+z");
			await expect(graphNodes(page)).toHaveCount(1);
			await expect(mapUndo).toHaveAttribute(
				"title",
				"Undo: Add node (Ctrl+Z)",
			);
		});

		await test.step("Ctrl+Z in the node editor", async () => {
			const pane = graphPanel(page).locator(".react-flow__pane");
			await pressIn(pane, "Control+z");
			await expect(graphNodes(page)).toHaveCount(0);
			await expect(mapUndo).toHaveAttribute(
				"title",
				"Undo: Import Gate (Ctrl+Z)",
			);
			await pressIn(pane, "Control+z");
			await expect(
				graphPanel(page).getByRole("button", { name: "Undo" }),
			).toBeDisabled();
			await expect(mapUndo).toBeDisabled();
		});

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
