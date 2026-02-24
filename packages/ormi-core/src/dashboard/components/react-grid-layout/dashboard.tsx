"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ResponsiveGridLayout } from "react-grid-layout";
import type { LayoutItem, Layout, ResponsiveLayouts } from "react-grid-layout";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
	ArrowLeftFromLine,
	ArrowUpFromLine,
	BombIcon,
	Check,
	Columns3,
	Grid3X3,
	LayoutGrid,
	LockIcon,
	LockOpenIcon,
	Rows3,
	Save,
	Square,
	XIcon,
} from "lucide-react";
import React from "react";

import {
	NavbarItem,
	NavbarProvider,
	useNavbar,
} from "@workspace/ui/combined/navbar";
import {
	ButtonHolderProvider,
	ButtonHolder,
} from "@workspace/ui/combined/ButtonHolder";

import { Button } from "@workspace/ui/components/button";
import {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
} from "@workspace/ui/components/context-menu";
import { WidgetTemplateDrawer } from "../../../templates/components/templates-drawer";
import { useTemplates } from "../../../templates/templates-provider";
import { WidgetCard } from "../../../widgets/components/widget-card/widget-card";
import { WidgetsCombo } from "../../../widgets/components/widget-combo/widget-combo";
import { WidgetDefinition, Widget } from "../../../widgets/widget-interface";
import { LayoutEngineDefinition } from "../../layout/layout-engine";
import { WidgetHost } from "../../layout/widget-host";
import { useDashboardActions } from "../../state/use-dashboard-actions";
import {
	useDashboardShell,
	useDashboardRegistry,
} from "../../shell/dashboard-shell";
import { useAtomValue } from "jotai";
import {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	hasChangedAtom,
	widgetAtomFamily,
} from "../../atoms";

/**
 * React-grid-layout dashboard implementation.
 * @returns React element.
 */
