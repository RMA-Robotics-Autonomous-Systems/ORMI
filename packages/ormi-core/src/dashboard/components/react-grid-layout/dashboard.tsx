"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	ResponsiveGridLayout,
	noCompactor,
	verticalCompactor,
	horizontalCompactor,
} from "react-grid-layout";
import type { Layout, ResponsiveLayouts } from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
	ArrowLeftFromLine,
	ArrowUpFromLine,
	Check,
	Columns3,
	LayoutGrid,
	LayoutPanelLeft,
	LayoutTemplate,
	LockIcon,
	LockOpenIcon,
	Rows3,
	Save,
	XIcon,
} from "lucide-react";
import React from "react";

import { NavbarItem } from "@workspace/ui/combined/navbar";
import { ButtonHolderHost } from "@workspace/ui/combined/ButtonHolder";

import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
} from "@workspace/ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { WidgetCard } from "../../../widgets/components/widget-card/widget-card";
import { WidgetDefinition } from "../../../widgets/widget-interface";
import { DashboardEmptyState } from "../dashboard-empty-state";
import { ATTENTION_CLASS, shouldSaveCallAttention } from "../attention";
import { LayoutEngineDefinition } from "../../layout/layout-engine";
import { WidgetHost } from "../../layout/widget-host";
import { useDashboardActions } from "../../state/use-dashboard-actions";
import { useDashboardShell } from "../../shell/dashboard-shell";
import { useAtomValue } from "jotai";
import {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	hasChangedAtom,
	widgetAtomFamily,
	datasourcesAtom,
} from "../../atoms";
import {
	arrangeGrid,
	GRID_BREAKPOINTS,
	GRID_COLS,
	GRID_MARGIN_XY,
	GRID_ROW_HEIGHT,
	resolveGridBreakpoint,
	type ArrangePreset,
	type GridBreakpoint,
} from "./grid-arrange";

/**
 * Stable free-positioning compactor: items stay exactly where dropped,
 * overlapping drops are prevented, but nothing is auto-compacted.
 * Created at module level so the reference never changes between renders —
 * a new object each render would cause RGL to reset its internal drag state.
 */
const freePositionCompactor = {
	...noCompactor,
	preventCollision: true,
} as const;

/** Props for the individual grid tile. */
interface GridWidgetTileProps {
	widgetId: string;
	locked: boolean;
	getDefinition: (widgetId: string) => WidgetDefinition;
	onSave: (boxId: string, settings: Record<string, unknown>) => void;
	onRemove: (boxId: string) => void;
}

/**
 * Renders the inner content of a single GRID tile — header + widget body.
 * The outer positioning div is owned by ResponsiveGridLayout (via cloneElement)
 * and rendered directly in widgets_elements, not here.
 * Reads its own widget data from the atom family so that a settings change
 * on one widget does not propagate to other tiles.
 * Memoised — only rerenders when its own props or atom value change.
 */
const GridWidgetTileComponent: React.FC<GridWidgetTileProps> = ({
	widgetId,
	locked,
	getDefinition,
	onSave,
	onRemove,
}) => {
	const widget = useAtomValue(widgetAtomFamily(widgetId));

	if (!widget) return null;

	return (
		<>
			<div
				className="flex flex-row content-between gap-1"
				style={{ padding: "0.25rem" }}
			>
				<div className="p-2 text-center text-sm text-muted-foreground cursor-move w-full overflow-x-hidden drag-handle">
					{widget.title}
				</div>

				<ButtonHolderHost widgetId={widgetId} />

				{!locked && (
					<WidgetCard
						fromLoaded={true}
						data={widget.settings}
						definition={getDefinition(widget.widget_id)}
						displayType="gear"
						onValidate={(_widget_def, settings) => {
							onSave(widget.box_id, settings);
						}}
					/>
				)}

				{!locked && (
					<Button
						variant="destructive"
						onClick={() => onRemove(widget.box_id)}
					>
						<XIcon />
					</Button>
				)}
			</div>
			<div className="flex-grow overflow-hidden">
				<WidgetHost widgetId={widgetId} getDefinition={getDefinition} />
			</div>
		</>
	);
};

const GridWidgetTile = React.memo(GridWidgetTileComponent);
GridWidgetTile.displayName = "GridWidgetTile";

/**
 * React-grid-layout dashboard implementation.
 * @returns React element.
 */
