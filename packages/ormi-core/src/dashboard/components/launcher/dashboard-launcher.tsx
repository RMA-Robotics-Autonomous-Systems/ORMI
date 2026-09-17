"use client";

import React, { useCallback, useState } from "react";
import { useAtomValue } from "jotai";
import { BookMarked, LayoutGrid, ListTree, Plus } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";

import { datasourcesAtom, widgetsAtom } from "../../atoms";
import { TopicsPanel } from "../topic-list/topics-panel";
import { shouldCallAttention } from "./launcher-attention";
import {
	LAUNCHER_TABS,
	readStoredLauncherTab,
	storeLauncherTab,
	type LauncherTab,
} from "./launcher-tabs";
import { LauncherWidgetsTab } from "./launcher-widgets-tab";
import { LauncherTemplatesTab } from "./launcher-templates-tab";

/** Icon and label for each tab, in display order. */
const TAB_META: Record<
	LauncherTab,
	{ label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
	topics: { label: "Topics", Icon: ListTree },
	widgets: { label: "Widgets", Icon: LayoutGrid },
	templates: { label: "Templates", Icon: BookMarked },
};

/**
 * How the button looks while it is the one thing left to do.
 *
 * The halo-and-swell is the same vocabulary the navbar's `Datasources` button
 * uses for the step before this one, so an operator learns "this is what the
 * product asking for something looks like" exactly once — but it is spelled as
 * utilities over the shared keyframes rather than the inline `style` with a
 * hardcoded `boxShadow` that button carries, which cannot be themed and cannot
 * be turned off.
 *
 * `motion-safe:` is what turns it off: with `prefers-reduced-motion: reduce`
 * the animation is never applied, and the state is carried instead by the two
 * static halves — full opacity (the idle button sits at 70% so the dashboard
 * under it stays readable) and a primary ring. Both survive the animation
 * being dropped, so a reduced-motion console still shows the operator where to
 * go; a signal that exists only as movement is no signal at all for them.
 *
 * The ring is deliberately outside the button rather than a change of fill:
 * the label and icon keep their contrast, and `pulse-scale` peaks at 1.05, so
 * the hit target never moves far enough to be missed by a click already on its
 * way.
 */
const ATTENTION_CLASS =
	"opacity-100 ring-2 ring-primary/60 ring-offset-2 ring-offset-background motion-safe:animate-[pulse-bg_0.7s_infinite,pulse-scale_0.7s_infinite]";

/**
 * The one way onto a dashboard: a floating action button and the dialog it
 * opens.
 *
 * Topics, Widgets and Templates are tabs of a single dialog rather than three
 * places, so "put something on this dashboard" is one gesture whichever of the
 * three the operator is thinking in. It is neither a widget nor a page, and
 * both exclusions are load-bearing: a widget lives in `WIDGETS_LIST`, which
 * resolves to `[]` while no datasource is configured — it would be blanked at
 * exactly the cold start where it is the only thing to do — and a page would
 * have to be navigated to, which destroys the click-and-watch-it-appear feel
 * that is the whole point.
 *
 * **Nothing here touches the dashboard record.** Whether the dialog is open,
 * which tab it shows and what has been typed into a search box are properties
 * of the person looking, not of the workspace. Persisting any of them — into
 * `layouts`, the widgets map, or anything else the persistence layer watches —
 * makes merely opening the panel an unsaved change, and the dashboard then asks
 * to be saved when nothing about it changed. The remembered tab lives in
 * `localStorage` instead; see `launcher-tabs.ts`.
 *
 * The button asks for itself while it is the only step left — see
 * {@link shouldCallAttention} for when, and {@link ATTENTION_CLASS} for how.
 *
 * Renders absolutely inside the dashboard surface, so it must be placed in a
 * positioned ancestor (`DashboardEngine` provides it).
 *
 * @returns React element.
 */
