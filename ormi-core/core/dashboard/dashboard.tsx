"use client";
import { useState } from "react";
import { useDashboardManager } from "./dashboard-provider";
import { Responsive, WidthProvider, Layout, Layouts } from "react-grid-layout";
import { GearIcon, Cross1Icon } from "@radix-ui/react-icons"

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import style from "./dashboard.module.css";
import { Button } from "@/components/ui/button";
import { Widget, WidgetDefinition } from "../widgets/widget-interface";
import WidgetCard from "../widgets/components/widget-card/widget-card";

const Dashboard = () => {

    const { widgets, updateWidget, layouts, setLayouts, getComponents, getDefinition } = useDashboardManager();

    const ResponsiveGridLayout = WidthProvider(Responsive);

    const [previousLayout, setPreviousLayout] = useState<Layout[]>();

    const getCurrentBreakpoint = (width: number) => {
        if (width > 1200) {
            return 'lg';
        } else if (width > 996) {
            return 'md';
        } else if (width > 768) {
            return 'sm';
        } else if (width > 480) {
            return 'xs';
        } else {
            return 'xxs';
        }
    }

    const handleLayoutsChange = (currentLayout: Layout[], allLayouts: Layouts) => {

        // get the current breakpoint
        const currentBreakpoint = getCurrentBreakpoint(window.innerWidth);

        // update the layout
        // setLayouts({
        //     ...layouts,
        //     [currentBreakpoint]: currentLayout
        // });
    }

    const handleRemoveBoxClick = (boxId: string, e: React.MouseEvent<HTMLButtonElement, HTMLElement>) => {
        console.log(`Remove Box ${boxId}`);
    }

    const handleSaveWidget = (box_id: string, widget: WidgetDefinition, settings: object) => {
        console.log("box_id", box_id);
        console.log("Widget selected", widget);
        console.log("Widget settings", settings);

        updateWidget(box_id, settings);
    }

    return (
        <ResponsiveGridLayout
            className="layout"
            useCSSTransforms={true}
            margin={[2, 2]}
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            draggableHandle={`.${style.dragHandle}`}
            onLayoutChange={handleLayoutsChange}
            preventCollision={true}
            rowHeight={30}
            compactType={null}
        >
            {Array.from(widgets.values()).map((widget: Widget) => {
                return (
                    <div key={widget.box_id} className={style.widget + " shadow-md"}>
                        <div className='flex flex-row content-between gap-1'>
                            <div className={style.dragHandle}>{widget.title}</div>
                            <WidgetCard data={widget.settings} definition={getDefinition(widget.widget_id)} displayGear={true} onValidate={(widget_def, settings) => { handleSaveWidget(widget.box_id, widget_def, settings) }} />

                            <Button variant="destructive" onClick={(e) => handleRemoveBoxClick(widget.box_id, e)}>
                                <Cross1Icon />
                            </Button>
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