import { expect, test, type Page } from "@playwright/test";

import { jumpTo, renderedAt, toScreen, waitForIdleMap } from "./c2-page";
import { type FakeFeature } from "./fake-c2";
import {
	SITE,
	SITE_ZOOM,
	expectNoStrayRequests,
	gate,
	graphNodes,
	graphPanel,
	mapPanel,
	openMission,
	writes,
} from "./mission-harness";

/**
 * One selection across the mission's panels, in a real browser.
 *
 * Picking in one panel outlines what it relates to in the other (the asset a
 * node targets, the nodes that target an asset) without selecting anything
 * there and without moving either view. The C2 is the fake.
 */

const ASSET_ID = "e2e-asset-gate";

/** The Gate, as one of the mission's own assets. */
function gateAsset(): FakeFeature {
	const feature = gate();
	return {
		...feature,
		properties: { ...feature.properties, feature_id: ASSET_ID },
	};
}

/** A Navigate to the Gate, and a condition that targets nothing. */
const GRAPH = {
	nodes: [
		{
			id: "nav-gate",
			kind: "action",
			action: "NAVIGATE",
			label: "To the gate",
			feature_id: ASSET_ID,
			position: { x: 0, y: 0 },
		},
		{
			id: "cond-free",
			kind: "condition",
			label: "When",
			position: { x: 0, y: 220 },
		},
	],
	edges: [],
};

/** Where the map's camera is. */
async function mapCamera(page: Page): Promise<string> {
	return page.evaluate(() => {
		const map = (
			window as unknown as {
				__e2eMap: {
					getCenter(): { lng: number; lat: number };
					getZoom(): number;
				};
			}
		).__e2eMap;
		const c = map.getCenter();
		return `${c.lng.toFixed(7)},${c.lat.toFixed(7)},${map.getZoom().toFixed(3)}`;
	});
}

/** Where the node editor's view is: `[x, y, zoom]`. */
async function graphView(page: Page): Promise<[number, number, number]> {
	const style =
		(await graphPanel(page)
			.locator(".react-flow__viewport")
			.getAttribute("style")) ?? "";
	const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(
		style,
	);
	expect(m, `the viewport transform in "${style}"`).not.toBeNull();
	return [Number(m![1]), Number(m![2]), Number(m![3])];
}

/** The node editor's view once it has stopped moving. */
async function stillGraphView(page: Page): Promise<[number, number, number]> {
	let last = await graphView(page);
	await expect
		.poll(async () => {
			await page.waitForTimeout(250);
			const now = await graphView(page);
			const still = now.every((v, i) => v === last[i]);
			last = now;
			return still;
		})
		.toBe(true);
	return last;
}

/**
 * The view has not been moved to anything. A reveal centres a node at zoom
 * 1.1; both are held to a pixel and a percent of where they were.
 */
function expectSameView(
	before: [number, number, number],
	after: [number, number, number],
): void {
	expect(Math.abs(after[0] - before[0])).toBeLessThan(2);
	expect(Math.abs(after[1] - before[1])).toBeLessThan(2);
	expect(Math.abs(after[2] / before[2] - 1)).toBeLessThan(0.01);
}

/** Whether the map outlines the Gate as related. */
async function gateOutlined(page: Page): Promise<boolean> {
	const [at] = await toScreen(page, [SITE]);
	return (await renderedAt(page, at!, "c2-related-", 14)).some(
		(hit) => hit.properties.feature_id === ASSET_ID,
	);
}

test.describe("C2 mission editor: one selection, related items outlined", () => {
	test("a node selected outlines its asset on the map, and an asset picked outlines its nodes, with no camera move", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!, [], {
			assets: [gateAsset()],
			graph: GRAPH,
		});
		const map = mapPanel(page);
		await map.getByRole("radio", { name: "Mission" }).click();
		await waitForIdleMap(page);
		await jumpTo(page, SITE, SITE_ZOOM);
		await expect(graphNodes(page)).toHaveCount(2);
		await graphPanel(page).locator(".react-flow__controls-fitview").click();
		await page.waitForTimeout(500);

		await test.step("a node selected: its asset outlined on the map", async () => {
			const camera = await mapCamera(page);
			// On the kind caption, clear of the legend over the top-left.
			await graphNodes(page)
				.filter({ hasText: "To the gate" })
				.getByText("NAVIGATE", { exact: true })
				.click();
			await expect(
				graphPanel(page).locator(".react-flow__node.selected"),
			).toHaveCount(1);
			await expect.poll(() => gateOutlined(page)).toBe(true);
			await waitForIdleMap(page);
			expect(await mapCamera(page)).toBe(camera);
		});

		await test.step("a node with no target: nothing outlined", async () => {
			await graphNodes(page)
				.filter({ hasText: "When" })
				.getByText("When", { exact: true })
				.click();
			await expect.poll(() => gateOutlined(page)).toBe(false);
		});

		await test.step("the asset picked on the map: its node outlined, nothing selected there", async () => {
			// A node selected is panned into view when the details panel
			// covers it: start from where that left the view.
			const view = await stillGraphView(page);
			const [at] = await toScreen(page, [SITE]);
			await page.mouse.click(at!.x, at!.y);
			const related = graphPanel(page).locator(
				".react-flow__node.c2-related",
			);
			await expect(related).toHaveCount(1);
			await expect(related).toContainText("To the gate");
			// The pick is the map's: the node editor lets go of its own.
			await expect(
				graphPanel(page).locator(".react-flow__node.selected"),
			).toHaveCount(0);
			// The map does not outline its own pick as related.
			expect(await gateOutlined(page)).toBe(false);
			expectSameView(view, await stillGraphView(page));
		});

		expect(writes(harness.fake)).toEqual([]);
		expectNoStrayRequests(harness);
	});
});
