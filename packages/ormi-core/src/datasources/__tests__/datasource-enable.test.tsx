/**
 * Core enforces `settings.enable`: a disabled datasource mounts no provider,
 * is reported as `disabled` (never offline or connecting), and comes back as
 * `connecting` when re-enabled.
 */

import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
	isDatasourceEnabled,
	mountedDatasourceEntries,
	reconcileDatasourceStatuses,
	resolveDatasourceEntries,
	withDisabledStatuses,
} from "../components/global-datasource-provider";
import { DatasourceStatusBadges } from "../components/datasource-status-badges";
import {
	deriveHealth,
	type Datasource,
	type DatasourceDefinition,
	type DatasourceProviderSettings,
	type DatasourceStatus,
} from "../datasource-interface";

const definition: DatasourceDefinition<DatasourceProviderSettings> = {
	id: "foxglove",
	name: "Foxglove",
	description: "",
	schema: { type: "object" },
	data: { id: "", title: "", enable: true },
	Provider: () => null,
};

function instance(id: string, enable: boolean): Datasource {
	return {
		datasource_id: "foxglove",
		title: id,
		settings: { id, title: id, enable },
	};
}

const defs = new Map([["foxglove", definition]]);

describe("mountedDatasourceEntries", () => {
	test("a disabled datasource mounts no provider", () => {
		const entries = resolveDatasourceEntries(
			[instance("on", true), instance("off", false)],
			defs,
		);
		expect(
			mountedDatasourceEntries(entries).map(
				(e) => e.datasource.settings.id,
			),
		).toEqual(["on"]);
	});

	test("re-enabling mounts it again", () => {
		const entries = resolveDatasourceEntries([instance("off", true)], defs);
		expect(mountedDatasourceEntries(entries)).toHaveLength(1);
	});

	test("unsupported entries stay unmounted", () => {
		const entries = resolveDatasourceEntries(
			[instance("on", true)],
			new Map(),
		);
		expect(mountedDatasourceEntries(entries)).toHaveLength(0);
	});

	test("a stored config missing `enable` reads as off, like the widget gates", () => {
		const ds = instance("x", true);
		delete (ds.settings as Partial<DatasourceProviderSettings>).enable;
		expect(isDatasourceEnabled(ds)).toBe(false);
	});
});

describe("reconcileDatasourceStatuses", () => {
	test("an enabled datasource starts connecting, a disabled one is not tracked", () => {
		const next = reconcileDatasourceStatuses(new Map(), [
			instance("on", true),
			instance("off", false),
		]);
		expect([...next]).toEqual([["on", "connecting"]]);
	});

	test("disabling drops the tracked status so a re-enable starts connecting", () => {
		const prev = new Map<string, DatasourceStatus>([["a", "disposed"]]);
		const disabled = reconcileDatasourceStatuses(prev, [
			instance("a", false),
		]);
		expect(disabled.has("a")).toBe(false);
		const reenabled = reconcileDatasourceStatuses(disabled, [
			instance("a", true),
		]);
		expect(reenabled.get("a")).toBe("connecting");
	});

	test("returns prev when nothing changed", () => {
		const prev = new Map<string, DatasourceStatus>([["a", "ready"]]);
		expect(reconcileDatasourceStatuses(prev, [instance("a", true)])).toBe(
			prev,
		);
	});
});

describe("withDisabledStatuses", () => {
	test("reports `disabled` for a switched-off datasource", () => {
		const statuses = new Map<string, DatasourceStatus>([["on", "ready"]]);
		const out = withDisabledStatuses(statuses, [
			instance("on", true),
			instance("off", false),
		]);
		expect(out.get("off")).toBe("disabled");
		expect(out.get("on")).toBe("ready");
	});

	test("keeps identity when nothing is disabled", () => {
		const statuses = new Map<string, DatasourceStatus>([["on", "ready"]]);
		expect(withDisabledStatuses(statuses, [instance("on", true)])).toBe(
			statuses,
		);
	});

	test("disabled reads as offline to widgets (no data flows)", () => {
		expect(deriveHealth("disabled")).toBe("offline");
	});
});

describe("DatasourceStatusBadges", () => {
	test("names a disabled datasource as disabled", () => {
		const html = renderToStaticMarkup(
			<DatasourceStatusBadges
				datasources={[instance("off", false)]}
				datasourceStatuses={new Map([["off", "disabled"]])}
			/>,
		);
		expect(html).toContain("off");
		expect(html).not.toContain("animate-spin");
	});
});