export const DashboardLauncher: React.FC = () => {
	const [open, setOpen] = useState(false);

	// Read straight from the dashboard atoms, as every other surface in this
	// tree does: the counts are already in the store the `<Provider>` binds, so
	// this is a subscription, not a second source of truth to keep in step.
	const datasources = useAtomValue(datasourcesAtom);
	const widgets = useAtomValue(widgetsAtom);

	const callsAttention = shouldCallAttention({
		datasourceCount: datasources.size,
		widgetCount: widgets.size,
	});

	// Read once, on mount: re-reading would let a second tab of the same
	// browser move this one's tab out from under the operator.
	const [tab, setTab] = useState<LauncherTab>(readStoredLauncherTab);

	const close = useCallback(() => setOpen(false), []);

	const selectTab = useCallback((value: string) => {
		const next = value as LauncherTab;
		setTab(next);
		storeLauncherTab(next);
	}, []);

	// The Topics footer names the widget catalogue as where everything a topic
	// cannot open is added; inside the dialog that is one tab away, so it is a
	// link rather than a direction. Remembered like any other tab change, so
	// following it and reopening lands where the operator left off.
	const showWidgets = useCallback(() => selectTab("widgets"), [selectTab]);

	return (
		<>
			{/* The wrapper is inert: only the button takes pointer events, so
			    the surface it floats over loses exactly the button's footprint
			    and not a corner of it. The 1.5rem inset — not the button's
			    size — is what clears the things the layout engines anchor in
			    that corner: the grid engine's 20px resize handle on the last
			    tile, and the attribution strip map widgets put there. The
			    button grows up and to the left, away from both, so its
			    diameter is free to follow the thumb rather than the corner.
			    The idle opacity keeps whatever is underneath readable. */}
			<div className="pointer-events-none absolute right-6 bottom-6 z-20">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							aria-label="Add to this dashboard"
							className={cn(
								"pointer-events-auto size-14 rounded-full opacity-70 shadow-lg transition-opacity hover:opacity-100 focus-visible:opacity-100",
								callsAttention && ATTENTION_CLASS,
							)}
							onClick={() => setOpen(true)}
						>
							<Plus className="size-6" aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="left">
						Add to this dashboard
					</TooltipContent>
				</Tooltip>
			</div>

			<Dialog open={open} onOpenChange={setOpen}>
				{/* An explicit height, not a max: the tabs scroll inside
				    themselves, so the dialog must not resize between a
				    three-topic robot and a hundred-topic one. */}
				<DialogContent
					size="large"
					className="h-[80dvh] grid-rows-[auto_minmax(0,1fr)]"
				>
					<DialogHeader>
						<DialogTitle>Add to this dashboard</DialogTitle>
						<DialogDescription>
							Click a live topic, pick a panel, or reuse something
							you saved.
						</DialogDescription>
					</DialogHeader>

					<Tabs
						value={tab}
						onValueChange={selectTab}
						className="flex min-h-0 flex-col"
					>
						<TabsList className="w-fit">
							{LAUNCHER_TABS.map((value) => {
								const { label, Icon } = TAB_META[value];
								return (
									<TabsTrigger key={value} value={value}>
										<Icon aria-hidden />
										{label}
									</TabsTrigger>
								);
							})}
						</TabsList>

						{/* `min-h-0` on every pane: without it the flex item
						    floors at its content height and a 113-topic list
						    grows the dialog instead of scrolling inside it. */}
						<TabsContent
							value="topics"
							className="min-h-0 overflow-hidden"
						>
							<TopicsPanel
								onRouted={close}
								onShowWidgets={showWidgets}
								autoFocusSearch
							/>
						</TabsContent>
						<TabsContent
							value="widgets"
							className="min-h-0 overflow-hidden"
						>
							<LauncherWidgetsTab onAdded={close} />
						</TabsContent>
						<TabsContent
							value="templates"
							className="min-h-0 overflow-hidden"
						>
							<LauncherTemplatesTab />
						</TabsContent>
					</Tabs>
				</DialogContent>
			</Dialog>
		</>
	);
};
