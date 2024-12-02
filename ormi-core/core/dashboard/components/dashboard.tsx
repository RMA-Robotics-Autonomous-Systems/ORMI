"use client";
import { useEffect, useMemo } from "react";
import { useDashboardManager } from '@/core/dashboard/components/dashboard-provider';
import { Responsive, WidthProvider, Layout, Layouts } from "react-grid-layout";
import { Cross1Icon, LockClosedIcon, LockOpen1Icon } from "@radix-ui/react-icons"

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import style from "./dashboard.module.css";
import { Button } from "@/components/ui/button";
import { Widget, WidgetDefinition } from "@/core/widgets/widget-interface";
import WidgetCard from "@/core/widgets/components/widget-card/widget-card";
import { useNavbar } from "@/components/advanced/navbar/navbar-provider";
import { WidgetsCombo } from "@/core/widgets/components/widget-combo/widget-combo";
import { ArrowLeftFromLine, ArrowUpFromLine, Check, Save } from "lucide-react";

const Dashboard = () => {

    const { widgets, updateWidget, removeWidget, addWidget, layouts, layoutsChanged, getComponents, getDefinition, locked, lockUnLockDashboard, savesDashboard, hasChanged, compactType, moveToHorizontal, moveToVertical } = useDashboardManager();

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    const ResponsiveGridLayout = useMemo(() => WidthProvider(Responsive), []);  // (improve performance from 'doc', also, juste make it works)

    const handleLayoutChange = (currentLayout: Layout[], allLayouts: Layouts) => {
        if (JSON.stringify(layouts) !== JSON.stringify(allLayouts)) {
            layoutsChanged({ ...allLayouts });
        }
    }

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

        setNavbarItem("center", "widgets_combo", <WidgetsCombo onValidate={handleValidate} />);

        setNavbarItem("center", "lock_unlock",
            <Button variant={"ghost"} onClick={() => { lockUnLockDashboard(); }}>
                {!locked ? <LockOpen1Icon /> : <LockClosedIcon />}
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
            removeNavbarItem("center", "save");
        }

    }, [locked, hasChanged, layouts, widgets]);

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
            {Array.from(widgets).map(([key, widget]: [string, Widget]) => {
                return (
                    <div key={key} className={style.widget + " shadow-md"}>
                        <div className='flex flex-row content-between gap-1' style={{ padding: "0.25rem" }}>
                            <div className={style.dragHandle}>{widget.title}</div>

                            {!locked && (<WidgetCard data={widget.settings} definition={getDefinition(widget.widget_id)} displayType="gear" onValidate={(widget_def, settings) => { handleSaveWidget(widget.box_id, widget_def, settings) }} />)}

                            {!locked && (<Button className="m-4" variant="destructive" onClick={() => handleRemoveBoxClick(widget.box_id)}>
                                <Cross1Icon />
                            </Button>)}
                        </div>
                        <div className={style.content}>
                            {getComponents(widget.box_id)}
                        </div>
                    </div>
                );
            })}

        </ResponsiveGridLayout>
    );

};

export default Dashboard;