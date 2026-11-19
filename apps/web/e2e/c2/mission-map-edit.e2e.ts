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
 */
async function openSite(page: Page, baseURL: string): Promise<Harness> {
	const fake = new FakeC2();
	fake.seedMap(MAP_NAME, [siteBoundary()]);
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
 * Switch to the map editor, arm the Edit tool (a save hands the map back to
 * Pick) and open the boundary by clicking inside it.
 *
 * @param corners - The corners the boundary has now, each of which must
 *   show a handle once it is open.
 */
async function openBoundaryForEdit(
	page: Page,
	corners: Position[] = CORNERS,
): Promise<void> {
	await page.getByRole("radio", { name: "Map editor", exact: true }).click();
	await page.getByRole("radio", { name: "Edit", exact: true }).click();
	const [centre] = await toScreen(page, [SITE]);
	await page.mouse.click(centre!.x, centre!.y);
	await expect(editCard(page)).toBeVisible();
	await waitForIdleMap(page);
	// Every corner has a handle: the shape is selected in terra-draw.
	await expectHandles(page, corners);
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
});
