import { expect, test, type Locator, type Page } from "@playwright/test";

import {
	blockExternalRequests,
	jumpTo,
	openMissionControl,
	renderedAt,
	toScreen,
	waitForIdleMap,
} from "./c2-page";
import {
	MAP_NAME,
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
import { FakeC2 } from "./fake-c2";

/**
 * Route-level editing, in a real browser: an error leads to its step and
 * names the value it is about, and the map's legend names the robot lines.
 * The C2 is the fake.
 *
 * The C2's own failure reports (PLANNED_FAILED / FAILED) arrive on the
 * `/multi_robot/mission_feedback` ROS topic, not over the REST API the fake
 * serves, so their mapping to steps is covered by the unit tests
 * (`step-issues.test.ts`), not here.
 */

const GATE_ID = gate().properties.feature_id;

/**
 * Alpha navigates to the Gate, a waypoint of the site map that is not one of
 * the mission's assets: the one thing blocking Submit.
 */
const GRAPH = {
	nodes: [
		{
			id: "agent-alpha",
			kind: "agent",
			label: "Alpha",
			agent_id: "alpha",
			position: { x: 0, y: 0 },
		},
		{
			id: "nav-gate",
			kind: "action",
			action: "NAVIGATE",
			label: "To the gate",
			feature_id: GATE_ID,
			position: { x: 320, y: 0 },
		},
	],
	edges: [
		{
			id: "e-alpha-gate",
			source: "agent-alpha",
			source_port: "agent",
			target: "nav-gate",
			target_port: "agent",
		},
	],
};

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

/** Whether the map outlines the Gate as related to the selection. */
async function gateOutlined(page: Page): Promise<boolean> {
	const [at] = await toScreen(page, [SITE]);
	return (await renderedAt(page, at!, "c2-related-", 14)).some(
		(hit) => hit.properties.feature_id === GATE_ID,
	);
}

/** Whether two boxes share any area. */
function overlaps(
	a: { x: number; y: number; width: number; height: number },
	b: { x: number; y: number; width: number; height: number },
): boolean {
	return (
		a.x < b.x + b.width &&
		b.x < a.x + a.width &&
		a.y < b.y + b.height &&
		b.y < a.y + a.height
	);
}

/** A locator's box, which must be on screen. */
async function boxOf(locator: Locator) {
	const box = await locator.boundingBox();
	expect(box, "an element on screen").not.toBeNull();
	return box!;
}

test.describe("C2 route-level editing: errors lead to their step", () => {
	test("a Submit blocker names its value, and a click selects and reveals its node and outlines its target on the map", async ({
		page,
		baseURL,
	}) => {
		const harness = await openMission(page, baseURL!, [gate()], {
			graph: GRAPH,
		});
		const map = mapPanel(page);
		await map.getByRole("radio", { name: "Mission" }).click();
		await waitForIdleMap(page);
		await jumpTo(page, SITE, SITE_ZOOM);
		await expect(graphNodes(page)).toHaveCount(2);
		await graphPanel(page).locator(".react-flow__controls-fitview").click();
		await page.waitForTimeout(500);
		const [, , fitZoom] = await graphView(page);
		expect(Math.abs(fitZoom - 1.1)).toBeGreaterThan(0.05);
		expect(await gateOutlined(page)).toBe(false);

		const check = graphPanel(page).getByRole("button", {
			name: /^Submit blocked · 1 to fix, mission check$/,
		});
		await check.click();
		const blockers = page.getByRole("list", { name: "Mission issues" });
		const blocker = blockers.getByRole("button", {
			name: /Target: Gate \(not in this mission\)/,
		});

		await test.step("the blocker names the step and the value", async () => {
			await expect(blocker).toBeVisible();
			await expect(blocker).toContainText("Alpha · step 1");
			await expect(blocker).toContainText(
				"targets an asset that is not in this mission",
			);
		});

		await test.step("a click selects the node, reveals it and outlines its target", async () => {
			await blocker.click();
			await expect(blockers).toBeHidden();
			const selected = graphPanel(page).locator(
				".react-flow__node.selected",
			);
			await expect(selected).toHaveCount(1);
			await expect(selected).toContainText("To the gate");
			// The reveal centres the node at zoom 1.1.
			await expect
				.poll(async () => (await graphView(page))[2])
				.toBeCloseTo(1.1, 2);
			const canvas = await boxOf(graphPanel(page).locator(".react-flow"));
			const node = await boxOf(selected);
			const middle = {
				x: node.x + node.width / 2,
				y: node.y + node.height / 2,
			};
			expect(middle.x).toBeGreaterThan(canvas.x);
			expect(middle.x).toBeLessThan(canvas.x + canvas.width);
			expect(middle.y).toBeGreaterThan(canvas.y);
			expect(middle.y).toBeLessThan(canvas.y + canvas.height);
			await expect.poll(() => gateOutlined(page)).toBe(true);
		});

		expect(writes(harness.fake)).toEqual([]);
		expectNoStrayRequests(harness);
	});
});

test.describe("C2 map: the robot lines legend", () => {
	test("names each kind of line, folds, and covers neither the attribution nor the map chrome", async ({
		page,
		baseURL,
	}) => {
		const fake = new FakeC2();
		fake.seedMap(MAP_NAME, [gate()]);
		const refused = await blockExternalRequests(page, baseURL!);
		await fake.install(page);
		await openMissionControl(page, MAP_NAME);
		await waitForIdleMap(page);

		const legend = page.getByRole("group", { name: "Map legend" });
		const toggle = legend.getByRole("button", { name: "Legend" });
		await expect(legend).toBeVisible();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		for (const label of [
			"Planned route",
			"Plan, not approved",
			"Live path",
			"Driven",
		]) {
			await expect(
				legend.getByText(label, { exact: true }),
			).toBeVisible();
		}

		const attribution = page.locator(".maplibregl-ctrl-attrib");
		await expect(attribution).toBeVisible();
		const chrome = page.getByRole("button", { name: /north/i });
		const legendBox = await boxOf(legend);
		expect(overlaps(legendBox, await boxOf(attribution))).toBe(false);
		expect(overlaps(legendBox, await boxOf(chrome))).toBe(false);
		// It sits on the map.
		const mapBox = await boxOf(page.locator(".maplibregl-map"));
		expect(overlaps(legendBox, mapBox)).toBe(true);

		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await expect(legend.getByText("Driven", { exact: true })).toBeHidden();
		expect(overlaps(await boxOf(legend), await boxOf(attribution))).toBe(
			false,
		);

		await toggle.click();
		await expect(legend.getByText("Driven", { exact: true })).toBeVisible();

		expect(
			fake.unhandled.map((r) => `${r.method} ${r.path}`),
			"C2 requests the fake does not implement",
		).toEqual([]);
		expect(refused, "requests to hosts outside the test").toEqual([]);
	});
});
