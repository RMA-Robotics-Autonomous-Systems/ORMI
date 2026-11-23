import { expect, test, type Page } from "@playwright/test";

import {
	blockExternalRequests,
	drag,
	hasLayer,
	jumpTo,
	openMissionControl,
	renderedAt,
	toLngLat,
	toScreen,
	waitForIdleMap,
} from "./c2-page";
import { FakeC2, type FakeFeature, type Position } from "./fake-c2";

/**
 * Editing a stored map feature in the C2 mission map, in a real browser.
 *
 * Both specs exist because unit tests passed and the real map failed: a stub
 * terra-draw adapter put a midpoint within reach where the real one does not,
 * and the browser hands MapLibre a `DOMRect` whose edges are prototype
 * getters that a spread drops. Here the real terra-draw runs on the real
 * MapLibre map, at a field site's scale, and the only thing faked is the C2
 * behind it.
 *
 * Editing is select-first: there is no tool to arm. A click on a feature
 * opens it with its handles, and its card holds Save, Cancel and Delete.
 */

const MAP_NAME = "e2e-site";
const FEATURE_ID = "e2e-geofence-0001";
/** The site's centre (a field near Brussels). */
const SITE: Position = [4.396, 50.844];
/** Zoom at which a site a few hundred metres across fills most of the panel. */
const SITE_ZOOM = 17.5;

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

const YARD_ID = "e2e-risk-0002";

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
			feature_id: FEATURE_ID,
			name: "Site boundary",
			feature_type: "geofence",
		},
		geometry: {
			type: "Polygon",
			coordinates: [[...CORNERS, CORNERS[0]!]],
		},
	};
}

/** A 50 m square risk area inside the site, east of its centre. */
const YARD_CENTRE: Position = offset(75, 0);
function gravelYard(): FakeFeature {
	const ring: Position[] = [
		offset(50, -25),
		offset(100, -25),
		offset(100, 25),
		offset(50, 25),
	];
	return {
		type: "Feature",
		properties: {
			feature_id: YARD_ID,
			name: "Gravel yard",
			feature_type: "risk",
		},
		geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!]] },
	};
}

/** The outer ring of a Polygon feature body the page sent. */
function outerRing(body: unknown): Position[] {
	const feature = body as FakeFeature;
	expect(feature.geometry.type).toBe("Polygon");
	return (feature.geometry.coordinates as Position[][])[0]!;
}

/** The last element of a non-empty array. */
function last<T>(items: T[]): T {
	expect(items.length).toBeGreaterThan(0);
	return items[items.length - 1]!;
}

/** Whether two positions are the same within `tolerance` degrees. */
function near(a: Position, b: Position, tolerance = 1e-7): boolean {
	return (
		Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance
	);
}

/**
 * The card that names and saves the shape open for editing. Located by its
 * name field: the toolbar also has an "Edit asset" button.
 */
function editCard(page: Page) {
	return page.getByPlaceholder("Feature name").locator("xpath=..");
}

interface Harness {
	fake: FakeC2;
	refused: string[];
}

/**
 * Seed the fake, open the page on the site map, and put the camera on the
 * site, after the map's own framing has run.
 *
 * @param features - What the map holds; the site boundary alone by default.
 */
async function openSite(
	page: Page,
	baseURL: string,
	features: FakeFeature[] = [siteBoundary()],
): Promise<Harness> {
	const fake = new FakeC2();
	fake.seedMap(MAP_NAME, features);
	const refused = await blockExternalRequests(page, baseURL);
	await fake.install(page);
	await openMissionControl(page, MAP_NAME);

	// The map frames the selected map's bounds once the registry and its
	// features arrive; wait for both, then take the camera.
	await expect
		.poll(() => fake.requestsTo("GET", `/maps/${MAP_NAME}/features`).length)
		.toBeGreaterThan(0);
	await waitForIdleMap(page);
	await jumpTo(page, SITE, SITE_ZOOM);

	// The stored feature is drawn before anything is clicked.
	const [centre] = await toScreen(page, [SITE]);
	await expect
		.poll(async () =>
			(await renderedAt(page, centre!, "c2-features")).some(
				(hit) => hit.properties.feature_id === FEATURE_ID,
			),
		)
		.toBe(true);
	return { fake, refused };
}

/**
 * Switch to the map editor and open the boundary by clicking inside it. No
 * tool is armed first: a click selects and opens.
 *
 * @param corners - The corners the boundary has now, each of which must
 *   show a handle once it is open.
 */
async function openBoundaryForEdit(
	page: Page,
	corners: Position[] = CORNERS,
): Promise<void> {
	await page.getByRole("radio", { name: "Map editor", exact: true }).click();
	const [centre] = await toScreen(page, [SITE]);
	await page.mouse.click(centre!.x, centre!.y);
	await expect(editCard(page)).toBeVisible();
	await expect(page.getByText("Editing Site boundary")).toBeVisible();
	await waitForIdleMap(page);
	// Every corner has a handle: the shape is selected in terra-draw.
	await expectHandles(page, corners);
}

