"use client";

/**
 * Dialog for selecting and configuring widgets.
 */

import { useMemo, useState } from "react";

import { Plus } from "lucide-react"; // Import the plus icon

import { WidgetCard } from "../widget-card/widget-card";

import { WidgetDefinition } from "../../widget-interface";
import { useDashboardActions } from "./../../../dashboard";
import type { WidgetGroup } from "./../../../dashboard";
import { useAtomValue } from "jotai";
import { lockedAtom } from "./../../../dashboard";

import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import style from "./widgets-dialog.module.css";

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
 * Floating dialog to add widgets to the dashboard.
 *
 * Widgets are grouped by the plugin that contributed them (provenance-based),
 * natural-sorted alphabetically within each group, and filterable via a search
 * box that matches both the widget name and description (case-insensitive).
 *
 * @param props - Component props.
 * @param props.widgetDefinitions - Flat list of widget definitions. Used as a
 * fallback when `widgetGroups` is not provided (rendered as a single, unnamed
 * group).
 * @param props.widgetGroups - Widget definitions grouped by contributing plugin.
 * Preferred over `widgetDefinitions` when present.
 * @returns React element.
 */
export function WidgetsDialog(props: {
	widgetDefinitions: WidgetDefinition[];
	widgetGroups?: WidgetGroup[];
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");

	const { widgetDefinitions, widgetGroups } = props;
	const { addWidget } = useDashboardActions();
	const locked = useAtomValue(lockedAtom);

	const handleValidate = (
		widget: WidgetDefinition,
		settings: Record<string, unknown>,
	) => {
		addWidget(widget, settings);
		setIsOpen(false); // close the dialog
	};

	// Normalize to groups: fall back to a single unnamed group from the flat list.
	// Within each group, widgets are natural-sorted by name. The search filter is
	// applied first (so group sizes reflect what's visible), empty groups are
	// dropped, then groups are ordered by widget count descending, tie-broken
	// alphabetically by plugin name ascending.
	const visibleGroups = useMemo(() => {
		const baseGroups: WidgetGroup[] =
			widgetGroups && widgetGroups.length > 0
				? widgetGroups
				: [{ pluginName: "", widgets: widgetDefinitions }];

		const needle = query.trim().toLowerCase();

		return baseGroups
			.map((group) => {
				const widgets = [...group.widgets]
					.filter(
						(widget) =>
							needle === "" ||
							widget.name.toLowerCase().includes(needle) ||
							widget.description.toLowerCase().includes(needle),
					)
					.sort(compareByName);
				return { pluginName: group.pluginName, widgets };
			})
			.filter((group) => group.widgets.length > 0)
			.sort(
				(a, b) =>
					b.widgets.length - a.widgets.length ||
					a.pluginName.localeCompare(b.pluginName),
			);
	}, [widgetGroups, widgetDefinitions, query]);

	const hasResults = visibleGroups.some((group) => group.widgets.length > 0);
	const hasAnyWidgets =
		(widgetGroups?.some((group) => group.widgets.length > 0) ?? false) ||
		widgetDefinitions.length > 0;

	return (
		!locked && (
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button
						className={style.floatingButton}
						onClick={() => setIsOpen(true)}
					>
						<Plus size={32} />{" "}
						{/* Increase the size of the plus icon */}
					</Button>
				</DialogTrigger>
				<DialogContent size="large">
					<DialogHeader>
						<DialogTitle>Widgets</DialogTitle>
						<DialogDescription>
							Select a widget to add to the dashboard
						</DialogDescription>
					</DialogHeader>
					<div className={style.groups_container}>
						{hasResults ? (
							visibleGroups.map((group, groupIndex) => (
								<section
									key={group.pluginName || groupIndex}
									className={style.group}
								>
									{group.pluginName && (
										<div className={style.group_header}>
											<span className={style.group_title}>
												{group.pluginName}
											</span>
											<Separator
												className={
													style.group_separator
												}
											/>
										</div>
									)}
									<div className={style.group_cards}>
										{group.widgets.map((widget) => (
											<WidgetCard
												key={widget.id}
												definition={widget}
												onValidate={handleValidate}
											/>
										))}
									</div>
								</section>
							))
						) : (
							<div className={style.emptyState}>
								<p>
									{hasAnyWidgets
										? "No widgets match your search."
										: "No widgets available. Please add and connect a datasource first."}
								</p>
							</div>
						)}
					</div>
					<div className={style.search_footer}>
						<Input
							type="search"
							placeholder="Search widgets…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className={style.search_input}
						/>
					</div>
				</DialogContent>
			</Dialog>
		)
	);
}