const Dashboard = () => {
	const widgets = useAtomValue(widgetsAtom);
	const layouts = useAtomValue(layoutsAtom);
	const locked = useAtomValue(lockedAtom);
	const hasChanged = useAtomValue(hasChangedAtom);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(1200);

	const {
		updateWidget,
		removeWidget,
		addWidget,
		getDefinition,
		toggleLock,
		addDatasource,
		updateLayouts,
	} = useDashboardActions();

	const { save } = useDashboardShell();
	const { widgetDefinitions } = useDashboardRegistry();

	// Track container width
	useEffect(() => {
		if (!containerRef.current) return;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				setContainerWidth(entry.contentRect.width);
			}
		});

		observer.observe(containerRef.current);
		setContainerWidth(containerRef.current.offsetWidth);

		return () => observer.disconnect();
	}, []);

	// Cast generic layouts to react-grid-layout format
	const gridLayouts = layouts as ResponsiveLayouts;

	// Local state for compactType (vertical/horizontal)
	const [compactType, setCompactType] = useState<
		"vertical" | "horizontal" | null
	>(null);

	// Type-specific layout functions
	const layoutsChanged = useCallback(
		(newLayouts: ResponsiveLayouts) => {
			updateLayouts(newLayouts);
		},
		[updateLayouts],
	);

	const moveToVertical = useCallback(() => {
		setCompactType("vertical");
		setTimeout(() => setCompactType(null), 500);
	}, []);

	const moveToHorizontal = useCallback(() => {
		setCompactType("horizontal");
		setTimeout(() => setCompactType(null), 500);
	}, []);

	// Improved exploseLayout supporting multiple types
	type Breakpoint = "lg" | "md" | "sm" | "xs" | "xxs";
	type LayoutMatrix = { cols: number; rows: number };

	const exploseLayout = useCallback(
		(
			type:
				| "custom"
				| "rows"
				| "columns"
				| "masonry"
				| "single" = "custom",
		) => {
			if (locked) {
				toast.error(
					"Dashboard is locked. Unlock the dashboard to explode the layout",
				);
				return;
			}

			const breakpoints: Record<Breakpoint, number> = {
				lg: 1200,
				md: 996,
				sm: 768,
				xs: 480,
				xxs: 0,
			};
			const colsperBreakpoints: Record<Breakpoint, number> = {
				lg: 12,
				md: 10,
				sm: 6,
				xs: 4,
				xxs: 2,
			};
			const availables_matrixes: Map<Breakpoint, LayoutMatrix> = new Map([
				["lg", { cols: 3, rows: 3 }],
				["md", { cols: 2, rows: 3 }],
				["sm", { cols: 2, rows: 2 }],
				["xs", { cols: 1, rows: 2 }],
				["xxs", { cols: 1, rows: 1 }],
			]);

			function getOptimalMatrix(
				breakpoint: Breakpoint,
				number_of_elements: number,
			): LayoutMatrix | undefined {
				const breakpoints_array: Breakpoint[] = [
					"lg",
					"md",
					"sm",
					"xs",
					"xxs",
				];
				const index_of_breakpoint =
					breakpoints_array.indexOf(breakpoint);
				const starting_index = breakpoints_array.indexOf("xxs");
				const distance_matrixes_map = new Map<Breakpoint, number>();
				for (let i = starting_index; i >= index_of_breakpoint; i--) {
					const bp = breakpoints_array[i];
					if (!bp) continue;
					const matrix = availables_matrixes.get(bp);
					if (!matrix) continue;
					const matrix_size = matrix.cols * matrix.rows;
					distance_matrixes_map.set(
						bp,
						Math.abs(matrix_size - number_of_elements),
					);
				}
				const sorted_distance_matrixes = Array.from(
					distance_matrixes_map,
				).sort((a, b) => {
					if (a[1] === b[1]) {
						const ma = availables_matrixes.get(a[0]);
						const mb = availables_matrixes.get(b[0]);
						return (
							(ma ? ma.cols * ma.rows : 0) -
							(mb ? mb.cols * mb.rows : 0)
						);
					}
					return b[1] - a[1];
				});
				const best = sorted_distance_matrixes.reverse()[0];
				return best ? availables_matrixes.get(best[0]) : undefined;
			}

			// compute the current breakpoint
			const width =
				typeof window !== "undefined" ? window.innerWidth : 1200;
			let breakpoint: Breakpoint = "lg";
			if (width < breakpoints.lg) breakpoint = "md";
			if (width < breakpoints.md) breakpoint = "sm";
			if (width < breakpoints.sm) breakpoint = "xs";
			if (width < breakpoints.xs) breakpoint = "xxs";

			const new_layouts = { ...gridLayouts };
			const row_size_px = 30;
			const max_number_of_rows =
				(typeof window !== "undefined"
					? window.innerHeight * 0.9
					: 900) / row_size_px;
			const optimalMatrix = getOptimalMatrix(breakpoint, widgets.size);
			const total_cols = colsperBreakpoints[breakpoint];
			const sorted_boxes = (new_layouts[breakpoint] || [])
				.slice()
				.sort(
					(a: LayoutItem, b: LayoutItem) =>
						a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y),
				);

			// Explosion types
			let updated;
			switch (type) {
				case "rows": {
					// Use matrix for max rows per breakpoint
					const maxRows = optimalMatrix
						? optimalMatrix.rows
						: widgets.size;
					const rowHeight = Math.max(
						2,
						Math.floor(max_number_of_rows / maxRows),
					);
					updated = sorted_boxes.map(
						(box: LayoutItem, idx: number) => {
							const row = idx % maxRows;
							const col = Math.floor(idx / maxRows);
							return {
								...box,
								x: col * total_cols,
								y: row * rowHeight,
								w: total_cols,
								h: rowHeight,
							};
						},
					);
					break;
				}
				case "columns": {
					// Use matrix for max columns per breakpoint
					const maxCols = optimalMatrix
						? optimalMatrix.cols
						: widgets.size;
					const colWidth = Math.max(
						1,
						Math.floor(total_cols / maxCols),
					);
					updated = sorted_boxes.map(
						(box: LayoutItem, idx: number) => {
							const col = idx % maxCols;
							const row = Math.floor(idx / maxCols);
							// Last column in a row fills remaining space
							const w =
								col === maxCols - 1
									? total_cols - colWidth * (maxCols - 1)
									: colWidth;
							return {
								...box,
								x: col * colWidth,
								y: row,
								w,
								h: 1,
							};
						},
					);
					break;
				}
				case "masonry":
					// Stagger widgets, each fills a cell in a grid
					updated = sorted_boxes.map(
						(box: LayoutItem, idx: number) =>
							optimalMatrix
								? {
										...box,
										x: idx % optimalMatrix.cols,
										y:
											Math.floor(
												idx / optimalMatrix.cols,
											) * 2,
										w: Math.max(
											1,
											Math.floor(
												total_cols / optimalMatrix.cols,
											),
										),
										h: 2,
									}
								: box,
					);
					break;
				case "single":
					// First widget fills all, others minimized
					updated = sorted_boxes.map(
						(box: LayoutItem, idx: number) =>
							idx === 0
								? {
										...box,
										x: 0,
										y: 0,
										w: total_cols,
										h: Math.floor(max_number_of_rows),
									}
								: {
										...box,
										x: total_cols - 1,
										y: Math.floor(max_number_of_rows) - 1,
										w: total_cols,
										h: Math.floor(max_number_of_rows),
									},
					);
					break;
				case "custom":
				default:
					updated = sorted_boxes.map(
						(box: LayoutItem, index: number) => {
							if (!optimalMatrix) return box;
							const cols = optimalMatrix.cols;
							const row = Math.floor(index / cols);
							const col = index % cols;
							const col_width = Math.floor(total_cols / cols);
							const row_height = Math.floor(
								max_number_of_rows / optimalMatrix.rows,
							);
							if (index === widgets.size - 1) {
								const remaining_width =
									total_cols - col * col_width;
								return {
									...box,
									x: col * col_width,
									y: row * row_height,
									w: remaining_width,
									h: row_height,
								};
							}
							return {
								...box,
								x: col * col_width,
								y: row * row_height,
								w: col_width,
								h: row_height,
							};
						},
					);
			}
			new_layouts[breakpoint] = updated;
			layoutsChanged(new_layouts);
		},
		[gridLayouts, layoutsChanged, locked, widgets.size],
	);

	const { templates, removeTemplate, updateTemplate } = useTemplates();

	const { setNavbarItem, removeNavbarItem } = useNavbar();

	const handleLayoutChange = useCallback(
		(currentLayout: Layout, allLayouts: ResponsiveLayouts) => {
			if (JSON.stringify(gridLayouts) !== JSON.stringify(allLayouts)) {
				layoutsChanged({ ...allLayouts });
			}
		},
		[gridLayouts, layoutsChanged],
	);

	const handleRemoveBoxClick = useCallback(
		(boxId: string) => {
			removeWidget(boxId);
		},
		[removeWidget],
	);

	const handleValidate = useCallback(
		(widget: WidgetDefinition, settings: Record<string, unknown>) => {
			addWidget(widget, settings);
		},
		[addWidget],
	);

	const handleSaveWidget = useCallback(
		(
			box_id: string,
			widget: WidgetDefinition,
			settings: Record<string, unknown>,
		) => {
			updateWidget(box_id, settings);
		},
		[updateWidget],
	);

	const onLockToggleRef = useRef(toggleLock);
	const onSaveRef = useRef(save);

	useEffect(() => {
		onLockToggleRef.current = toggleLock;
		onSaveRef.current = save;
	}, [toggleLock, save]);

	useEffect(() => {
		setNavbarItem(
			"right",
			"template_drawer",
			<WidgetTemplateDrawer
				templates={templates}
				addWidget={addWidget}
				addDatasource={addDatasource}
				removeTemplate={removeTemplate}
				updateTemplate={updateTemplate}
			/>,
		);

		return () => {
			removeNavbarItem("right", "template_drawer");
		};
	}, [
		templates,
		addWidget,
		addDatasource,
		removeTemplate,
		updateTemplate,
		setNavbarItem,
		removeNavbarItem,
	]);

	useEffect(() => {
		setNavbarItem(
			"center",
			"widgets_combo",
			<WidgetsCombo
				widgetDefinitions={widgetDefinitions}
				onValidate={handleValidate}
			/>,
		);

		setNavbarItem(
			"center",
			"lock_unlock",
			<Button
				variant={"ghost"}
				onClick={() => {
					onLockToggleRef.current();
				}}
			>
				{!locked ? <LockIcon /> : <LockOpenIcon />}
			</Button>,
		);

		setNavbarItem(
			"center",
			"moveToHorizontal",
			<Button variant={"ghost"} onClick={moveToHorizontal}>
				<ArrowLeftFromLine />
			</Button>,
		);

		setNavbarItem(
			"center",
			"moveToVertical",
			<Button variant={"ghost"} onClick={moveToVertical}>
				<ArrowUpFromLine />
			</Button>,
		);

		setNavbarItem(
			"center",
			"exploseLayout",
			<ContextMenu>
				<ContextMenuTrigger>
					<Button variant={"ghost"} onClick={() => exploseLayout()}>
						<BombIcon />
					</Button>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onClick={() => exploseLayout("custom")}>
						<Grid3X3 size={16} className="mr-2" />
						Custom
					</ContextMenuItem>
					<ContextMenuItem onClick={() => exploseLayout("rows")}>
						<Rows3 size={16} className="mr-2" />
						Row Layout
					</ContextMenuItem>
					<ContextMenuItem onClick={() => exploseLayout("columns")}>
						<Columns3 size={16} className="mr-2" />
						Column Layout
					</ContextMenuItem>
					<ContextMenuItem onClick={() => exploseLayout("masonry")}>
						<LayoutGrid size={16} className="mr-2" />
						Masonry Layout
					</ContextMenuItem>
					<ContextMenuItem onClick={() => exploseLayout("single")}>
						<Square size={16} className="mr-2" />
						Single Layout
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>,
		);
		setNavbarItem(
			"center",
			"save",
			<Button
				variant={"ghost"}
				className={hasChanged ? "animate-pulse" : ""}
				style={
					hasChanged
						? {
								animation:
									"pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
								boxShadow: "0 0 0 0 hsl(var(--primary))",
							}
						: {}
				}
				onClick={() => {
					onSaveRef.current();
				}}
			>
				{hasChanged ? <Save /> : <Check />}
			</Button>,
		);

		return () => {
			removeNavbarItem("center", "widgets_combo");
			removeNavbarItem("center", "lock_unlock");
			removeNavbarItem("center", "moveToHorizontal");
			removeNavbarItem("center", "moveToVertical");
			removeNavbarItem("center", "exploseLayout");
			removeNavbarItem("center", "save");
		};
	}, [
		locked,
		hasChanged,
		moveToHorizontal,
		moveToVertical,
		exploseLayout,
		handleValidate,
		setNavbarItem,
		removeNavbarItem,
	]);

	const widgets_elements = useMemo(() => {
		return Array.from(widgets).map(([key, widget]: [string, Widget]) => {
			return (
				<div
					key={key}
					className="flex flex-col overflow-hidden border border-border rounded-[var(--radius)] bg-background shadow-md"
				>
					<ButtonHolderProvider>
						<div
							className="flex flex-row content-between gap-1"
							style={{ padding: "0.25rem" }}
						>
							<div className="p-2 text-center text-sm text-muted-foreground cursor-move w-full overflow-x-hidden drag-handle">
								{widget.title}
							</div>

							<ButtonHolder />

							{!locked && (
								<WidgetCard
									fromLoaded={true}
									data={widget.settings}
									definition={getDefinition(widget.widget_id)}
									displayType="gear"
									onValidate={(widget_def, settings) => {
										handleSaveWidget(
											widget.box_id,
											widget_def,
											settings,
										);
									}}
								/>
							)}

							{!locked && (
								<Button
									variant="destructive"
									onClick={() =>
										handleRemoveBoxClick(widget.box_id)
									}
								>
									<XIcon />
								</Button>
							)}
						</div>
						<div className="flex-grow overflow-hidden">
							<WidgetHost
								widgetId={widget.box_id}
								getDefinition={getDefinition}
							/>
						</div>
					</ButtonHolderProvider>
				</div>
			);
		});
	}, [
		widgets,
		locked,
		getDefinition,
		handleSaveWidget,
		handleRemoveBoxClick,
	]);

	return (
		<div ref={containerRef} style={{ width: "100%", height: "100%" }}>
			<ResponsiveGridLayout
				width={containerWidth}
				className="layout"
				margin={[2, 2]}
				layouts={gridLayouts}
				breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
				cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
				dragConfig={{
					enabled: !locked,
					handle: `.drag-handle`,
				}}
				resizeConfig={{
					enabled: !locked,
				}}
				onLayoutChange={handleLayoutChange}
				compactor={{
					type: compactType,
					allowOverlap: false,
					preventCollision: true,
					compact: (layout, cols) => layout, // Placeholder
				}}
				rowHeight={30}
			>
				{widgets_elements}
			</ResponsiveGridLayout>
		</div>
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
