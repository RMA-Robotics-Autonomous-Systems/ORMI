"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import DockLayout, {
	LayoutData,
	PanelData,
	TabData,
	LayoutBase,
	TabBase,
} from "rc-dock";
import "rc-dock/dist/rc-dock.css";
import "@workspace/ormi-core/rc-dock-theme.css";

import { useDashboardActions } from "../../state/use-dashboard-actions";
import { useDashboardShell } from "../../shell/dashboard-shell";
import { useAtomValue } from "jotai";
import {
	widgetsAtom,
	layoutsAtom,
	lockedAtom,
	hasChangedAtom,
} from "../../atoms";
import { WidgetHost } from "../../layout/widget-host";
import { LayoutEngineDefinition } from "../../layout/layout-engine";
import { useNavbar } from "@workspace/ui/combined/navbar";
import { Button } from "@workspace/ui/components/button";
import { useTemplates } from "../../../templates/templates-provider";
import { WidgetTemplateDrawer } from "../../../templates/components/templates-drawer";
import { LockIcon, LockOpenIcon, Save, Check } from "lucide-react";
import { WidgetsCombo } from "../../../widgets/components/widget-combo/widget-combo";
import { WidgetDefinition } from "../../../widgets/widget-interface";
import {
	serializeRCDockLayout,
	deserializeRCDockLayout,
	createMinimalRCDockLayout,
} from "./layout-serializer";
import {
	ButtonHolderProvider,
	ButtonHolder,
} from "@workspace/ui/combined/ButtonHolder";
import { WidgetCard } from "../../../widgets/components/widget-card/widget-card";

const defaultLayout: LayoutData = {
	dockbox: {
		mode: "horizontal",
		children: [
			{
				tabs: [
					// {
					//     id: "welcome",
					//     title: "Welcome",
					//     content: <div>Welcome to Panel Dashboard!</div>,
					// },
				],
			} as PanelData,
		],
	},
};

/**
 * RC-Dock dashboard with ButtonHolder integration.
 * @returns React element.
 */
