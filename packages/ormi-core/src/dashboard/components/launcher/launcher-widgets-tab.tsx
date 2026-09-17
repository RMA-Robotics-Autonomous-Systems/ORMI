"use client";

import React, { useMemo, useState } from "react";
import { CloudCog } from "lucide-react";

import { Input } from "@workspace/ui/components/input";
import { useAutoFocus } from "@workspace/ui/hooks/use-autofocus";
import { Separator } from "@workspace/ui/components/separator";
import { requestDatasourceConfiguration } from "@workspace/ui/components/datasource-offline";

import DatasourceAdder from "../../../datasources/components/datasource-adder";
import { NEW_DATASOURCE_TITLE } from "../../../datasources/datasource-configured";
import { WidgetCard } from "../../../widgets/components/widget-card/widget-card";
import { WidgetDefinition } from "../../../widgets/widget-interface";
import { useDashboardActions } from "../../state/use-dashboard-actions";
import {
	useDashboardRegistry,
	type WidgetGroup,
} from "../../shell/dashboard-shell";

/** Props for {@link LauncherWidgetsTab}. */
export interface LauncherWidgetsTabProps {
	/** Called once a widget has been added, so the launcher can close. */
	onAdded?: () => void;
}

/**
 * Natural, case-insensitive comparison of widget names (so "Camera 2" sorts
 * before "Camera 10").
 */
function compareByName(a: WidgetDefinition, b: WidgetDefinition): number {
	return a.name.localeCompare(b.name, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

/**
 * The full widget catalogue as an app-style grid of cards.
 *
 * Every widget is here, including the ones no topic click can reach — control
 * panels, iframes, mission panels. The Topics tab is a shortcut over this list,
 * never a replacement for it.
 *
 * The cards are fixed-width and wrap: the dialog is a fraction of the viewport,
 * so a fixed column count would either leave a gutter on a wide screen or
 * overflow a narrow one. Wrapping lets the row count follow the width the
 * dialog actually got.
 *
 * @param props - Component props.
 * @returns React element.
 */
export const LauncherWidgetsTab: React.FC<LauncherWidgetsTabProps> = ({
	onAdded,
}) => {
	const [query, setQuery] = useState("");
	// Only ever rendered inside the launcher dialog, and Radix remounts a tab
	// body on every switch — so this takes focus each time the operator lands
	// here, not just on the first open.
	const searchRef = useAutoFocus<HTMLInputElement>();
	const { widgetDefinitions, widgetGroups } = useDashboardRegistry();
	const { addWidget, addDatasource } = useDashboardActions();

	const handleValidate = (
		widget: WidgetDefinition,
		settings: Record<string, unknown>,
	) => {
		addWidget(widget, settings);
		onAdded?.();
	};

	// Filter first (so group sizes reflect what is visible), drop empty groups,
	// then order by widget count descending, tie-broken on plugin name.
	// Recomputed per render: widgetGroups is a new array on every shell render,
	// so this memo is a formality — it must never hold a stale list.
	const visibleGroups = useMemo(() => {
		const baseGroups: WidgetGroup[] =
			widgetGroups.length > 0
				? widgetGroups
				: [{ pluginName: "", widgets: widgetDefinitions }];

		const needle = query.trim().toLowerCase();

		return baseGroups
			.map((group) => ({
				pluginName: group.pluginName,
				widgets: [...group.widgets]
					.filter(
						(widget) =>
							needle === "" ||
							widget.name.toLowerCase().includes(needle) ||
							widget.description.toLowerCase().includes(needle),
					)
					.sort(compareByName),
			}))
			.filter((group) => group.widgets.length > 0)
			.sort(
				(a, b) =>
					b.widgets.length - a.widgets.length ||
					a.pluginName.localeCompare(b.pluginName),
			);
	}, [widgetGroups, widgetDefinitions, query]);

	const handleAddDatasource = (datasourceId: string) => {
		addDatasource(datasourceId);
		requestDatasourceConfiguration(NEW_DATASOURCE_TITLE);
	};

	// Every widget is gated on a datasource, so an empty registry means there is
	// none yet. Offer the datasource types on the spot rather than telling the
	// operator to go and find them.
	if (widgetDefinitions.length === 0) {
		return (
			<div className="mx-auto flex max-w-md flex-col gap-3 p-6">
				<div className="text-muted-foreground flex flex-col items-center gap-2 text-center">
					<CloudCog className="size-8 opacity-60" aria-hidden />
					<p className="text-sm">
						Widgets appear once a datasource is connected.
					</p>
				</div>
				<DatasourceAdder handleAdd={handleAddDatasource} />
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-3">
			<Input
				ref={searchRef}
				type="search"
				placeholder="Search widgets…"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				aria-label="Search widgets"
				className="max-w-sm"
			/>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{visibleGroups.length === 0 ? (
					<p className="text-muted-foreground p-6 text-center text-sm">
						No widgets match your search.
					</p>
				) : (
					<div className="flex flex-col gap-5">
						{visibleGroups.map((group, groupIndex) => (
							<section
								key={group.pluginName || groupIndex}
								className="flex min-w-0 flex-col gap-2"
							>
								{group.pluginName && (
									<div className="flex min-w-0 items-center gap-3">
										<span
											className="text-muted-foreground min-w-0 truncate text-sm font-semibold capitalize"
											title={group.pluginName}
										>
											{group.pluginName}
										</span>
										<Separator className="flex-1" />
									</div>
								)}
								<div className="flex flex-wrap gap-2">
									{group.widgets.map((widget) => (
										<WidgetCard
											key={widget.id}
											definition={widget}
											onValidate={handleValidate}
											displayType="card"
										/>
									))}
								</div>
							</section>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
