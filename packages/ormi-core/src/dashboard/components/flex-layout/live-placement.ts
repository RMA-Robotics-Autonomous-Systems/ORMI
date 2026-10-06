import { Actions, DockLocation } from "flexlayout-react";
import type { IJsonRowNode, IJsonTabNode, Model } from "flexlayout-react";

import {
	measureFlexLayoutPanels,
	planNewTab,
	type PanelSize,
} from "./widget-placement";

/**
 * Add widget tabs to the FlexLayout model that is on screen, in place.
 *
 * The placement rules are {@link planNewTab}'s (the same as `placeNewTabs`);
 * what differs is how the result is applied. Each tab is added with a
 * FlexLayout action on the live model, so every existing node keeps its
 * identity and no widget already on the dashboard is remounted. Building a new
 * model from JSON instead remounts all of them, which restarts anything that
 * holds a connection (see `planNewTab`).
 *
 * A maximized panel is restored first, since it would hide whatever is added.
 *
 * @param model - The live model. Mutated through `doAction`.
 * @param tabs - Tabs to add, in order. Each is placed against the layout the
 * previous one produced.
 * @param sizes - Measured panel sizes by node id. Defaults to the model's own
 * rects; a model that has never been rendered has none, and then every split
 * is allowed.
 * @returns The tabs that could not be placed in place, because the layout has
 * no tabset to dock against. Empty when everything was added.
 */
export function addTabsToModel(
	model: Model,
	tabs: IJsonTabNode[],
	sizes: Record<string, PanelSize> = measureFlexLayoutPanels(model),
): IJsonTabNode[] {
	if (tabs.length === 0) return [];

	const maximized = model.getMaximizedTabset();
	if (maximized) model.doAction(Actions.maximizeToggle(maximized.getId()));

	// A working copy: a split invalidates its target's measurement.
	const working = { ...sizes };

	for (let index = 0; index < tabs.length; index++) {
		const tab = tabs[index]!;
		const json = model.toJson();
		const plan = planNewTab(json.layout as IJsonRowNode, {
			sizes: working,
			rootOrientationVertical: json.global?.rootOrientationVertical,
		});

		if (plan.kind === "rebuild") return tabs.slice(index);

		if (plan.kind === "stack") {
			model.doAction(
				Actions.addNode(
					tab,
					plan.tabsetId,
					DockLocation.CENTER,
					-1,
					true,
				),
			);
			continue;
		}

		delete working[plan.tabsetId];
		model.doAction(
			Actions.addNode(
				tab,
				plan.tabsetId,
				plan.sideBySide ? DockLocation.RIGHT : DockLocation.BOTTOM,
				-1,
				true,
			),
		);
	}

	return [];
}