/** Drag corner 2 of the open boundary outward; returns where it landed. */
async function reshapeCorner2(page: Page): Promise<Position> {
	const [from] = await toScreen(page, [CORNERS[2]!]);
	const to = { x: from!.x + 70, y: from!.y - 50 };
	await drag(page, from!, to);
	await waitForIdleMap(page);
	return toLngLat(page, to);
}

/**
 * Answer the open question and wait until it is gone: the dialog keeps the
 * page from taking pointer events until its exit animation ends.
 */
async function answerDialog(page: Page, button: string): Promise<void> {
	const dialog = page.getByRole("alertdialog");
	await dialog.getByRole("button", { name: button, exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect
		.poll(() => page.evaluate(() => document.body.style.pointerEvents))
		.not.toBe("none");
}

/** No write of any kind reached the fake. */
function expectNoWrites(fake: FakeC2): void {
	for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
		expect(
			fake.requestsTo(method, "/").map((r) => r.path),
			`${method} requests`,
		).toEqual([]);
	}
}

/** terra-draw draws a vertex handle at each of these positions. */
async function expectHandles(page: Page, positions: Position[]): Promise<void> {
	const points = await toScreen(page, positions);
	for (const [i, point] of points.entries()) {
		await expect
			.poll(
				async () =>
					(await renderedAt(page, point, "td-")).some(
						(hit) => hit.properties.selectionPoint === true,
					),
				{ message: `a vertex handle at corner ${i}` },
			)
			.toBe(true);
	}
}

/** Press the edit card's Save and wait for the write to reach the fake. */
async function save(page: Page, fake: FakeC2, writesBefore: number) {
	await editCard(page)
		.getByRole("button", { name: "Save", exact: true })
		.click();
	await expect
		.poll(
			() => fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`).length,
		)
		.toBe(writesBefore + 1);
	await expect(editCard(page)).toBeHidden();
	return last(fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`));
}

/** Nothing reached a path the fake does not serve, nor left the machine. */
function expectNoStrayRequests({ fake, refused }: Harness): void {
	expect(
		fake.unhandled.map((r) => `${r.method} ${r.path}`),
		"C2 requests the fake does not implement",
	).toEqual([]);
	expect(refused, "requests to hosts outside the test").toEqual([]);
}

