"use client";

import {
	PluginsHooks,
	Plugin,
	PluginFilter,
	type PageDefinition,
} from "@workspace/ormi-plugins";
import type {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "@workspace/ormi-core/datasources";
import {
	addMapTypeArray,
	addTopicTypeFilter,
	mapMarkerComponent,
	EmiReplayDatasourceDefinition,
	bagFileRendererDefinition,
	emiPageDefinition,
} from "./export";

/**
 * Teodor EMI: the robot's sensor, end to end.
 *
 * Three surfaces, all specific to this robot and this sensor:
 *
 * - **Map types** extend the standard map widget so EMI topics can be plotted
 *   on any dashboard.
 * - **A replay datasource** presents a recorded `.db3` as a live source, which
 *   is what lets the same page work offline and online without two code paths.
 * - **A page** (`/plugin-pages/teodor-emi`) hosting the detection cockpit.
 */
class TeodorEMIPlugin extends Plugin {
	constructor() {
		super();

		this.name = "Teodor EMI Plugin";
		this.description =
			"EMI sensor support for Teodor: map visualisation, recording replay as a datasource, and the detection cockpit.";
		this.version = "1.1.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		// ── Map extensions (standard map widget) ──────────────────────────
		const mapTypeFilter = {
			id: this.name + "-map-type-filter",
			priority: 10,
			filter: addMapTypeArray,
		} as PluginFilter;

		const mapTopicTypeFilter = {
			id: this.name + "-map-topic-type-filter",
			priority: 10,
			filter: addTopicTypeFilter,
		} as PluginFilter;

		const mapMarkerComponentFilter = {
			id: this.name + "-map-marker-component-filter",
			priority: 10,
			filter: mapMarkerComponent,
		} as PluginFilter;

		this.addFilter("std-widgets-map-type", mapTypeFilter);
		this.addFilter(
			"std-widgets-map-topic-available-type",
			mapTopicTypeFilter,
		);
		this.addFilter("std-widgets-map-components", mapMarkerComponentFilter);

		// ── The replay datasource ─────────────────────────────────────────
		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: this.name + "-replay-datasource",
			priority: 10,
			filter: (
				datasources: DatasourceDefinition<DatasourceProviderSettings>[],
			) => {
				datasources.push(
					EmiReplayDatasourceDefinition as unknown as DatasourceDefinition<DatasourceProviderSettings>,
				);
				return datasources;
			},
		});

		// The `.db3` picker on that datasource's settings form.
		this.addFilter(PluginsHooks.JSON_FORMS_RENDERER, {
			id: this.name + "-bag-file-renderer",
			priority: 10,
			filter: (renderers: unknown[]) => {
				renderers.push(bagFileRendererDefinition);
				return renderers;
			},
		});

		// ── The cockpit panels ────────────────────────────────────────────
		// NOT registered here. The panels are contributed by the cockpit page
		// itself, for the lifetime of that page — see
		// `page/emi-mission-page.tsx`. A plugin that pushes onto WIDGETS_LIST
		// from its constructor offers its widgets to every workspace in the
		// app, and ten EMI panels in the picker of a dashboard that will never
		// have an EMI run behind it is ten wrong answers.

		// ── The page ──────────────────────────────────────────────────────
		this.addFilter(PluginsHooks.PAGES_LIST, {
			id: this.name + "-page",
			priority: 10,
			filter: (pages: PageDefinition[]) => {
				pages.push(emiPageDefinition);
				return pages;
			},
		});
	}
}

export default TeodorEMIPlugin;
