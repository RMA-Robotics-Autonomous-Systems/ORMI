/**
 * The map-layers control reads the registry and the adapters when it renders.
 *
 * Asserted against a real `JsonForms` tree (static markup: the repo has no DOM
 * harness), so the tester, the marker and the states are checked end to end.
 * The edits a click makes are pure and tested in `map-layers-selection.test.ts`.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JsonSchema } from "@jsonforms/core";

import { mapLayersProperty } from "../../map-layers/map-layers-property";
import {
	MAP_SERVERS_UNAVAILABLE,
	mapServersAtom,
	type MapServersState,
} from "../../map-layers/map-servers-store";
import { MapServersProvider } from "../../map-layers/map-servers-provider";
import { appStore } from "../../store";
import {
	GEO_KEY,
	PROVIDERS,
	ROAD,
	SWEDEN,
	entry,
	geoServer,
	xyzServer,
} from "../../map-layers/__tests__/map-layers-fixtures";

const realPluginsExports = { ...(await import("@workspace/ormi-plugins")) };

afterAll(async () => {
	await mock.module("@workspace/ormi-plugins", () => realPluginsExports);
});

let render: (data: Record<string, unknown>, onChange?: () => void) => string;

beforeAll(async () => {
	const manager = {
		applyFilter: <T,>(name: string, initial: T): T =>
			(name === realPluginsExports.PluginsHooks.MAP_LAYER_PROVIDERS
				? [...PROVIDERS]
				: initial) as T,
	};
	await mock.module("@workspace/ormi-plugins", () => ({
		...realPluginsExports,
		usePluginsManager: () => manager,
		usePluginFiltersRevision: () => 0,
	}));

	const { JsonForms } = await import("@jsonforms/react");
	const { shadcnRenderer, shadcnCells } =
		await import("@workspace/ormi-jsonforms");
	const { coreRenderer } = await import("../index");

	render = (data, onChange = () => {}) =>
		renderToStaticMarkup(
			<MapServersProvider
				onLoad={async () => null}
				settingsHref="/dashboard/settings/map-servers"
			>
				<JsonForms
					schema={schema}
					data={data}
					renderers={[...shadcnRenderer, ...coreRenderer]}
					cells={shadcnCells}
					onChange={onChange}
				/>
			</MapServersProvider>,
		);
});

afterEach(() => {
	appStore.set(mapServersAtom, MAP_SERVERS_UNAVAILABLE);
});

const schema: JsonSchema = {
	type: "object",
	properties: { mapLayers: mapLayersProperty({ title: "Map layers" }) },
} as JsonSchema;

function setState(state: MapServersState) {
	appStore.set(mapServersAtom, state);
}

const saved = [
	{ serverKey: GEO_KEY, layerId: ROAD, enabled: true, opacity: 0.4 },
	{
		serverKey: "geoserver:http://gone",
		layerId: "lost",
		enabled: true,
		opacity: 1,
	},
];

describe("MapLayersSelectControl", () => {
	test.each([
		[
			{ status: "unavailable" } as const,
			"Map servers are not available here.",
		],
		[{ status: "waiting" } as const, "Loading map servers"],
		[
			{ status: "failed" } as const,
			"Map servers could not be loaded. Saved layers are kept.",
		],
	])("%o shows a notice and offers nothing to change", (state, text) => {
		setState(state);
		const changes: unknown[] = [];
		const html = render({ mapLayers: saved }, () => changes.push(1));
		expect(html).toContain(text);
		expect(html).toContain("data-map-layers-select");
		expect(html).not.toContain('role="switch"');
		expect(html).not.toContain("lost");
	});

	test("settled and empty links to the settings page", () => {
		setState({ status: "settled", servers: [] });
		const html = render({ mapLayers: [] });
		expect(html).toContain("No map servers.");
		expect(html).toContain('href="/dashboard/settings/map-servers"');
	});

	test("settled lists one group per server with a switch per layer", () => {
		setState({ status: "settled", servers: [geoServer(), xyzServer] });
		const html = render({ mapLayers: saved });
		expect(html).toContain("Lab GeoServer");
		expect(html).toContain("Public overlays");
		expect(html).toContain("GeoServer");
		expect(html).toContain("Road");
		expect(html).toContain("Railways");
		expect(html.match(/role="switch"/g)?.length).toBe(4);
		// The saved opacity is shown on the layer's row.
		expect(html).toContain("40%");
		// No secret reaches the markup.
		expect(html).not.toContain("s3cret");
	});

	test("a not-Web-Mercator layer is listed and cannot be switched", () => {
		setState({ status: "settled", servers: [geoServer()] });
		const html = render({ mapLayers: [] });
		const row = html.slice(html.indexOf(`data-map-layer-row="${SWEDEN}"`));
		const rowHtml = row.slice(0, row.indexOf("</li>"));
		expect(rowHtml).toContain("Not available in Web Mercator");
		expect(rowHtml).toMatch(
			/role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/,
		);
	});

	test("stale refs are named in the unsupported vocabulary with a Remove", () => {
		setState({ status: "settled", servers: [geoServer()] });
		const html = render({ mapLayers: saved });
		const stale = html.slice(html.indexOf("data-map-layers-stale"));
		expect(stale).toContain("Not available");
		expect(stale).toContain("lost");
		expect(stale).toContain(
			"Server not registered (geoserver:http://gone)",
		);
		expect(stale).toContain("Kept as saved.");
		expect(stale).toContain("Remove");
		expect(html).toContain("border-dashed");
	});

	test("a long catalogue gets a filter input", () => {
		const catalog = Array.from({ length: 13 }, (_, i) => entry(`l${i}`));
		setState({
			status: "settled",
			servers: [{ ...xyzServer, catalog }],
		});
		expect(render({ mapLayers: [] })).toContain(
			'placeholder="Filter layers"',
		);
		setState({
			status: "settled",
			servers: [{ ...xyzServer, catalog: catalog.slice(0, 12) }],
		});
		expect(render({ mapLayers: [] })).not.toContain("Filter layers");
	});
});
