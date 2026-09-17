"use client";

import { useCallback, useMemo } from "react";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";

import { DatasourceTopic } from "../../datasources/datasource-interface";
import {
	applyTopicToSettings,
	createWidgetSettings,
	getTopicRoutingIndex,
	type RoutingOption,
} from "../../widgets/topic-routing";
import {
	getTopicClaimIndex,
	type TopicClaimIndex,
	type TopicRoutingClaims,
} from "../../widgets/topic-claims";
import { Widget } from "../../widgets/widget-interface";
import { widgetsAtom } from "../atoms";
import { useDashboardRegistry } from "../shell/dashboard-shell";
import { useDashboardActions } from "./use-dashboard-actions";

/**
 * Everything a topic-first surface needs to decide where a topic goes and to
 * put it there.
 *
 * Assembled once per render so a list of rows can be memoised against a single
 * reference instead of a dozen props.
 */
export interface TopicRouting {
	/**
	 * Plugin-contributed claims, already resolved against the current widget
	 * registry — the whole of what routing decides from.
	 */
	claims: TopicClaimIndex;
	/** Widgets currently on the dashboard, by box id. */
	widgets: Map<string, Widget>;
	/** Apply a routing option and offer an undo. */
	route: (option: RoutingOption, topic: DatasourceTopic) => void;
}

/**
 * Put a topic where a routing option says it goes, and offer to take it back.
 *
 * Both branches are a single state write, so undo is exact: restore the
 * previous settings for an append, remove the widget that was just created for
 * a create. Nothing here is best-effort — an operator who mis-clicks a topic on
 * a live robot gets back the dashboard they had.
 *
 * Shared by every topic-first surface (the launcher's Topics tab, the topics-list
 * widget) so "click a topic" means the same thing, with the same undo, wherever
 * it is clicked.
 *
 * @returns The routing context.
 */
export function useTopicRouter(): TopicRouting {
	const pluginsManager = usePluginsManager();
	const { widgetDefinitions } = useDashboardRegistry();
	const { addWidget, updateWidget, removeWidget, getDefinition } =
		useDashboardActions();
	const widgets = useAtomValue(widgetsAtom);

	// Memoised on definition content — DashboardShell resolves WIDGETS_LIST in
	// its render body, so the array and its definitions are new every render.
	const index = getTopicRoutingIndex(widgetDefinitions);

	const declared = useMemo(
		() =>
			pluginsManager.applyFilter<TopicRoutingClaims>(
				PluginsHooks.TOPIC_ROUTING_CLAIMS,
				[],
			),
		[pluginsManager],
	);

	// Resolved against the registry here rather than at every call site: a
	// claim naming a widget this build does not ship is dropped once, with one
	// warning, instead of on every topic row.
	const claims = getTopicClaimIndex(declared, index);

	const route = useCallback(
		(option: RoutingOption, topic: DatasourceTopic) => {
			if (option.kind === "append" && option.boxId) {
				const boxId = option.boxId;
				const target = widgets.get(boxId);
				if (!target) return;
				// An append is by construction an array slot, so this cannot
				// be a slotless claim — but the type no longer proves it, and
				// a silent non-return here would look like a click that did
				// nothing.
				if (!option.slot) return;
				const definition = getDefinition(target.widget_id);
				const previous = target.settings;
				const { settings } = applyTopicToSettings(
					previous,
					option.slot,
					topic,
					definition.schema,
				);
				updateWidget(boxId, settings);
				const pending = option.slot.requiresCompanions;
				toast.success(
					`${topic.topic} added to ${option.instanceTitle || option.widgetName}`,
					{
						...(pending.length === 0
							? {}
							: {
									description: `Open its settings to choose ${pending.join(" and ")}.`,
								}),
						action: {
							label: "Undo",
							onClick: () => updateWidget(boxId, previous),
						},
					},
				);
				return;
			}

			const definition = getDefinition(option.widgetId);
			const slot = option.slot;

			// A widget that discovers its own topics has nothing to bind: it
			// polls for every topic of the type across every datasource. It is
			// created from its defaults, and the toast says what it will show
			// rather than claiming a topic was placed in it.
			if (!slot) {
				const boxId = addWidget(
					definition,
					createWidgetSettings(definition) as never,
				);
				toast.success(
					`${option.widgetName} opened — it shows ${topic.topic} with every other topic of its kind`,
					{
						action: {
							label: "Undo",
							onClick: () => removeWidget(boxId),
						},
					},
				);
				return;
			}

			const { settings } = applyTopicToSettings(
				createWidgetSettings(definition),
				slot,
				topic,
				definition.schema,
			);
			const boxId = addWidget(definition, settings);
			const missing = slot.requiresCompanions;
			toast.success(
				option.direction === "publish"
					? `${option.widgetName} added — it commands ${topic.topic}`
					: `${topic.topic} opened in ${option.widgetName}`,
				{
					...(missing.length === 0
						? {}
						: {
								description: `Open its settings to choose ${missing.join(" and ")}.`,
							}),
					action: {
						label: "Undo",
						onClick: () => removeWidget(boxId),
					},
				},
			);
		},
		[addWidget, getDefinition, removeWidget, updateWidget, widgets],
	);

	return useMemo(
		() => ({ claims, widgets, route }),
		[claims, widgets, route],
	);
}
