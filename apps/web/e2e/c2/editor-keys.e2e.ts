import { expect, test, type Locator, type Page } from "@playwright/test";

import { drag, jumpTo, renderedAt, toScreen, waitForIdleMap } from "./c2-page";
import { type FakeFeature, type Position } from "./fake-c2";
import {
	MAP_NAME,
	SITE,
	SITE_ZOOM,
	expectNoStrayRequests,
	gate,
	graphNodes,
	graphPanel,
	mapPanel,
	nodeButton,
	openMission,
	writes,
} from "./mission-harness";

/**
 * The editor's keys belong to one panel at a time, in a real browser.
 *
 * The mission map and the node editor sit side by side and both listen for
 * Delete, Escape and Ctrl+Z. A key is the panel's that holds focus (else the
 * one last pressed in): Delete with focus on the map never deletes the node
 * editor's nodes, and Ctrl+Z in the node editor never steps the map's open
 * edit. Mission items go at once, with Undo in the notice. The C2 is the fake.
 */

/** Metres to degrees at the site, rounded the way the C2 stores them. */
function offset(dxMetres: number, dyMetres: number): Position {
	const mPerDegLat = 111_320;
	const mPerDegLng = mPerDegLat * Math.cos((SITE[1] * Math.PI) / 180);
	const round = (v: number) => Math.round(v * 1e7) / 1e7;
	return [
		round(SITE[0] + dxMetres / mPerDegLng),
		round(SITE[1] + dyMetres / mPerDegLat),
	];
}

/** A five-corner site boundary about 270 m by 190 m. */
const CORNERS: Position[] = [
	offset(-120, -80),
	offset(120, -90),
	offset(140, 40),
	offset(0, 100),
	offset(-130, 60),
];

function siteBoundary(): FakeFeature {
	return {
		type: "Feature",
		properties: {
			feature_id: "e2e-geofence-0001",
			name: "Site boundary",
			feature_type: "geofence",
		},
		geometry: {
			type: "Polygon",
			coordinates: [[...CORNERS, CORNERS[0]!]],
		},
	};
}

/** The node editor's root, which takes focus for the panel. */
function graphRoot(page: Page): Locator {
	return graphPanel(page).locator('[data-editor-panel="graph"]');
}

/** The map's canvas, which takes focus for the map. */
function mapCanvas(page: Page): Locator {
	return mapPanel(page).locator(".maplibregl-canvas");
}

/** Nodes the node editor shows as selected. */
function selectedNodes(page: Page): Locator {
	return graphPanel(page).locator(".react-flow__node.selected");
}

/** The card of the shape open on the map. */
function editCard(page: Page): Locator {
	return page.getByPlaceholder("Feature name").locator("xpath=..");
}

/** A key pressed with focus on an element. */
async function pressOn(target: Locator, key: string): Promise<void> {
	await target.focus();
	await expect(target).toBeFocused();
	await target.page().keyboard.press(key);
}

/** Two Condition nodes, both selected. */
async function twoSelectedNodes(page: Page): Promise<void> {
	await nodeButton(page, "Condition").click();
	await nodeButton(page, "Condition").click();
	await expect(graphNodes(page)).toHaveCount(2);
	// Both in view, then the first added to the selection.
	await graphPanel(page).locator(".react-flow__controls-fitview").click();
	await graphNodes(page)
		.first()
		.click({ modifiers: ["Control"] });
	await expect(selectedNodes(page)).toHaveCount(2);
}

/** Whether terra-draw draws a vertex handle at a position. */
async function handleAt(page: Page, position: Position): Promise<boolean> {
	const [point] = await toScreen(page, [position]);
	return (await renderedAt(page, point!, "td-")).some(
		(hit) => hit.properties.selectionPoint === true,
	);
}

