"use client";
import { useEffect, useMemo, useRef } from "react";
import { useDashboardManager } from "./components/dashboard-provider";
import { Responsive, WidthProvider, Layout, Layouts } from "react-grid-layout";
import { Cross1Icon, LockClosedIcon, LockOpen1Icon } from "@radix-ui/react-icons"

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import style from "./dashboard.module.css";
import { Button } from "@/components/ui/button";
import { Widget, WidgetDefinition } from "../widgets/widget-interface";
import WidgetCard from "../widgets/components/widget-card/widget-card";
import { useNavbar } from "@/components/advanced/navbar/navbar-provider";
import { NavigationMenuItem } from "@/components/ui/navigation-menu";
import { WidgetsCombo } from "../widgets/components/widget-combo/widget-combo";

const Dashboard = () => {

    const { widgets, updateWidget, removeWidget, layouts, layoutsChanged, getComponents, getDefinition, locked, lockUnLockDashboard } = useDashboardManager();

    const { setNavbarItem } = useNavbar();

    const ResponsiveGridLayout = useRef(WidthProvider(Responsive)).current;

    const handleLayoutChange = (currentLayout: Layout[], allLayouts: Layouts) => {
        if (JSON.stringify(layouts) !== JSON.stringify(allLayouts)) {
            console.log("Layout changed", allLayouts);
            layoutsChanged({ ...allLayouts });
        }
    }

    const widgetsHTML = useMemo(() => {

        const handleRemoveBoxClick = (boxId: string) => {
            removeWidget(boxId);
        }

        const handleSaveWidget = (box_id: string, widget: WidgetDefinition, settings: object) => {
            updateWidget(box_id, settings);
        }

        return Array.from(widgets.values()).map((widget: Widget) => {
            return (
                <div key={widget.box_id} className={style.widget + " shadow-md"}>
                    <div className='flex flex-row content-between gap-1'>
                        <div className={style.dragHandle}>{widget.title}</div>

                        <WidgetCard data={widget.settings} definition={getDefinition(widget.widget_id)} displayType="gear" onValidate={(widget_def, settings) => { handleSaveWidget(widget.box_id, widget_def, settings) }} />

                        <Button variant="destructive" onClick={() => handleRemoveBoxClick(widget.box_id)}>
                            <Cross1Icon />
                        </Button>
                    </div>
                    <div className={style.content}>
                        {getComponents(widget.box_id)}
                    </div>
                </div>
            );
        });
    }, [widgets, removeWidget, updateWidget, getDefinition, getComponents]);

    useEffect(() => {

        setNavbarItem("center", "widgets_combo", <WidgetsCombo />);
        setNavbarItem("center", "lock_unlock",
            <Button variant={"ghost"} onClick={() => { lockUnLockDashboard(); }}>
                {!locked ? <LockOpen1Icon /> : <LockClosedIcon />}
            </Button>
        );

    }, [locked]);

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
            compactType={null}
            isDraggable={!locked}
            isResizable={!locked}
        >
            {widgetsHTML}

        </ResponsiveGridLayout>
    );

};

export default Dashboard;