test.describe("C2 mission map: editing a stored feature", () => {
	test("a reshaped feature saves as an update of the same feature_id", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await openBoundaryForEdit(page);

		// Drag corner 2 outward.
		const [from] = await toScreen(page, [CORNERS[2]!]);
		const to = { x: from!.x + 70, y: from!.y - 50 };
		await drag(page, from!, to);
		await waitForIdleMap(page);
		const dropped = await toLngLat(page, to);
		// The card stays open on the same feature: the drag is an edit of it.
		await expect(editCard(page)).toBeVisible();

		const put = await save(page, fake, 0);

		expect(put.path).toBe(
			`/maps/${MAP_NAME}/features/${encodeURIComponent(FEATURE_ID)}`,
		);
		const body = put.body as FakeFeature;
		expect(body.properties.feature_id).toBe(FEATURE_ID);
		expect(body.properties.name).toBe("Site boundary");
		expect(body.properties.feature_type).toBe("geofence");
		const ring = outerRing(body);
		expect(ring).toHaveLength(CORNERS.length + 1);
		expect(ring[0]).toEqual(last(ring));
		for (const i of [0, 1, 3, 4]) {
			expect(near(ring[i]!, CORNERS[i]!), `corner ${i} unchanged`).toBe(
				true,
			);
		}
		// Where the pointer let go, within a couple of pixels (~0.6 m here).
		expect(near(ring[2]!, CORNERS[2]!, 1e-6), "corner 2 moved").toBe(false);
		expect(
			near(ring[2]!, dropped, 1e-5),
			"corner 2 at the drop point",
		).toBe(true);

		// No new feature: one write, an update, and the map still holds one.
		expect(fake.requestsTo("POST", `/maps/${MAP_NAME}/features`)).toEqual(
			[],
		);
		expect(fake.feature(MAP_NAME, FEATURE_ID)).toBeDefined();
		expect(
			fake.requestsTo("GET", "/maps").length,
			"the map registry was read",
		).toBeGreaterThan(0);
		expectNoStrayRequests(harness);
	});

	test("at site zoom, a clicked vertex is selected, deleted alone and saved; a midpoint drag inserts one", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await openBoundaryForEdit(page);

		const target = 3;
		await test.step("click a vertex: the ring shows and the shape stays selected", async () => {
			const [vertex] = await toScreen(page, [CORNERS[target]!]);
			await page.mouse.click(vertex!.x, vertex!.y);
			await expect
				.poll(() => hasLayer(page, "c2-selected-vertex-ring"))
				.toBe(true);
			await expect
				.poll(
					async () =>
						(
							await renderedAt(
								page,
								vertex!,
								"c2-selected-vertex-ring",
							)
						).length,
				)
				.toBeGreaterThan(0);
			await expect(editCard(page)).toBeVisible();
			await expectHandles(page, CORNERS);
		});

		await test.step("Delete removes exactly that vertex", async () => {
			await page.keyboard.press("Delete");
			await expect
				.poll(() => hasLayer(page, "c2-selected-vertex-ring"))
				.toBe(false);
			const kept = CORNERS.filter((_, i) => i !== target);
			await expectHandles(page, kept);
			const [gone] = await toScreen(page, [CORNERS[target]!]);
			expect(
				(await renderedAt(page, gone!, "td-")).some(
					(hit) => hit.properties.selectionPoint === true,
				),
				"no handle where the deleted vertex was",
			).toBe(false);
			await expect(editCard(page)).toBeVisible();
		});

		await test.step("Save writes one position fewer to the same feature", async () => {
			const put = await save(page, fake, 0);
			expect(put.path).toBe(
				`/maps/${MAP_NAME}/features/${encodeURIComponent(FEATURE_ID)}`,
			);
			expect((put.body as FakeFeature).properties.feature_id).toBe(
				FEATURE_ID,
			);
			const ring = outerRing(put.body);
			expect(ring).toHaveLength(CORNERS.length);
			const expected = CORNERS.filter((_, i) => i !== target);
			expect(
				ring.slice(0, -1).map((p, i) => near(p, expected[i]!)),
			).toEqual(expected.map(() => true));
			expect(ring[0]).toEqual(last(ring));
		});

		await test.step("a midpoint drag inserts a vertex, saved to the same feature", async () => {
			// Reopen what the fake now holds (four corners).
			await expect
				.poll(
					() =>
						fake.requestsTo("GET", `/maps/${MAP_NAME}/features`)
							.length,
				)
				.toBeGreaterThan(1);
			const stored = outerRing(fake.feature(MAP_NAME, FEATURE_ID)).slice(
				0,
				-1,
			);
			expect(stored).toHaveLength(4);
			await openBoundaryForEdit(page, stored);

			// The midpoint of the first edge, where terra-draw draws its handle.
			const [a, b] = await toScreen(page, [stored[0]!, stored[1]!]);
			const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
			await expect
				.poll(async () =>
					(await renderedAt(page, mid, "td-", 4)).some(
						(hit) => hit.properties.midPoint === true,
					),
				)
				.toBe(true);
			const to = { x: mid.x, y: mid.y + 60 };
			await drag(page, mid, to);
			await waitForIdleMap(page);
			const dropped = await toLngLat(page, to);

			const put = await save(page, fake, 1);
			expect((put.body as FakeFeature).properties.feature_id).toBe(
				FEATURE_ID,
			);
			const ring = outerRing(put.body);
			expect(ring).toHaveLength(stored.length + 2);
			// The new vertex sits between the first two corners, at the drop.
			expect(near(ring[0]!, stored[0]!)).toBe(true);
			expect(
				near(ring[1]!, dropped, 1e-5),
				"inserted vertex at the drop",
			).toBe(true);
			expect(near(ring[2]!, stored[1]!)).toBe(true);
			expect(near(ring[3]!, stored[2]!)).toBe(true);
			expect(near(ring[4]!, stored[3]!)).toBe(true);
		});

		expect(fake.requestsTo("POST", `/maps/${MAP_NAME}/features`)).toEqual(
			[],
		);
		expectNoStrayRequests(harness);
	});

	test("a click selects and shows handles with no tool armed", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		// No tool to arm: Pick, Edit and Delete are gone, Draw stays.
		for (const name of ["Pick", "Edit", "Delete"]) {
			await expect(
				page.getByRole("radio", { name, exact: true }),
			).toHaveCount(0);
		}
		await expect(
			page.getByRole("button", { name: "Draw", exact: true }),
		).toBeVisible();

		await openBoundaryForEdit(page);

		// Nothing changed yet: Save waits for a change; Cancel and Delete
		// are there.
		const card = editCard(page);
		await expect(
			card.getByRole("button", { name: "Save", exact: true }),
		).toBeDisabled();
		await expect(
			card.getByRole("button", { name: "Cancel", exact: true }),
		).toBeEnabled();
		await expect(
			card.getByRole("button", { name: "Delete feature", exact: true }),
		).toBeEnabled();

		// A change enables Save.
		await reshapeCorner2(page);
		await expect(
			card.getByRole("button", { name: "Save", exact: true }),
		).toBeEnabled();
		expectNoWrites(harness.fake);
		expectNoStrayRequests(harness);
	});

	test("Enter saves the open edit as an update of the same feature_id", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await openBoundaryForEdit(page);
		const dropped = await reshapeCorner2(page);

		// The question a click off the shape asks hands the keyboard back to
		// the map: Enter after Keep editing still saves.
		const [outside] = await toScreen(page, [offset(-160, -40)]);
		await page.mouse.click(outside!.x, outside!.y);
		await expect(page.getByRole("alertdialog")).toContainText(
			"Discard changes to Site boundary?",
		);
		await answerDialog(page, "Keep editing");

		await page.keyboard.press("Enter");
		await expect
			.poll(
				() =>
					fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`)
						.length,
			)
			.toBe(1);
		await expect(editCard(page)).toBeHidden();
		await expect(page.getByText("Editing Site boundary")).toBeHidden();

		const put = last(fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`));
		expect(put.path).toBe(
			`/maps/${MAP_NAME}/features/${encodeURIComponent(FEATURE_ID)}`,
		);
		expect((put.body as FakeFeature).properties.feature_id).toBe(
			FEATURE_ID,
		);
		expect(near(outerRing(put.body)[2]!, dropped, 1e-5)).toBe(true);
		expect(fake.requestsTo("POST", `/maps/${MAP_NAME}/features`)).toEqual(
			[],
		);
		expectNoStrayRequests(harness);
	});

	test("Escape cancels the open edit and sends nothing", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await openBoundaryForEdit(page);
		await reshapeCorner2(page);

		await page.keyboard.press("Escape");
		await expect(editCard(page)).toBeHidden();
		await expect(page.getByText("Editing Site boundary")).toBeHidden();
		// The handles are gone with the edit.
		const [corner] = await toScreen(page, [CORNERS[0]!]);
		await expect
			.poll(async () =>
				(await renderedAt(page, corner!, "td-")).some(
					(hit) => hit.properties.selectionPoint === true,
				),
			)
			.toBe(false);

		expectNoWrites(fake);
		expect(outerRing(fake.feature(MAP_NAME, FEATURE_ID))).toEqual([
			...CORNERS,
			CORNERS[0]!,
		]);
		// The map draws the stored shape again: a click there reopens it.
		await openBoundaryForEdit(page);
		expectNoStrayRequests(harness);
	});

	test("Delete with no vertex selected asks, and deletes the feature on confirm", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await openBoundaryForEdit(page);

		await page.keyboard.press("Delete");
		const dialog = page.getByRole("alertdialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("Site boundary");
		// Nothing is deleted before the operator confirms.
		expectNoWrites(fake);

		await dialog
			.getByRole("button", { name: "Delete", exact: true })
			.click();
		await expect
			.poll(
				() =>
					fake.requestsTo("DELETE", `/maps/${MAP_NAME}/features/`)
						.length,
			)
			.toBe(1);
		expect(
			last(fake.requestsTo("DELETE", `/maps/${MAP_NAME}/features/`)).path,
		).toBe(`/maps/${MAP_NAME}/features/${encodeURIComponent(FEATURE_ID)}`);
		await expect(editCard(page)).toBeHidden();
		expect(fake.feature(MAP_NAME, FEATURE_ID)).toBeUndefined();
		// The edit ended with the feature: nothing writes it back.
		expect(fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`)).toEqual(
			[],
		);
		expectNoStrayRequests(harness);
	});

	test("a click on another feature asks before dropping changes, and switches at once without them", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!, [
			siteBoundary(),
			gravelYard(),
		]);
		const { fake } = harness;
		const [yard] = await toScreen(page, [YARD_CENTRE]);
		const dialog = page.getByRole("alertdialog");

		await test.step("with changes, Keep editing keeps the edit", async () => {
			await openBoundaryForEdit(page);
			await reshapeCorner2(page);
			await page.mouse.click(yard!.x, yard!.y);
			await expect(dialog).toContainText(
				"Discard changes to Site boundary?",
			);
			await answerDialog(page, "Keep editing");
			await expect(page.getByText("Editing Site boundary")).toBeVisible();
			await expect(
				editCard(page).getByRole("button", {
					name: "Save",
					exact: true,
				}),
			).toBeEnabled();
			await expectHandles(page, [CORNERS[0]!, CORNERS[1]!]);
		});

		await test.step("with changes, Discard opens the other feature", async () => {
			await page.mouse.click(yard!.x, yard!.y);
			await expect(dialog).toBeVisible();
			await answerDialog(page, "Discard");
			await expect(page.getByText("Editing Gravel yard")).toBeVisible();
		});

		await test.step("without changes, a click switches at once", async () => {
			const [centre] = await toScreen(page, [SITE]);
			await page.mouse.click(centre!.x, centre!.y);
			await expect(page.getByText("Editing Site boundary")).toBeVisible();
			await expect(dialog).toHaveCount(0);
			await page.mouse.click(yard!.x, yard!.y);
			await expect(page.getByText("Editing Gravel yard")).toBeVisible();
			await expect(dialog).toHaveCount(0);
		});

		expectNoWrites(fake);
		expectNoStrayRequests(harness);
	});

	test("a click on empty map ends the selection, asking first when there are changes", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		// Two empty spots west of the boundary, on the map and clear of its
		// handles: two clicks on one spot are a double click, which zooms.
		const [outside, elsewhere] = await toScreen(page, [
			offset(-160, -40),
			offset(-160, -10),
		]);
		const dialog = page.getByRole("alertdialog");

		await openBoundaryForEdit(page);
		await page.mouse.click(outside!.x, outside!.y);
		await expect(editCard(page)).toBeHidden();
		await expect(dialog).toHaveCount(0);

		await openBoundaryForEdit(page);
		await reshapeCorner2(page);
		await page.mouse.click(outside!.x, outside!.y);
		await expect(dialog).toContainText("Discard changes to Site boundary?");
		await answerDialog(page, "Keep editing");
		await expect(editCard(page)).toBeVisible();
		await page.mouse.click(elsewhere!.x, elsewhere!.y);
		await answerDialog(page, "Discard");
		await expect(editCard(page)).toBeHidden();

		expectNoWrites(harness.fake);
		expectNoStrayRequests(harness);
	});
});

/** Corners of a new area drawn inside the site, clear of the boundary. */
const PIT: Position[] = [
	offset(-70, -45),
	offset(-10, -45),
	offset(-10, 15),
	offset(-70, 15),
];

/** The Draw button in the toolbar. */
function drawButton(page: Page) {
	return page.getByRole("button", { name: "Draw", exact: true });
}

/** The hint chip shown while Draw is armed. */
function hintChip(page: Page) {
	return page.getByRole("status", { name: "Draw", exact: true });
}

/** Switch to the map editor, with a polygon type chosen for the next draw. */
async function prepareAreaDraw(page: Page): Promise<void> {
	await page.getByRole("radio", { name: "Map editor", exact: true }).click();
	await page.getByRole("combobox", { name: "Feature type to draw" }).click();
	await page
		.getByRole("option", { name: "Risk (area)", exact: true })
		.click();
	await expect(
		page.getByRole("radio", { name: "Polygon", exact: true }),
	).toHaveAttribute("data-state", "on");
}

/** Arm Draw and check it says so. */
async function armDraw(page: Page): Promise<void> {
	await drawButton(page).click();
	await expect(drawButton(page)).toHaveAttribute("aria-pressed", "true");
	await expect(hintChip(page)).toContainText(
		"Click to add corners. Double-click or click the first corner to finish.",
	);
}

/** Click each position on the map, in order. */
async function clickAt(page: Page, positions: Position[]): Promise<void> {
	for (const point of await toScreen(page, positions)) {
		await page.mouse.click(point.x, point.y);
	}
}

/** The map's zoom level. */
async function zoomOf(page: Page): Promise<number> {
	return page.evaluate(() =>
		(
			window as unknown as { __e2eMap: { getZoom(): number } }
		).__e2eMap.getZoom(),
	);
}

/** The new shape is open in select: card, focused name, handles, Draw off. */
async function expectNewShapeOpen(
	page: Page,
	corners: Position[],
): Promise<void> {
	await expect(drawButton(page)).toHaveAttribute("aria-pressed", "false");
	await expect(hintChip(page)).toHaveCount(0);
	await expect(editCard(page)).toBeVisible();
	await expect(page.getByPlaceholder("Feature name")).toBeFocused();
	await expect(page.getByText("New risk (area)")).toBeVisible();
	await waitForIdleMap(page);
	await expectHandles(page, corners);
}

test.describe("C2 mission map: one-shot Draw", () => {
	test("a drawn polygon returns to select, open with its name focused, and saves as one new feature", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await prepareAreaDraw(page);
		await armDraw(page);
		const zoom = await zoomOf(page);

		// Three corners, then a double-click on the fourth finishes.
		await clickAt(page, PIT.slice(0, 3));
		const [fourth] = await toScreen(page, [PIT[3]!]);
		await page.mouse.dblclick(fourth!.x, fourth!.y);

		await expectNewShapeOpen(page, PIT);
		// The double-click that finished it did not zoom.
		expect(await zoomOf(page)).toBe(zoom);
		expectNoWrites(fake);

		// Typed straight into the focused name field; Enter saves.
		await page.keyboard.type("North pit");
		await page.keyboard.press("Enter");
		await expect
			.poll(
				() =>
					fake.requestsTo("POST", `/maps/${MAP_NAME}/features`)
						.length,
			)
			.toBe(1);
		await expect(editCard(page)).toBeHidden();

		const post = last(
			fake.requestsTo("POST", `/maps/${MAP_NAME}/features`),
		);
		const body = post.body as FakeFeature;
		expect(body.properties.name).toBe("North pit");
		expect(body.properties.feature_type).toBe("risk");
		const ring = outerRing(body);
		expect(ring).toHaveLength(PIT.length + 1);
		expect(ring[0]).toEqual(last(ring));
		for (const [i, corner] of PIT.entries()) {
			expect(
				near(ring[i]!, corner, 1e-5),
				`corner ${i} where it was clicked`,
			).toBe(true);
		}
		expect(fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`)).toEqual(
			[],
		);
		// Still one shot: a click now selects, it does not start a shape.
		await expect(drawButton(page)).toHaveAttribute("aria-pressed", "false");
		expectNoStrayRequests(harness);
	});

	test("Escape or Draw again disarms with nothing created, before or during a shape", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		await prepareAreaDraw(page);

		await test.step("Draw then Escape", async () => {
			await armDraw(page);
			await page.keyboard.press("Escape");
			await expect(drawButton(page)).toHaveAttribute(
				"aria-pressed",
				"false",
			);
			await expect(hintChip(page)).toHaveCount(0);
		});

		await test.step("Draw pressed again", async () => {
			await armDraw(page);
			await drawButton(page).click();
			await expect(drawButton(page)).toHaveAttribute(
				"aria-pressed",
				"false",
			);
			await expect(hintChip(page)).toHaveCount(0);
		});

		await test.step("Escape with a shape half drawn discards it", async () => {
			await armDraw(page);
			await clickAt(page, PIT.slice(0, 2));
			await page.keyboard.press("Escape");
			await expect(drawButton(page)).toHaveAttribute(
				"aria-pressed",
				"false",
			);
			await expect(hintChip(page)).toHaveCount(0);
			await waitForIdleMap(page);
			for (const point of await toScreen(page, PIT.slice(0, 2))) {
				expect(
					await renderedAt(page, point, "td-"),
					"nothing of the half-drawn shape remains",
				).toEqual([]);
			}
		});

		await expect(editCard(page)).toBeHidden();
		expectNoWrites(harness.fake);
		expectNoStrayRequests(harness);
	});

	test("Finish completes a polygon once it has three corners", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await prepareAreaDraw(page);
		await armDraw(page);
		const finish = hintChip(page).getByRole("button", {
			name: "Finish",
			exact: true,
		});
		await expect(finish).toBeDisabled();

		const corners = PIT.slice(0, 3);
		await clickAt(page, corners.slice(0, 2));
		await expect(finish).toBeDisabled();
		await clickAt(page, corners.slice(2));
		await expect(finish).toBeEnabled();
		await finish.click();

		await expectNewShapeOpen(page, corners);
		await page.keyboard.type("Spoil heap");
		await editCard(page)
			.getByRole("button", { name: "Save", exact: true })
			.click();
		await expect
			.poll(
				() =>
					fake.requestsTo("POST", `/maps/${MAP_NAME}/features`)
						.length,
			)
			.toBe(1);
		// The three corners and the closing position: no point where the
		// pointer left the map for the button.
		const ring = outerRing(
			last(fake.requestsTo("POST", `/maps/${MAP_NAME}/features`)).body,
		);
		expect(ring).toHaveLength(corners.length + 1);
		for (const [i, corner] of corners.entries()) {
			expect(near(ring[i]!, corner, 1e-5), `corner ${i}`).toBe(true);
		}
		expectNoStrayRequests(harness);
	});

	test("Escape on a just-drawn shape discards it: at once unnamed, asking once named", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		await prepareAreaDraw(page);
		const dialog = page.getByRole("alertdialog");
		const finish = hintChip(page).getByRole("button", {
			name: "Finish",
			exact: true,
		});
		const corners = PIT.slice(0, 3);

		await test.step("unnamed: gone at once, no question", async () => {
			await armDraw(page);
			await clickAt(page, corners);
			await finish.click();
			await expectNewShapeOpen(page, corners);
			await page.keyboard.press("Escape");
			await expect(editCard(page)).toBeHidden();
			await expect(dialog).toHaveCount(0);
			await waitForIdleMap(page);
			const [first] = await toScreen(page, [corners[0]!]);
			expect(await renderedAt(page, first!, "td-")).toEqual([]);
		});

		await test.step("named: asks, Keep editing keeps, Discard drops", async () => {
			await armDraw(page);
			await clickAt(page, corners);
			await finish.click();
			await expectNewShapeOpen(page, corners);
			await page.keyboard.type("Typo pit");
			await page.keyboard.press("Escape");
			await expect(dialog).toContainText(
				"Discard changes to the new risk (area)?",
			);
			await answerDialog(page, "Keep editing");
			await expect(editCard(page)).toBeVisible();
			await expect(page.getByPlaceholder("Feature name")).toHaveValue(
				"Typo pit",
			);
			await page.getByPlaceholder("Feature name").press("Escape");
			await answerDialog(page, "Discard");
			await expect(editCard(page)).toBeHidden();
		});

		expectNoWrites(harness.fake);
		expectNoStrayRequests(harness);
	});
});

