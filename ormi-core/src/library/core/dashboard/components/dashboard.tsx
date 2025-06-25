"use client"
import { useEffect, useMemo, useState } from "react";
import { useDashboardManager } from '@/library/core/dashboard/components/dashboard-provider';
import { Responsive, WidthProvider, Layout, Layouts } from "react-grid-layout";

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import style from "./dashboard.module.css";
import { Button } from "ormi-components";
import { Widget, WidgetDefinition } from "@/library/core/widgets/widget-interface";
import { WidgetCard } from "@/library/core/widgets/components/widget-card/widget-card";
import { useNavbar } from "ormi-components";
import { WidgetsCombo } from "@/library/core/widgets/components/widget-combo/widget-combo";
import { ArrowLeftFromLine, ArrowUpFromLine, BombIcon, Check, Columns3, Grid3X3, LayoutGrid, LockIcon, LockOpenIcon, Rows3, Save, Square, XIcon } from "lucide-react";
import { ButtonHolderProvider, ButtonHolder } from "ormi-components";
import { WidgetTemplateDrawer } from "@/library/core/templates/components/templates-drawer";
import { useTemplates } from "@/library/core/templates/templates-provider";
import React from "react";


import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "ormi-components"

const Dashboard = () => {

    const { widgets, updateWidget, removeWidget, addWidget, layouts, layoutsChanged, getComponents, getDefinition, locked, lockUnLockDashboard, savesDashboard, hasChanged, compactType, moveToHorizontal, moveToVertical, exploseLayout, forceReload, datasources } = useDashboardManager();

    const { templates, removeTemplate } = useTemplates();

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    const ResponsiveGridLayout = useMemo(() => WidthProvider(Responsive) as unknown as React.FC<any>, [forceReload]);  // (improve performance from 'doc', also, juste make it works)

    const handleLayoutChange = (currentLayout: Layout[], allLayouts: Layouts) => {
        if (JSON.stringify(layouts) !== JSON.stringify(allLayouts)) {
            layoutsChanged({ ...allLayouts });
        }
    }

    const handleLayoutSelect = (layoutType: string) => {
        // You can implement the logic here
        console.log('Selected layout:', layoutType);
    };

    const handleRemoveBoxClick = (boxId: string) => {
        removeWidget(boxId);
    }

    const handleSaveWidget = (box_id: string, widget: WidgetDefinition, settings: object) => {
        updateWidget(box_id, settings);
    }

    const handleValidate = (widget: WidgetDefinition, settings: object) => {
        addWidget(widget, settings);
    }


    useEffect(() => {
        setNavbarItem("right", "template_drawer",
            <WidgetTemplateDrawer templates={templates} addWidget={addWidget} removeTemplate={removeTemplate} />
        );

        return () => {
            removeNavbarItem("right", "template_drawer");
        }
    }, [templates]);

    useEffect(() => {

        setNavbarItem("center", "widgets_combo", <WidgetsCombo onValidate={handleValidate} />);

        setNavbarItem("center", "lock_unlock",
            <Button variant={"ghost"} onClick={() => { lockUnLockDashboard(); }}>
                {!locked ? <LockIcon /> : <LockOpenIcon />}
            </Button>
        );

        setNavbarItem("center", "moveToHorizontal",
            <Button variant={"ghost"} onClick={() => { moveToHorizontal() }}>
                <ArrowLeftFromLine />
            </Button>
        );

        setNavbarItem("center", "moveToVertical",
            <Button variant={"ghost"} onClick={() => { moveToVertical() }}>
                <ArrowUpFromLine />
            </Button>
        );

        setNavbarItem("center", "exploseLayout",
            <ContextMenu>
                <ContextMenuTrigger>
                    <Button
                        variant={"ghost"}
                        onClick={() => { exploseLayout() }}
                    >
                        <BombIcon />
                    </Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => handleLayoutSelect('custom')}>
                        <Grid3X3 size={16} className="mr-2" />
                        Custom
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleLayoutSelect('rows')}>
                        <Rows3 size={16} className="mr-2" />
                        Row Layout
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleLayoutSelect('columns')}>
                        <Columns3 size={16} className="mr-2" />
                        Column Layout
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleLayoutSelect('masonry')}>
                        <LayoutGrid size={16} className="mr-2" />
                        Masonry Layout
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleLayoutSelect('single')}>
                        <Square size={16} className="mr-2" />
                        Single Layout
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        );

        setNavbarItem("center", "save",
            <Button variant={"ghost"} onClick={() => { savesDashboard(); }}>
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

    }, [locked, hasChanged, layouts, widgets]);


    const widgets_elements = useMemo(() => {

        return (
            (
                Array.from(widgets).map(([key, widget]: [string, Widget]) => {
                    return (
                        <div key={key} className={style.widget + " shadow-md"}>
                            <ButtonHolderProvider>
                                <div className='flex flex-row content-between gap-1' style={{ padding: "0.25rem" }}>
                                    <div className={style.dragHandle}>{widget.title}</div>

                                    <ButtonHolder />

                                    {!locked && (<WidgetCard fromLoaded={true} data={widget.settings} definition={getDefinition(widget.widget_id)} displayType="gear" onValidate={(widget_def, settings) => { handleSaveWidget(widget.box_id, widget_def, settings) }} />)}

                                    {!locked && (<Button variant="destructive" onClick={() => handleRemoveBoxClick(widget.box_id)}>
                                        <XIcon />
                                    </Button>)}
                                </div>
                                <div className={style.content}>
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
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            draggableHandle={`.${style.dragHandle}`}
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