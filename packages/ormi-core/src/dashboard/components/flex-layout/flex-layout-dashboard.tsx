"use client";

import React, { useRef } from "react";
import { Layout, TabNode, ITabRenderValues } from "flexlayout-react";

import { useDashboardActions } from "../../state/use-dashboard-actions";
import { useDashboardShell } from "../../shell/dashboard-shell";
import { useAtomValue } from "jotai";
import {
	widgetsAtom,
	lockedAtom,
	hasChangedAtom,
	layoutsAtom,
	datasourcesAtom,
} from "../../atoms";
import { DashboardEmptyState } from "../dashboard-empty-state";
import { useFlexLayoutModel } from "./hooks/useFlexLayoutModel";
import { useWidgetFactory } from "./hooks/useWidgetFactory";
import { usePanelMotion } from "./hooks/usePanelMotion";
import { renderTab } from "./components/TabRenderer";
import { NavbarIntegration } from "./components/NavbarIntegration";
import { FlexLayoutPortalProvider } from "./components/FlexLayoutPortalContext";
import { LayoutEngineDefinition } from "../../layout/layout-engine";

import "flexlayout-react/style/light.css";
import "@workspace/ormi-core/flex-layout-theme.css";
import { Spinner } from "@workspace/ui/components/spinner";
import { Layers } from "lucide-react";

/**
 * FlexLayout dashboard implementation.
 * @returns React element.
 */
const FlexLayoutDashboard = () => {
	const widgets = useAtomValue(widgetsAtom);
	const locked = useAtomValue(lockedAtom);
	const hasChanged = useAtomValue(hasChangedAtom);
	const layouts = useAtomValue(layoutsAtom);
	const datasources = useAtomValue(datasourcesAtom);

	const {
		removeWidget,
		updateWidget,
		updateLayouts,
		getDefinition,
		toggleLock,
	} = useDashboardActions();

	const { save } = useDashboardShell();

	const layoutRef = useRef<Layout>(null);

	// Panel motion (FLIP on the real panels; see panel-motion.ts) and the tab
	// strip indicator (tab-indicator.ts).
	const { areaRef, captureBefore, captureBeforeTabSelect, onRenderTabSet } =
		usePanelMotion();

	// Core FlexLayout integration - hook handles all model management
	const { model, onModelChange, onAction } = useFlexLayoutModel({
		widgets,
		layouts,
		locked,
		getDefinition,
		removeWidget,
		updateLayouts,
		onBeforeLayoutChange: captureBefore,
		onBeforeTabSelect: captureBeforeTabSelect,
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
			{/* Fills what the navbar leaves. `max-h-full` bounds it inside the
			    workspace app shell, where the parent has a definite height; on
			    a plugin page (a scrolling document, indefinite parent) the
			    percentage is ignored and the 3rem desktop navbar, plus the
			    inset a floating navbar adds above it (`--navbar-inset`,
			    globals.css), is taken off the viewport instead. `96dvh`
			    under a 48px bar overflowed both by 8px. */}
			<div className="w-full h-[calc(100dvh_-_3rem_-_var(--navbar-inset))] max-h-full flex flex-col">
				{/* Navbar integration */}
				<NavbarIntegration
					locked={locked}
					hasChanged={hasChanged}
					onLockToggle={toggleLock}
					onSave={save}
				/>

				{/* Main FlexLayout. `ormi-frame` / `ormi-frame__area`
				    (flex-layout-theme.css) carry the outer half of the
				    gutter and the optional outline around the panel area. */}
				<div className="ormi-frame flex-1 min-h-0">
					<div
						ref={areaRef}
						className="ormi-frame__area w-full h-full relative"
					>
						{/* Resolves the motion tokens to numbers
						    (flex-layout-theme.css, `.ormi-motion-metrics`). */}
						<div className="ormi-motion-metrics" aria-hidden />
						{widgets.size === 0 ? (
							<DashboardEmptyState
								hasDatasource={datasources.size > 0}
							/>
						) : (
							<Layout
								ref={layoutRef}
								model={model}
								factory={factory}
								onAction={onAction}
								onModelChange={onModelChange}
								onRenderTab={onRenderTab}
								onRenderTabSet={onRenderTabSet}
							/>
						)}
					</div>
				</div>
			</div>
		</FlexLayoutPortalProvider>
	);
};

export { FlexLayoutDashboard };

/** Layout engine definition for plugin registration. */
export const flexLayoutEngineDefinition: LayoutEngineDefinition = {
	id: "FLEX",
	name: "Flex Layout",
	description: "Advanced flexible layout with popout windows support",
	icon: React.createElement(Layers, { size: 16 }),
	badge: "Default",
	layoutKey: "flex",
	Component: FlexLayoutDashboard,
};