/** The edit card's button, by its exact label. */
function cardButton(page: Page, name: string) {
	return editCard(page).getByRole("button", { name, exact: true });
}

/**
 * Press a key combination on the map canvas, where terra-draw listens, as
 * a script-made event: a browser shortcut (reload, save) never runs for
 * one, so the page survives, while terra-draw handles it like any key.
 *
 * @returns Whether anything on the page called `preventDefault` on each
 *   event, in dispatch order (keydown and keyup of each key).
 */
async function dispatchShortcutOnMap(
	page: Page,
	keys: string[],
): Promise<boolean[]> {
	return page.evaluate((combo) => {
		const canvas = document.querySelector(
			".maplibregl-canvas",
		) as HTMLCanvasElement;
		canvas.focus();
		const ctrlKey = combo.includes("Control");
		const fire = (type: string, key: string) =>
			!canvas.dispatchEvent(
				new KeyboardEvent(type, {
					key,
					ctrlKey,
					bubbles: true,
					cancelable: true,
				}),
			);
		const prevented: boolean[] = [];
		for (const key of combo) prevented.push(fire("keydown", key));
		for (const key of [...combo].reverse())
			prevented.push(fire("keyup", key));
		return prevented;
	}, keys);
}

test.describe("C2 mission map: Undo and Redo in the open edit", () => {
	test("Undo restores the shape as opened and disables Save; Redo re-applies; Save PUTs the redone shape", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await openBoundaryForEdit(page);
		await expect(cardButton(page, "Undo")).toBeDisabled();
		await expect(cardButton(page, "Redo")).toBeDisabled();
		await expect(cardButton(page, "Save")).toBeDisabled();

		const dropped = await reshapeCorner2(page);
		await expect(cardButton(page, "Save")).toBeEnabled();
		await expect(cardButton(page, "Undo")).toBeEnabled();
		await expect(cardButton(page, "Redo")).toBeDisabled();

		await cardButton(page, "Undo").click();
		await waitForIdleMap(page);
		await expect(cardButton(page, "Save")).toBeDisabled();
		await expect(cardButton(page, "Undo")).toBeDisabled();
		await expect(cardButton(page, "Redo")).toBeEnabled();
		// The handles are back on the stored corners.
		await expectHandles(page, CORNERS);

		await cardButton(page, "Redo").click();
		await waitForIdleMap(page);
		await expect(cardButton(page, "Save")).toBeEnabled();
		await expect(cardButton(page, "Redo")).toBeDisabled();
		const redone = [...CORNERS];
		redone[2] = dropped;
		await expectHandles(page, redone);

		const put = await save(page, fake, 0);
		const ring = outerRing(put.body);
		expect(near(ring[2]!, dropped, 1e-5), "corner 2 redone").toBe(true);
		for (const i of [0, 1, 3, 4]) {
			expect(near(ring[i]!, CORNERS[i]!), `corner ${i} unchanged`).toBe(
				true,
			);
		}
		expectNoStrayRequests(harness);
	});

	test("Ctrl+Z undoes and Ctrl+Shift+Z redoes, a vertex deletion as well as a drag", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		const { fake } = harness;
		await openBoundaryForEdit(page);
		const dropped = await reshapeCorner2(page);

		// Delete corner 4: select it, then Delete.
		const [vertex] = await toScreen(page, [CORNERS[4]!]);
		await page.mouse.click(vertex!.x, vertex!.y);
		await expect
			.poll(() => hasLayer(page, "c2-selected-vertex-ring"))
			.toBe(true);
		await page.keyboard.press("Delete");
		await waitForIdleMap(page);
		await expectHandles(page, [
			CORNERS[0]!,
			CORNERS[1]!,
			dropped,
			CORNERS[3]!,
		]);

		await page.keyboard.press("Control+z");
		await waitForIdleMap(page);
		const reshaped = [...CORNERS];
		reshaped[2] = dropped;
		await expectHandles(page, reshaped);
		await expect(cardButton(page, "Save")).toBeEnabled();

		await page.keyboard.press("Control+z");
		await waitForIdleMap(page);
		await expectHandles(page, CORNERS);
		await expect(cardButton(page, "Save")).toBeDisabled();
		await expect(cardButton(page, "Undo")).toBeDisabled();

		await page.keyboard.press("Control+Shift+z");
		await waitForIdleMap(page);
		await expectHandles(page, reshaped);
		await expect(cardButton(page, "Save")).toBeEnabled();

		// Enter saves what Redo restored.
		await page.keyboard.press("Enter");
		await expect
			.poll(
				() =>
					fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`)
						.length,
			)
			.toBe(1);
		const ring = outerRing(
			last(fake.requestsTo("PUT", `/maps/${MAP_NAME}/features/`)).body,
		);
		expect(ring).toHaveLength(CORNERS.length + 1);
		expect(near(ring[2]!, dropped, 1e-5)).toBe(true);
		expectNoStrayRequests(harness);
	});

	test("a drag from a midpoint is one step: one Undo takes it back", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		await openBoundaryForEdit(page);
		// The midpoint of the first edge, where terra-draw draws its handle.
		const [a, b] = await toScreen(page, [CORNERS[0]!, CORNERS[1]!]);
		const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
		await expect
			.poll(async () =>
				(await renderedAt(page, mid, "td-", 4)).some(
					(hit) => hit.properties.midPoint === true,
				),
			)
			.toBe(true);
		const to = { x: mid.x, y: mid.y + 60 };
		await drag(page, mid, to);
		await waitForIdleMap(page);
		const inserted = await toLngLat(page, to);
		await expectHandles(page, [...CORNERS, inserted]);
		await expect(cardButton(page, "Save")).toBeEnabled();

		await cardButton(page, "Undo").click();
		await waitForIdleMap(page);
		await expectHandles(page, CORNERS);
		await expect(cardButton(page, "Save")).toBeDisabled();
		await expect(cardButton(page, "Undo")).toBeDisabled();
		expectNoWrites(harness.fake);
		expectNoStrayRequests(harness);
	});

	test("the history ends with the edit", async ({ page, baseURL }) => {
		const harness = await openSite(page, baseURL!);
		await openBoundaryForEdit(page);
		await reshapeCorner2(page);
		await page.keyboard.press("Escape");
		await expect(editCard(page)).toBeHidden();

		await openBoundaryForEdit(page);
		await expect(cardButton(page, "Undo")).toBeDisabled();
		await expect(cardButton(page, "Redo")).toBeDisabled();
		await page.keyboard.press("Control+z");
		await expectHandles(page, CORNERS);
		expectNoWrites(harness.fake);
		expectNoStrayRequests(harness);
	});

	test("Ctrl+S and Ctrl+R are left to the browser: nothing scales or rotates", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		await openBoundaryForEdit(page);
		const dropped = await reshapeCorner2(page);
		const reshaped = [...CORNERS];
		reshaped[2] = dropped;

		for (const key of ["s", "r"]) {
			const prevented = await dispatchShortcutOnMap(page, [
				"Control",
				key,
			]);
			expect(prevented, `Ctrl+${key} default-prevented`).toEqual([
				false,
				false,
				false,
				false,
			]);
		}
		await waitForIdleMap(page);
		await expectHandles(page, reshaped);
		await expect(editCard(page)).toBeVisible();
		await expect(cardButton(page, "Save")).toBeEnabled();
		expectNoWrites(harness.fake);
		expectNoStrayRequests(harness);
	});
});

test.describe("C2 mission map: the edit card stays clear of the shape", () => {
	test("a corner under the card moves the card to the other top corner", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		await openBoundaryForEdit(page);
		const card = editCard(page);
		await expect(card).toHaveAttribute("data-side", "left");

		// Pan so corner 4 lands under the card's top-left place.
		const box = (await page.locator(".maplibregl-map").boundingBox())!;
		const [corner] = await toScreen(page, [CORNERS[4]!]);
		const want = { x: box.x + 90, y: box.y + 90 };
		const centre = await toLngLat(page, {
			x: box.x + box.width / 2 + (corner!.x - want.x),
			y: box.y + box.height / 2 + (corner!.y - want.y),
		});
		await jumpTo(page, centre, SITE_ZOOM);

		await expect(card).toHaveAttribute("data-side", "right");
		const cardBox = (await card.boundingBox())!;
		for (const [i, point] of (await toScreen(page, CORNERS)).entries()) {
			const inside =
				point.x >= cardBox.x &&
				point.x <= cardBox.x + cardBox.width &&
				point.y >= cardBox.y &&
				point.y <= cardBox.y + cardBox.height;
			expect(inside, `corner ${i} under the card`).toBe(false);
		}
		// Still the same edit.
		await expect(page.getByText("Editing Site boundary")).toBeVisible();
		expectNoStrayRequests(harness);
	});
});

test.describe("C2 mission map: one state indicator", () => {
	test("the toolbar says what the map is doing, one label at a time", async ({
		page,
		baseURL,
	}) => {
		const harness = await openSite(page, baseURL!);
		await openBoundaryForEdit(page);
		const status = page.getByRole("status").filter({
			hasText: /^(Editing|New|Drawing) /,
		});
		await expect(status).toHaveCount(1);
		await expect(status).toHaveText("Editing Site boundary");

		await page.keyboard.press("Escape");
		await expect(status).toHaveCount(0);

		await page.getByRole("button", { name: "Draw", exact: true }).click();
		await expect(status).toHaveCount(1);
		await expect(status).toHaveText(/^Drawing /);
		await page.keyboard.press("Escape");
		await expect(status).toHaveCount(0);
		expectNoStrayRequests(harness);
	});
});
