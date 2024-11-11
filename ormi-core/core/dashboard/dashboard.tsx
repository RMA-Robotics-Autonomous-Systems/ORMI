"use client";
import { use, useEffect, useState } from "react";
import { useDashboardManager } from "./dashboard-provider";
import { Responsive, WidthProvider, Layout, Layouts } from "react-grid-layout";

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import style from "./dashboard.module.css";

const Dashboard = () => {

    const [currentBreakpoint, setCurrentBreakpoint] = useState<string>('lg');
    const dashboardManager = useDashboardManager();
    const ResponsiveGridLayout = WidthProvider(Responsive);

    const handleLayoutsChange = (currentLayout: Layout[], allLayouts: Layouts) => {
        console.log(currentLayout);
        console.log(allLayouts);

        const current_breakpoint = Object.keys(allLayouts).find((key) => allLayouts[key] === currentLayout);
        console.log(current_breakpoint);

        setCurrentBreakpoint(current_breakpoint || 'lg');
    }

    const handleRemoveBoxClick = (boxId: string, e: any) => {
        e.preventDefault();
        console.log(`Remove Box ${boxId}`);
    }


    return (
        <ResponsiveGridLayout
            className="layout"
            layouts={dashboardManager.definition.layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            draggableHandle={`.${style.dragHandle}`}
            onLayoutChange={handleLayoutsChange}
            preventCollision={true}
            rowHeight={30}
            compactType={null}
        >
            {dashboardManager.definition.layouts[currentBreakpoint]?.map((box: Layout) => {
                return (
                    <div key={box.i} className={style.box}>
                        <div key={box.i} data-grid={box} className={"flex flex-col border"}>
                            <div className='flex flex-row content-between border-p-1'>
                                <div className={style.dragHandle}>sds</div>
                                <button onClick={(e) => handleRemoveBoxClick(box.i, e)}>
                                    x
                                </button>
                            </div>
                            <div className={style.content}>
                                {dashboardManager.getComponents(box.i)}
                            </div>
                        </div>
                    </div>
                );
            })}

        </ResponsiveGridLayout>
    );

};

export default Dashboard;