const PanelDashboard = () => {
	const widgets = useAtomValue(widgetsAtom);
	const layouts = useAtomValue(layoutsAtom);
	const locked = useAtomValue(lockedAtom);
	const hasChanged = useAtomValue(hasChangedAtom);

	const {
		getDefinition,
		toggleLock,
		addWidget,
		removeWidget,
		updateWidget,
		addDatasource,
		updateLayouts,
	} = useDashboardActions();

	const { save } = useDashboardShell();

	const { setNavbarItem, removeNavbarItem } = useNavbar();
	const { templates, removeTemplate, updateTemplate } = useTemplates();

	const dockLayoutRef = useRef<DockLayout>(null);
	const [currentLayout, setCurrentLayout] = useState<LayoutBase | null>(null);

	// React Portal approach for ButtonHolder integration:
	// Store DOM containers for each widget title where buttons will be rendered
	const titlePortalContainers = useRef<Map<string, HTMLDivElement>>(
		new Map(),
	);

	// Component that creates a DOM container in the tab title for button rendering
	const TitlePortalContainer = ({ widgetId }: { widgetId: string }) => {
		const containerRef = useRef<HTMLDivElement>(null);

		useEffect(() => {
			if (containerRef.current) {
				titlePortalContainers.current.set(
					widgetId,
					containerRef.current,
				);
			}

			return () => {
				titlePortalContainers.current.delete(widgetId);
			};
		}, [widgetId]);

		return <div ref={containerRef} className="flex flex-row space-x-2" />;
	};

	// Component that portals ButtonHolder from content context into the title DOM
	const ButtonHolderPortal = ({ widgetId }: { widgetId: string }) => {
		const portalContainer = titlePortalContainers.current.get(widgetId);

		if (!portalContainer) {
			return null;
		}

		// Portal the ButtonHolder component into the title container
		// This preserves the React context and event handlers from the content area
		return ReactDOM.createPortal(<ButtonHolder />, portalContainer);
	};

	// Create custom title component for RC-Dock tabs with ButtonHolder integration
	const createCustomTitle = useCallback(
		(widget: any) => {
			const widgetDefinition = getDefinition(widget.widget_id);

			return (
				<div className="flex items-center justify-between w-full min-w-0 pr-2">
					{/* Widget title text */}
					<span className="text-sm font-medium truncate mr-2">
						{widget.title}
					</span>

					{/* Button container */}
					<div className="flex items-center gap-1 shrink-0">
						{/* Widget-provided buttons via Portal */}
						<TitlePortalContainer widgetId={widget.box_id} />

						{/* System buttons (config and delete) */}
						{!locked && (
							<>
								<WidgetCard
									fromLoaded={true}
									data={widget.settings}
									definition={widgetDefinition}
									displayType="gear"
									onValidate={(
										_widgetDef: WidgetDefinition,
										settings: any,
									) => {
										updateWidget(widget.box_id, settings);
									}}
								/>
							</>
						)}
					</div>
				</div>
			);
		},
		[getDefinition, locked, updateWidget],
	);

	// Load tab callback - converts minimal TabBase back to full TabData
	const loadTab = useCallback(
		(savedTab: TabBase): TabData => {
			const { id } = savedTab;
			if (!id) {
				return {
					id: "unknown",
					title: "Unknown Widget",
					content: <div>Widget ID missing</div>,
					closable: !locked,
				};
			}

			const widget = widgets.get(id);

			if (widget) {
				// Content wrapped in ButtonHolderProvider with portal to title
				// The ButtonHolderPortal renders ButtonHolder into the title via React Portal
				const content = (
					<ButtonHolderProvider>
						<ButtonHolderPortal widgetId={widget.box_id} />
						<div className="p-4 h-full flex flex-col">
							<WidgetHost
								widgetId={widget.box_id}
								getDefinition={getDefinition}
							/>
						</div>
					</ButtonHolderProvider>
				);

				return {
					id: widget.box_id,
					title: createCustomTitle(widget),
					cached: true,
					content: content,
					closable: !locked,
				};
			}

			// Return a placeholder if widget not found
			return {
				id,
				title: "Unknown Widget",
				content: <div>Widget not found: {id}</div>,
				closable: !locked,
			};
		},
		[widgets, getDefinition, createCustomTitle, locked],
	);

	// Save tab callback - strips TabData down to minimal TabBase
	const saveTab = useCallback((tab: TabData): TabBase => {
		return {
			id: tab.id,
		};
	}, []);

	// Load layout from dashboard provider when widgets change
	useEffect(() => {
		const rcDockLayoutData = layouts["rc-dock"];

		if (rcDockLayoutData) {
			// Deserialize stored layout
			const layout = deserializeRCDockLayout(rcDockLayoutData);
			setCurrentLayout(layout);

			// Load into RC-Dock if ref is available
			if (dockLayoutRef.current) {
				dockLayoutRef.current.loadLayout(layout);
			}
		} else {
			// Create initial layout with current widgets
			const widgetIds = Array.from(widgets.keys());
			const layout = createMinimalRCDockLayout(widgetIds);
			setCurrentLayout(layout);

			// Update dashboard with initial layout
			const serializedLayout = serializeRCDockLayout(layout);
			updateLayouts({ ...layouts, "rc-dock": serializedLayout });
		}
	}, [widgets, layouts, updateLayouts]);

	// Handle layout changes from RC-Dock
	const handleLayoutChange = useCallback(
		(newLayout: LayoutBase, currentTabId?: string, direction?: string) => {
			if (!locked) {
				setCurrentLayout(newLayout);

				// Serialize and save to dashboard
				const serializedLayout = serializeRCDockLayout(newLayout);
				updateLayouts({ ...layouts, "rc-dock": serializedLayout });

				console.log(
					"RC-Dock layout changed and saved:",
					direction,
					currentTabId,
				);
			}
		},
		[locked, layouts, updateLayouts],
	);

	// Add new widget to RC-Dock layout
	const addWidgetToLayout = useCallback(
		(widgetBoxId: string) => {
			if (dockLayoutRef.current && !locked) {
				const widget = widgets.get(widgetBoxId);
				if (!widget) {
					console.error("Widget not found for box ID:", widgetBoxId);
					return;
				}

				// Create tab content with ButtonHolderProvider and portal to title
				const content = (
					<ButtonHolderProvider>
						<ButtonHolderPortal widgetId={widget.box_id} />
						<div className="p-4 h-full flex flex-col">
							<WidgetHost
								widgetId={widgetBoxId}
								getDefinition={getDefinition}
							/>
						</div>
					</ButtonHolderProvider>
				);

				const newTab: TabData = {
					id: widgetBoxId,
					title: createCustomTitle(widget),
					content: content,
					cached: true,
					closable: true,
				};

				// Try to add to the first available panel, or create a new one
				try {
					dockLayoutRef.current.dockMove(
						newTab,
						dockLayoutRef.current.getLayout().dockbox,
						"middle",
					);
				} catch (error) {
					console.error("Failed to add widget to RC-Dock:", error);
				}
			}
		},
		[widgets, getDefinition, createCustomTitle, locked],
	);

	// Watch for widget changes and sync with layout
	const previousWidgets = useRef(new Set(widgets.keys()));
	useEffect(() => {
		const currentWidgetIds = new Set(widgets.keys());
		const previousWidgetIds = previousWidgets.current;

		// Check for new widgets
		currentWidgetIds.forEach((id) => {
			if (!previousWidgetIds.has(id)) {
				addWidgetToLayout(id);
			}
		});

		// Check for removed widgets and remove their tabs
		previousWidgetIds.forEach((id) => {
			if (!currentWidgetIds.has(id) && dockLayoutRef.current) {
				// Clean up portal containers for removed widget
				titlePortalContainers.current.delete(id);

				try {
					const foundItem = dockLayoutRef.current.find(id);
					if (
						foundItem &&
						"title" in foundItem &&
						"content" in foundItem
					) {
						// It's a TabData, remove it using dockMove with 'remove' direction
						dockLayoutRef.current.dockMove(
							foundItem,
							null,
							"remove",
						);
					} else {
						console.log(
							"Widget removed, but corresponding tab not found or is not a tab",
						);
					}
				} catch (error) {
					console.error(
						"Failed to remove widget from RC-Dock:",
						error,
					);
				}
			}
		});

		previousWidgets.current = currentWidgetIds;
	}, [widgets, addWidgetToLayout]);

	const onLockToggleRef = useRef(toggleLock);
	const onSaveRef = useRef(save);

	useEffect(() => {
		onLockToggleRef.current = toggleLock;
		onSaveRef.current = save;
	}, [toggleLock, save]);

	// Navbar items: Template drawer (right), lock/unlock and save (center)
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

	const handleValidate = useCallback(
		(widget: WidgetDefinition, settings: object) => {
			addWidget(widget, settings);
		},
		[addWidget],
	);

	useEffect(() => {
		setNavbarItem(
			"center",
			"widgets_combo",
			<WidgetsCombo onValidate={handleValidate} />,
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
			removeNavbarItem("center", "save");
		};
	}, [locked, hasChanged, handleValidate, setNavbarItem, removeNavbarItem]);

	return (
		<div className="w-full h-[96dvh] flex flex-col p-1.5">
			<DockLayout
				ref={dockLayoutRef}
				defaultLayout={defaultLayout}
				layout={currentLayout || undefined}
				loadTab={loadTab}
				saveTab={saveTab}
				onLayoutChange={handleLayoutChange}
				style={{
					width: "100%",
					height: "100%",
					flex: 1,
				}}
			/>
		</div>
	);
};

export { PanelDashboard };

/** Layout engine definition for plugin registration. */
export const panelEngineDefinition: LayoutEngineDefinition = {
	id: "PANEL",
	name: "Panel Layout",
	description: "Modern tabbed interface with dockable panels",
	badge: "Popular",
	Component: PanelDashboard,
};
