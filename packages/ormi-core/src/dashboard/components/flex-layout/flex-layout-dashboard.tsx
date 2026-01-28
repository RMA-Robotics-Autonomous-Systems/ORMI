"use client";

import React, { useRef } from "react";
import { Layout, TabNode, ITabRenderValues } from "flexlayout-react";

import { useDashboardActions } from "../dashboard-provider";
import { useAtomValue } from "jotai";
import {
	widgetsAtom,
	lockedAtom,
	hasChangedAtom,
	layoutsAtom,
} from "../../atoms";
import { useFlexLayoutModel } from "./hooks/useFlexLayoutModel";
import { useWidgetFactory } from "./hooks/useWidgetFactory";
import { renderTab } from "./components/TabRenderer";
import { NavbarIntegration } from "./components/NavbarIntegration";
import { FlexLayoutPortalProvider } from "./components/FlexLayoutPortalContext";

import "flexlayout-react/style/light.css";
import "@workspace/ormi-core/flex-layout-theme.css";
import { Spinner } from "@workspace/ui/components/spinner";

/**
 * FlexLayout Dashboard
 *
 * Focused solely on FlexLayout integration with the ORMI dashboard system.
 * Uses custom hooks for model management and widget rendering.
 */
const FlexLayoutDashboard = () => {
	const widgets = useAtomValue(widgetsAtom);
	const locked = useAtomValue(lockedAtom);
	const hasChanged = useAtomValue(hasChangedAtom);
	const layouts = useAtomValue(layoutsAtom);

	const {
		addWidget,
		removeWidget,
		updateWidget,
		addDatasource,
		updateLayouts,
		getDefinition,
		lockUnLockDashboard,
		savesDashboard,
		dispatch,
	} = useDashboardActions();

	const layoutRef = useRef<Layout>(null);

	// Core FlexLayout integration - hook handles all model management
	const { model, onModelChange, onAction } = useFlexLayoutModel({
		widgets,
		layouts,
		locked,
		getDefinition,
		dispatch,
		removeWidget,
		updateLayouts,
	});
	const factory = useWidgetFactory({ widgets, getDefinition });

	// Custom tab rendering - no useCallback to avoid stale closure
	const onRenderTab = (node: TabNode, renderValues: ITabRenderValues) => {
		renderTab({
			node,
			renderValues,
			widgets,
			getDefinition,
			locked,
			onUpdateWidget: updateWidget,
		});
	};

	if (!model) {
		return (
			<div className="w-full h-full flex items-center justify-center text-muted-foreground">
				<Spinner />
			</div>
		);
	}

	return (
		<FlexLayoutPortalProvider>
			<div className="w-full h-[96dvh] flex flex-col">
				{/* Navbar integration */}
				<NavbarIntegration
					locked={locked}
					hasChanged={hasChanged}
					onLockToggle={lockUnLockDashboard}
					onSave={savesDashboard}
					onAddWidget={addWidget}
					onAddDatasource={addDatasource}
				/>

				{/* Main FlexLayout */}
				<div className="flex-1 p-1.5 pt-0">
					<div className="w-full h-full relative">
						<Layout
							ref={layoutRef}
							model={model}
							factory={factory}
							onAction={onAction}
							onModelChange={onModelChange}
							onRenderTab={onRenderTab}
						/>
					</div>
				</div>
			</div>
		</FlexLayoutPortalProvider>
	);
};

export { FlexLayoutDashboard };