test.describe("C2 mission editor: keys belong to one panel", () => {
	test("with focus on the map, Delete leaves the node editor's selected nodes", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!);
		await twoSelectedNodes(page);

		await pressOn(mapCanvas(page), "Delete");
		await pressOn(mapCanvas(page), "Backspace");
		await page.waitForTimeout(300);
		await expect(graphNodes(page)).toHaveCount(2);
		await expect(selectedNodes(page)).toHaveCount(2);
		await expect(page.getByRole("alertdialog")).toHaveCount(0);

		expect(writes(harness.fake)).toEqual([]);
		expectNoStrayRequests(harness);
	});

	test("Delete in the node editor deletes at once, says so, and its Undo puts the nodes back", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!);
		await twoSelectedNodes(page);

		await pressOn(graphRoot(page), "Delete");
		await expect(graphNodes(page)).toHaveCount(0);
		// No question: one Undo takes it back.
		await expect(page.getByRole("alertdialog")).toHaveCount(0);
		const notice = graphPanel(page).getByRole("status", {
			name: "Deleted",
		});
		await expect(notice).toHaveText(/Deleted 2 steps/);

		await notice.getByRole("button", { name: "Undo deletion" }).click();
		await expect(graphNodes(page)).toHaveCount(2);
		await expect(notice).toBeHidden();

		await test.step("the toolbar's Delete does the same by touch", async () => {
			await graphNodes(page).first().click();
			await expect(selectedNodes(page)).toHaveCount(1);
			await graphPanel(page)
				.getByRole("button", { name: "Delete selected" })
				.click();
			await expect(graphNodes(page)).toHaveCount(1);
			await expect(notice).toHaveText(/Deleted “When”/);
		});

		await test.step("the notice goes once something else is done", async () => {
			await nodeButton(page, "Condition").click();
			await expect(graphNodes(page)).toHaveCount(2);
			await expect(notice).toBeHidden();
		});

		expect(writes(harness.fake)).toEqual([]);
		expectNoStrayRequests(harness);
	});

	test("Ctrl+Z in the node editor while a map edit is open takes back the node and leaves the edit as it was", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!, [
			gate(),
			siteBoundary(),
		]);
		await nodeButton(page, "Condition").click();
		await expect(graphNodes(page)).toHaveCount(1);

		// A stored feature open on the map, reshaped: a step of the edit's
		// own history.
		const map = mapPanel(page);
		await map
			.getByRole("radio", { name: "Map editor", exact: true })
			.click();
		// The map panel is narrower beside the node editor: one zoom out
		// keeps the whole boundary in view.
		await jumpTo(page, SITE, SITE_ZOOM - 1);
		const [inside] = await toScreen(page, [offset(-60, 40)]);
		await page.mouse.click(inside!.x, inside!.y);
		await expect(editCard(page)).toBeVisible();
		await waitForIdleMap(page);
		await expect.poll(() => handleAt(page, CORNERS[2]!)).toBe(true);
		const [from] = await toScreen(page, [CORNERS[2]!]);
		const to = { x: from!.x + 60, y: from!.y - 40 };
		await drag(page, from!, to);
		await waitForIdleMap(page);
		const cardUndo = editCard(page).getByRole("button", {
			name: "Undo",
			exact: true,
		});
		await expect(cardUndo).toBeEnabled();

		await pressOn(graphRoot(page), "Control+z");
		await expect(graphNodes(page)).toHaveCount(0);
		// The map's edit is as it was: open, reshaped, its step still there.
		await page.waitForTimeout(300);
		await expect(editCard(page)).toBeVisible();
		await expect(cardUndo).toBeEnabled();
		expect(await handleAt(page, CORNERS[2]!)).toBe(false);

		// In the map, Ctrl+Z is the edit's own.
		await pressOn(mapCanvas(page), "Control+z");
		await expect.poll(() => handleAt(page, CORNERS[2]!)).toBe(true);
		await expect(graphNodes(page)).toHaveCount(0);

		expect(
			writes(harness.fake).filter((w) => w.includes(`/maps/${MAP_NAME}`)),
		).toEqual([]);
		expectNoStrayRequests(harness);
	});

	test("Delete on a mission asset takes it out at once, and the notice's Undo brings it back", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!);
		const map = mapPanel(page);
		await map.getByRole("radio", { name: "Mission" }).click();
		await waitForIdleMap(page);
		await jumpTo(page, SITE, SITE_ZOOM);
		const [at] = await toScreen(page, [SITE]);
		await page.mouse.click(at!.x, at!.y);
		await map.getByRole("button", { name: "Import into mission" }).click();
		const mapUndo = map.getByRole("button", { name: "Undo", exact: true });
		await expect(mapUndo).toHaveAttribute(
			"title",
			"Undo: Import Gate (Ctrl+Z)",
		);

		await pressOn(mapCanvas(page), "Delete");
		await expect(page.getByRole("alertdialog")).toHaveCount(0);
		await expect(mapUndo).toHaveAttribute(
			"title",
			"Undo: Delete Gate (Ctrl+Z)",
		);
		const notice = map.getByRole("status", { name: "Deleted" });
		await expect(notice).toHaveText(/Deleted “Gate”/);
		await notice.getByRole("button", { name: "Undo deletion" }).click();
		await expect(notice).toBeHidden();
		await expect(mapUndo).toHaveAttribute(
			"title",
			"Undo: Import Gate (Ctrl+Z)",
		);

		expect(writes(harness.fake)).toEqual([]);
		expectNoStrayRequests(harness);
	});

	test("Escape in the node editor takes one step per press, and never deletes", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!);
		await nodeButton(page, "Condition").click();
		await nodeButton(page, "Condition").click();
		await expect(selectedNodes(page)).toHaveCount(1);

		// A keyboard wire from one output, then a second output: refused,
		// and the wire stays armed.
		const outputs = graphPanel(page).getByRole("button", {
			name: /output .*Enter to link/,
		});
		await pressOn(outputs.nth(0), "Enter");
		await pressOn(outputs.nth(1), "Enter");
		const refusal = graphPanel(page).getByRole("alert");
		await expect(refusal).toContainText("Both are outputs");

		await pressOn(graphRoot(page), "Escape");
		// The armed wire went first; the refusal is still said.
		await expect(refusal).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(refusal).toBeHidden();
		await expect(selectedNodes(page)).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(selectedNodes(page)).toHaveCount(0);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(200);
		await expect(graphNodes(page)).toHaveCount(2);

		expect(writes(harness.fake)).toEqual([]);
		expectNoStrayRequests(harness);
	});
});
