"use client"
import { useEffect, useMemo, useState } from "react";
// Replace with your actual toast import if needed
// Use alert as fallback for toast
const showToast = (msg: string) => alert(msg);
import { Responsive, WidthProvider, Layout, Layouts } from "react-grid-layout";

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ArrowLeftFromLine, ArrowUpFromLine, BombIcon, Check, Columns3, Grid3X3, LayoutGrid, LockIcon, LockOpenIcon, Rows3, Save, Square, XIcon } from "lucide-react";
import React from "react";

import { NavbarItem, NavbarProvider, useNavbar } from "@workspace/ui/combined/navbar";
import { ButtonHolderProvider, ButtonHolder } from "@workspace/ui/combined/ButtonHolder";


import { Button } from "@workspace/ui/components/button";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@workspace/ui/components/context-menu";
import { WidgetTemplateDrawer } from "../../../templates/components/templates-drawer";
import { useTemplates } from "../../../templates/templates-provider";
import { WidgetCard } from "../../../widgets/components/widget-card/widget-card";
import { WidgetsCombo } from "../../../widgets/components/widget-combo/widget-combo";
import { WidgetDefinition, Widget } from "../../../widgets/widget-interface";
import { useDashboardManager } from "../dashboard-provider";




const Dashboard = () => {

    const { widgets, updateWidget, removeWidget, addWidget, layouts, dispatch, getComponents, getDefinition, locked, lockUnLockDashboard, savesDashboard, hasChanged, forceReload, datasources, addDatasource } = useDashboardManager();

    // Cast generic layouts to react-grid-layout format
    const gridLayouts = layouts as Layouts;

    // Local state for compactType (vertical/horizontal)
    const [compactType, setCompactType] = useState<"vertical" | "horizontal" | null>(null);

    // Type-specific layout functions
    const layoutsChanged = (newLayouts: Layouts) => {
        dispatch({ type: "SET_LAYOUTS", payload: newLayouts });
    };

    const moveToVertical = () => {
        setCompactType("vertical");
        setTimeout(() => setCompactType(null), 500);
    };

    const moveToHorizontal = () => {
        setCompactType("horizontal");
        setTimeout(() => setCompactType(null), 500);
    };

    // Improved exploseLayout supporting multiple types
    type Breakpoint = "lg" | "md" | "sm" | "xs" | "xxs";
    type LayoutMatrix = { cols: number; rows: number };
    // Use forceReload and setForceReload from dashboard manager context

    const exploseLayout = (type: "custom" | "rows" | "columns" | "masonry" | "single" = "custom") => {
        if (locked) {
            showToast("Dashboard is locked. Unlock the dashboard to explode the layout");
            return;
        }

        const breakpoints: Record<Breakpoint, number> = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
        const colsperBreakpoints: Record<Breakpoint, number> = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
        const availables_matrixes: Map<Breakpoint, LayoutMatrix> = new Map([
            ["lg", { cols: 3, rows: 3 }],
            ["md", { cols: 2, rows: 3 }],
            ["sm", { cols: 2, rows: 2 }],
            ["xs", { cols: 1, rows: 2 }],
            ["xxs", { cols: 1, rows: 1 }],
        ]);

        function getOptimalMatrix(breakpoint: Breakpoint, number_of_elements: number): LayoutMatrix | undefined {
            const breakpoints_array: Breakpoint[] = ["lg", "md", "sm", "xs", "xxs"];
            const index_of_breakpoint = breakpoints_array.indexOf(breakpoint);
            const starting_index = breakpoints_array.indexOf("xxs");
            const distance_matrixes_map = new Map<Breakpoint, number>();
            for (let i = starting_index; i >= index_of_breakpoint; i--) {
                const bp = breakpoints_array[i];
                if (!bp) continue;
                const matrix = availables_matrixes.get(bp);
                if (!matrix) continue;
                const matrix_size = matrix.cols * matrix.rows;
                distance_matrixes_map.set(bp, Math.abs(matrix_size - number_of_elements));
            }
            const sorted_distance_matrixes = Array.from(distance_matrixes_map).sort((a, b) => {
                if (a[1] === b[1]) {
                    const ma = availables_matrixes.get(a[0]);
                    const mb = availables_matrixes.get(b[0]);
                    return (ma ? ma.cols * ma.rows : 0) - (mb ? mb.cols * mb.rows : 0);
                }
                return b[1] - a[1];
            });
            const best = sorted_distance_matrixes.reverse()[0];
            return best ? availables_matrixes.get(best[0]) : undefined;
        }

        // compute the current breakpoint
        const width = typeof window !== "undefined" ? window.innerWidth : 1200;
        let breakpoint: Breakpoint = "lg";
        if (width < breakpoints.lg) breakpoint = "md";
        if (width < breakpoints.md) breakpoint = "sm";
        if (width < breakpoints.sm) breakpoint = "xs";
        if (width < breakpoints.xs) breakpoint = "xxs";

        const new_layouts = { ...gridLayouts };
        const row_size_px = 30;
        const max_number_of_rows = (typeof window !== "undefined" ? (window.innerHeight * 0.9) : 900) / row_size_px;
        const optimalMatrix = getOptimalMatrix(breakpoint, widgets.size);
        const total_cols = colsperBreakpoints[breakpoint];
        const sorted_boxes = (new_layouts[breakpoint] || []).slice().sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));

        // Explosion types
        let updated;
        switch (type) {
            case "rows": {
                // Use matrix for max rows per breakpoint
                const maxRows = optimalMatrix ? optimalMatrix.rows : widgets.size;
                const rowHeight = Math.max(2, Math.floor(max_number_of_rows / maxRows));
                updated = sorted_boxes.map((box, idx) => {
                    const row = idx % maxRows;
                    const col = Math.floor(idx / maxRows);
                    return {
                        ...box,
                        x: col * total_cols,
                        y: row * rowHeight,
                        w: total_cols,
                        h: rowHeight
                    };
                });
                break;
            }
            case "columns": {
                // Use matrix for max columns per breakpoint
                const maxCols = optimalMatrix ? optimalMatrix.cols : widgets.size;
                const colWidth = Math.max(1, Math.floor(total_cols / maxCols));
                updated = sorted_boxes.map((box, idx) => {
                    const col = idx % maxCols;
                    const row = Math.floor(idx / maxCols);
                    // Last column in a row fills remaining space
                    const w = (col === maxCols - 1)
                        ? total_cols - (colWidth * (maxCols - 1))
                        : colWidth;
                    return {
                        ...box,
                        x: col * colWidth,
                        y: row,
                        w,
                        h: 1
                    };
                });
                break;
            }
            case "masonry":
                // Stagger widgets, each fills a cell in a grid
                updated = sorted_boxes.map((box, idx) => optimalMatrix ? ({
                    ...box,
                    x: idx % optimalMatrix.cols,
                    y: Math.floor(idx / optimalMatrix.cols) * 2,
                    w: Math.max(1, Math.floor(total_cols / optimalMatrix.cols)),
                    h: 2
                }) : box);
                break;
            case "single":
                // First widget fills all, others minimized
                updated = sorted_boxes.map((box, idx) => idx === 0 ? {
                    ...box,
                    x: 0,
                    y: 0,
                    w: total_cols,
                    h: Math.floor(max_number_of_rows)
                } : {
                    ...box,
                    x: total_cols - 1,
                    y: Math.floor(max_number_of_rows) - 1,
                    w: total_cols,
                    h: Math.floor(max_number_of_rows)
                });
                break;
            case "custom":
            default:
                updated = sorted_boxes.map((box, index) => {
                    if (!optimalMatrix) return box;
                    const cols = optimalMatrix.cols;
                    const row = Math.floor(index / cols);
                    const col = index % cols;
                    const col_width = Math.floor(total_cols / cols);
                    const row_height = Math.floor(max_number_of_rows / optimalMatrix.rows);
                    if (index === widgets.size - 1) {
                        const remaining_width = total_cols - (col * col_width);
                        return {
                            ...box,
                            x: col * col_width,
                            y: row * row_height,
                            w: remaining_width,
                            h: row_height
                        };
                    }
                    return {
                        ...box,
                        x: col * col_width,
                        y: row * row_height,
                        w: col_width,
                        h: row_height
                    };
                });
        }
        new_layouts[breakpoint] = updated;
        layoutsChanged(new_layouts);
    };

    const { templates, removeTemplate, updateTemplate } = useTemplates();

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    const ResponsiveGridLayout = useMemo(() => WidthProvider(Responsive) as unknown as React.FC<any>, [forceReload]);  // (improve performance from 'doc', also, juste make it works)

    const handleLayoutChange = (currentLayout: Layout[], allLayouts: Layouts) => {
        if (JSON.stringify(gridLayouts) !== JSON.stringify(allLayouts)) {
            layoutsChanged({ ...allLayouts });
        }
    }

    const handleRemoveBoxClick = (boxId: string) => {
        removeWidget(boxId);
    }

    const handleValidate = (widget: WidgetDefinition, settings: object) => {
        addWidget(widget, settings);
    }

    const handleSaveWidget = (box_id: string, widget: WidgetDefinition, settings: object) => {
        updateWidget(box_id, settings);
    }
    // Navbar setup
    useEffect(() => {
        console.log("mounting dashboard");

        return () => {
            console.log("unmounting dashboard");
        };
    }, [])

    useEffect(() => {
        setNavbarItem("right", "template_drawer",
            <WidgetTemplateDrawer
                templates={templates}
                addWidget={addWidget}
                addDatasource={addDatasource}
                removeTemplate={removeTemplate}
                updateTemplate={updateTemplate}
            />
        );

        return () => {
            removeNavbarItem("right", "template_drawer");
        }
    }, [templates, addWidget, addDatasource]);

    useEffect(() => {

        setNavbarItem("center", "widgets_combo", <WidgetsCombo onValidate={handleValidate} />);

        setNavbarItem("center", "lock_unlock",
            <Button variant={"ghost"} onClick={() => { lockUnLockDashboard(); }}>
                {!locked ? <LockIcon /> : <LockOpenIcon />}
            </Button>
        );

        setNavbarItem("center", "moveToHorizontal",
            <Button variant={"ghost"} onClick={moveToHorizontal}>
                <ArrowLeftFromLine />
            </Button>
        );

        setNavbarItem("center", "moveToVertical",
            <Button variant={"ghost"} onClick={moveToVertical}>
                <ArrowUpFromLine />
            </Button>
        );

        setNavbarItem("center", "exploseLayout",
            <ContextMenu>
                <ContextMenuTrigger>
                    <Button
                        variant={"ghost"}
                        onClick={() => exploseLayout()}
                    >
                        <BombIcon />
                    </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => exploseLayout('custom')}>
                        <Grid3X3 size={16} className="mr-2" />
                        Custom
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => exploseLayout('rows')}>
                        <Rows3 size={16} className="mr-2" />
                        Row Layout
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => exploseLayout('columns')}>
                        <Columns3 size={16} className="mr-2" />
                        Column Layout
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => exploseLayout('masonry')}>
                        <LayoutGrid size={16} className="mr-2" />
                        Masonry Layout
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => exploseLayout('single')}>
                        <Square size={16} className="mr-2" />
                        Single Layout
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        );
        setNavbarItem("center", "save",
            <Button variant={"ghost"}
                className={hasChanged ? "animate-pulse" : ""}
                style={hasChanged ? {
                    animation: "pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
                    boxShadow: "0 0 0 0 hsl(var(--primary))"
                } : {}}
                onClick={() => { savesDashboard(); }}
            >
                {hasChanged ? <Save /> : <Check />}
            </Button>
        );

        return () => {
            removeNavbarItem("center", "widgets_combo");
            removeNavbarItem("center", "lock_unlock");
            removeNavbarItem("center", "moveToHorizontal");
            removeNavbarItem("center", "moveToVertical");
            removeNavbarItem("center", "exploseLayout");
            removeNavbarItem("center", "save");
        }
    }, [locked, hasChanged, gridLayouts, widgets]);


    const widgets_elements = useMemo(() => {

        return (
            (
                Array.from(widgets).map(([key, widget]: [string, Widget]) => {
                    return (
                        <div key={key} className="flex flex-col overflow-hidden border border-border rounded-[var(--radius)] bg-background shadow-md">
                            <ButtonHolderProvider>
                                <div className='flex flex-row content-between gap-1' style={{ padding: "0.25rem" }}>
                                    <div className="p-2 text-center text-sm text-muted-foreground cursor-move w-full overflow-x-hidden drag-handle">{widget.title}</div>

                                    <ButtonHolder />

                                    {!locked && (<WidgetCard fromLoaded={true} data={widget.settings} definition={getDefinition(widget.widget_id)} displayType="gear" onValidate={(widget_def, settings) => { handleSaveWidget(widget.box_id, widget_def, settings) }} />)}

                                    {!locked && (<Button variant="destructive" onClick={() => handleRemoveBoxClick(widget.box_id)}>
                                        <XIcon />
                                    </Button>)}
                                </div>
                                <div className="flex-grow overflow-hidden">
                                    {getComponents(widget.box_id)}
                                </div>
                            </ButtonHolderProvider>
                        </div>
                    );
                })
            )
        );

    }, [widgets, datasources, locked]);

    return (
        <ResponsiveGridLayout
            className="layout"
            useCSSTransforms={true}
            margin={[2, 2]}
            layouts={gridLayouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            draggableHandle={`.drag-handle`}
            onLayoutChange={handleLayoutChange}
            preventCollision={true}
            rowHeight={30}
            compactType={compactType}
            isDraggable={!locked}
            isResizable={!locked}
        >
            {widgets_elements}
        </ResponsiveGridLayout>
    );

};

export { Dashboard };