const Dashboard = () => {
	const widgets = useAtomValue(widgetsAtom);
	const layouts = useAtomValue(layoutsAtom);
	const locked = useAtomValue(lockedAtom);
	const hasChanged = useAtomValue(hasChangedAtom);
	const datasources = useAtomValue(datasourcesAtom);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(1200);
	// Visible height of the grid area. Only read when a preset is applied, so
	// it is a ref: a height change must not re-render every tile.
	const containerHeightRef = useRef(0);

	const {
		updateWidget,
		removeWidget,
		getDefinition,
		toggleLock,
		updateLayouts,
	} = useDashboardActions();

	const { save } = useDashboardShell();

	// Track container size. The container is bounded by the application shell
	// and scrolls its own overflow, so its box is the visible grid area
	// whatever the height of the layout inside it.
	useEffect(() => {
		if (!containerRef.current) return;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				setContainerWidth(entry.contentRect.width);
				containerHeightRef.current = entry.contentRect.height;
			}
		});

		observer.observe(containerRef.current);
		setContainerWidth(containerRef.current.offsetWidth);
		containerHeightRef.current = containerRef.current.clientHeight;

		return () => observer.disconnect();
	}, []);

	// Cast generic layouts to react-grid-layout format
	// Grid engine stores its layout state under the "grid" key
	const gridLayouts = (layouts["grid"] as ResponsiveLayouts) || {};

	// Tracks the last serialized grid layout written to the atom.
	// Null until the first write so we don't pay JSON.stringify on every render
	// just to initialize the ref.
	const lastGridLayoutRef = useRef<string | null>(null);

	// Type-specific layout functions
	const layoutsChanged = useCallback(
		(newLayouts: ResponsiveLayouts) => {
			// Functional updater: prev is read atomically inside the setter so
			// this callback never needs to close over the layouts atom value.
			updateLayouts((prev) => ({ ...prev, grid: newLayouts }));
		},
		[updateLayouts],
	);

	// Immediately apply vertical compaction to the current layouts and persist.
	// Using the v2 built-in compactor directly avoids the old setTimeout/state
	// trick that never actually compacted anything (compact fn was a no-op).
	const moveToVertical = useCallback(() => {
		const compacted: ResponsiveLayouts = {};
		for (const [bp, bpLayout] of Object.entries(gridLayouts)) {
			const cols = GRID_COLS[bp as GridBreakpoint] ?? 12;
			compacted[bp] = verticalCompactor.compact(bpLayout as Layout, cols);
		}
		layoutsChanged(compacted);
	}, [gridLayouts, layoutsChanged]);

	const moveToHorizontal = useCallback(() => {
		const compacted: ResponsiveLayouts = {};
		for (const [bp, bpLayout] of Object.entries(gridLayouts)) {
			const cols = GRID_COLS[bp as GridBreakpoint] ?? 12;
			compacted[bp] = horizontalCompactor.compact(
				bpLayout as Layout,
				cols,
			);
		}
		layoutsChanged(compacted);
	}, [gridLayouts, layoutsChanged]);

	// Applies a preset to the breakpoint the grid is showing, and only that
	// one. The breakpoint comes from the same width the grid is given, so the
	// two cannot disagree.
	const arrangeLayout = useCallback(
		(preset: ArrangePreset) => {
			if (locked) {
				toast.error(
					"Dashboard is locked. Unlock it to arrange widgets.",
				);
				return;
			}

			const breakpoint = resolveGridBreakpoint(containerWidth);
			layoutsChanged({
				...gridLayouts,
				[breakpoint]: arrangeGrid({
					preset,
					widgetIds: Array.from(widgets.keys()),
					layout: gridLayouts[breakpoint] ?? [],
					cols: GRID_COLS[breakpoint],
					width: containerWidth,
					height: containerHeightRef.current,
				}),
			});
		},
		[containerWidth, gridLayouts, layoutsChanged, locked, widgets],
	);

	const handleLayoutChange = useCallback(
		(currentLayout: Layout, allLayouts: ResponsiveLayouts) => {
			const serialized = JSON.stringify(allLayouts);
			if (serialized !== lastGridLayoutRef.current) {
				lastGridLayoutRef.current = serialized;
				layoutsChanged(allLayouts);
			}
		},
		[layoutsChanged],
	);

	const handleRemoveBoxClick = useCallback(
		(boxId: string) => {
			removeWidget(boxId);
		},
		[removeWidget],
	);

	const handleSaveWidget = useCallback(
		(boxId: string, settings: Record<string, unknown>) => {
			updateWidget(boxId, settings);
		},
		[updateWidget],
	);

	const lockLabel = locked ? "Unlock dashboard" : "Lock dashboard";

	// Only the next required step is cued; see shouldSaveCallAttention.
	const savePulses = shouldSaveCallAttention({
		hasChanged,
		datasourceCount: datasources.size,
		widgetCount: widgets.size,
	});

	const widgets_elements = useMemo(() => {
		return Array.from(widgets.keys()).map((widgetId) => (
			// This plain div is the direct child of ResponsiveGridLayout.
			// RGL uses cloneElement to inject style (absolute position/size),
			// className (drag/resize states), and ref onto it.
			// GridWidgetTile is nested inside and owns only the header + body.
			<div
				key={widgetId}
				className="flex flex-col overflow-hidden border border-border rounded-[var(--radius)] bg-background shadow-md"
			>
				<GridWidgetTile
					widgetId={widgetId}
					locked={locked}
					getDefinition={getDefinition}
					onSave={handleSaveWidget}
					onRemove={handleRemoveBoxClick}
				/>
			</div>
		));
	}, [
		widgets,
		locked,
		getDefinition,
		handleSaveWidget,
		handleRemoveBoxClick,
	]);

	return (
		<>
			<NavbarItem id="lock_unlock" zone="center">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={"ghost"}
							aria-label={lockLabel}
							onClick={toggleLock}
						>
							{!locked ? (
								<LockIcon aria-hidden />
							) : (
								<LockOpenIcon aria-hidden />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{lockLabel}</TooltipContent>
				</Tooltip>
			</NavbarItem>
			<NavbarItem id="moveToHorizontal" zone="center">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={"ghost"}
							aria-label="Compact widgets to the left"
							onClick={moveToHorizontal}
						>
							<ArrowLeftFromLine aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Compact widgets to the left</TooltipContent>
				</Tooltip>
			</NavbarItem>
			<NavbarItem id="moveToVertical" zone="center">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={"ghost"}
							aria-label="Compact widgets to the top"
							onClick={moveToVertical}
						>
							<ArrowUpFromLine aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Compact widgets to the top</TooltipContent>
				</Tooltip>
			</NavbarItem>
			<NavbarItem id="arrangeLayout" zone="center">
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									variant={"ghost"}
									aria-label="Arrange widgets with a layout preset"
								>
									Arrange <LayoutTemplate aria-hidden />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent>
							Re-arrange every widget with a layout preset
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="center">
						<DropdownMenuLabel>Layout preset</DropdownMenuLabel>
						<DropdownMenuItem onClick={() => arrangeLayout("grid")}>
							<LayoutGrid
								size={16}
								className="mr-2"
								aria-hidden
							/>
							Grid
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => arrangeLayout("columns")}
						>
							<Columns3 size={16} className="mr-2" aria-hidden />
							Columns
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => arrangeLayout("rows")}>
							<Rows3 size={16} className="mr-2" aria-hidden />
							Rows
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => arrangeLayout("focus")}
						>
							<LayoutPanelLeft
								size={16}
								className="mr-2"
								aria-hidden
							/>
							Focus
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</NavbarItem>
			<NavbarItem id="save" zone="center">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={"ghost"}
							aria-label={
								hasChanged
									? "Save dashboard"
									: "Dashboard saved"
							}
							className={savePulses ? ATTENTION_CLASS : undefined}
							onClick={save}
						>
							{hasChanged ? (
								<Save aria-hidden />
							) : (
								<Check aria-hidden />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{hasChanged ? "Save dashboard" : "No unsaved changes"}
					</TooltipContent>
				</Tooltip>
			</NavbarItem>
			{/* The shell bounds this box to the visible area and clips the page,
			    so a layout taller than it scrolls here or not at all. */}
			<div
				ref={containerRef}
				style={{
					width: "100%",
					height: "100%",
					overflowX: "hidden",
					overflowY: "auto",
				}}
			>
				{widgets.size === 0 ? (
					<DashboardEmptyState hasDatasource={datasources.size > 0} />
				) : (
					<ResponsiveGridLayout
						width={containerWidth}
						className="layout"
						margin={GRID_MARGIN_XY}
						layouts={gridLayouts}
						breakpoints={GRID_BREAKPOINTS}
						cols={GRID_COLS}
						dragConfig={{
							enabled: !locked,
							handle: `.drag-handle`,
						}}
						resizeConfig={{
							enabled: !locked,
						}}
						onLayoutChange={handleLayoutChange}
						compactor={freePositionCompactor}
						rowHeight={GRID_ROW_HEIGHT}
					>
						{widgets_elements}
					</ResponsiveGridLayout>
				)}
			</div>
		</>
	);
};

export { Dashboard };

/** Layout engine definition for plugin registration. */
export const gridEngineDefinition: LayoutEngineDefinition = {
	id: "GRID",
	name: "Grid Layout",
	description: "Traditional grid-based dashboard with resizable widgets",
	badge: "Classic",
	layoutKey: "grid",
	Component: Dashboard,
};

// GridWidgetContent removed — now using canonical WidgetHost
