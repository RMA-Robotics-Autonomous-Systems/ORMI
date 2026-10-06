import { useCallback, useEffect, useState, useRef } from "react";
import { Model, Action, Actions, IJsonModel } from "flexlayout-react";
import { Widget } from "../../../../widgets/widget-interface";
import {
	serializeFlexLayoutModel,
	deserializeFlexLayoutModel,
	createTabConfig,
	getDefaultFlexLayoutConfig,
} from "../layout-serializer";
import { measureFlexLayoutPanels, placeNewTabs } from "../widget-placement";
import { addTabsToModel } from "../live-placement";
import { isAnimatedLayoutAction } from "../panel-motion";

/** Props for useFlexLayoutModel. */
interface UseFlexLayoutModelProps {
	widgets: Map<string, Widget>;
	layouts: Record<string, unknown>;
	locked: boolean;
	getDefinition: (widget_id: string) => any;
	removeWidget: (box_id: string) => void;
	updateLayouts: (
		updater: (prev: Record<string, unknown>) => Record<string, unknown>,
	) => void;
	/**
	 * Called with the model on screen just before a layout change is applied
	 * (panel motion measures its "before" here). Not called for splitter
	 * drags, tab selection or lock toggles.
	 */
	onBeforeLayoutChange?: (model: Model) => void;
	/**
	 * Called with the model on screen and the tab about to be selected, just
	 * before a `SELECT_TAB` is applied (the tab strip indicator measures its
	 * start here).
	 */
	onBeforeTabSelect?: (model: Model, tabId: string) => void;
}

/**
 * Manage FlexLayout model state and synchronization.
 * @param props - Hook props.
 * @returns FlexLayout model handlers.
 */
export const useFlexLayoutModel = ({
	widgets,
	layouts,
	locked,
	getDefinition,
	removeWidget,
	updateLayouts,
	onBeforeLayoutChange,
	onBeforeTabSelect,
}: UseFlexLayoutModelProps) => {
	const [model, setModel] = useState<Model | null>(null);
	const lastSerializedRef = useRef<string>("");

	// Write the model's serialized layout to the provider, once per distinct
	// layout. The flex engine keeps its layout under the "flex" key, preserving
	// other engines' layouts.
	const syncLayout = useCallback(
		(source: Model) => {
			const serializedModel = serializeFlexLayoutModel(source);
			const serializedString = JSON.stringify(serializedModel);
			if (serializedString === lastSerializedRef.current) return;
			lastSerializedRef.current = serializedString;
			updateLayouts((prev: Record<string, unknown>) => ({
				...prev,
				flex: serializedModel,
			}));
		},
		[updateLayouts],
	);

	// Manage FlexLayout model - handle initialization and widget synchronization together
	useEffect(() => {
		const currentWidgetIds = new Set(widgets.keys());
		let newModel: Model;

		// Try to initialize from saved layout first
		// Flex engine stores its layout state under the "flex" key
		const flexLayoutData = layouts["flex"] as IJsonModel | undefined;
		if (!model && flexLayoutData && typeof flexLayoutData === "object") {
			try {
				newModel = deserializeFlexLayoutModel(flexLayoutData);
				setModel(newModel);
				return;
			} catch (error) {
				console.error("Failed to deserialize FlexLayout model:", error);
			}
		}

		// If no model exists, create one from current widgets
		if (!model) {
			const defaultConfig = getDefaultFlexLayoutConfig();

			if (currentWidgetIds.size > 0) {
				const tabs = Array.from(currentWidgetIds).map((box_id) => {
					const widget = widgets.get(box_id);
					const definition = widget
						? getDefinition(widget.widget_id)
						: null;
					const title = widget?.title || definition?.name || "Widget";
					return createTabConfig(box_id, title, box_id);
				});

				newModel = Model.fromJson({
					...defaultConfig,
					global: {
						...defaultConfig.global,
						tabEnableClose: !locked,
					},
					layout: {
						type: "row",
						weight: 100,
						children: [
							{
								type: "tabset",
								weight: 100,
								children: tabs,
							},
						],
					},
				});
			} else {
				newModel = Model.fromJson({
					...defaultConfig,
					global: {
						...defaultConfig.global,
						tabEnableClose: !locked,
					},
				});
			}

			setModel(newModel);
			return;
		}

		// Model exists - sync widgets and update lock state.
		//
		// Both changes are applied to the model that is on screen, as
		// FlexLayout actions, and never by building a new model from JSON. A
		// rebuilt model remounts every widget on the dashboard (see
		// `planNewTab` in widget-placement.ts): each existing panel drops out
		// for a render, so anything holding a connection, a video stream
		// above all, restarts whenever an unrelated widget is added or the
		// dashboard is locked.
		let changed = false;

		if (model.toJson().global?.tabEnableClose === locked) {
			model.doAction(
				Actions.updateModelAttributes({ tabEnableClose: !locked }),
			);
			changed = true;
		}

		// Find existing tabs in the model
		const existingTabIds = new Set<string>();
		model.visitNodes((node) => {
			if (node.getType() === "tab") existingTabIds.add(node.getId());
		});

		// Find missing widgets that need to be added (only if not locked)
		const missingWidgets = locked
			? []
			: Array.from(currentWidgetIds).filter(
					(id) => !existingTabIds.has(id),
				);

		let activeModel = model;

		if (missingWidgets.length > 0) {
			// Create tabs for missing widgets
			const missingTabs = missingWidgets.map((id) => {
				const widget = widgets.get(id);
				const definition = widget
					? getDefinition(widget.widget_id)
					: null;
				const title = widget?.title || definition?.name || "Widget";
				return createTabConfig(id, title, id);
			});

			// Measure the model that is on screen before anything moves:
			// panel motion takes its "before" here, and the placement rules
			// their sizes.
			onBeforeLayoutChange?.(model);
			const sizes = measureFlexLayoutPanels(model);

			// Split rather than stack. Only widgets missing from the model
			// reach here, so a restored layout is never rearranged.
			const unplaced = addTabsToModel(model, missingTabs, sizes);

			// A layout with no tabset has nothing to dock against, and no
			// widget on screen to protect either, so it is rebuilt.
			if (unplaced.length > 0) {
				const modelJson = model.toJson();
				modelJson.layout = placeNewTabs(
					modelJson.layout ?? {
						type: "row",
						weight: 100,
						children: [],
					},
					unplaced,
					{
						sizes,
						rootOrientationVertical:
							modelJson.global?.rootOrientationVertical,
					},
				);
				activeModel = Model.fromJson(modelJson);
				setModel(activeModel);
			}
			changed = true;
		}

		// Sync layout to provider after programmatic model updates. `Layout`
		// reports these actions itself while it is mounted, but it is not
		// mounted on an empty dashboard, and `onModelChange` ignores a locked
		// one.
		if (changed) syncLayout(activeModel);
	}, [
		layouts,
		widgets,
		locked,
		getDefinition,
		model,
		syncLayout,
		onBeforeLayoutChange,
	]);

	/**
	 *    Handle FlexLayout actions, event used on the FlexLayout component
	 */
	const onAction = (action: Action) => {
		if (model && isAnimatedLayoutAction(action.type)) {
			onBeforeLayoutChange?.(model);
		}
		if (model && action.type === Actions.SELECT_TAB) {
			onBeforeTabSelect?.(model, action.data.tabNode);
		}
		if (action.type === Actions.DELETE_TAB) {
			const tabId = action.data.node;
			removeWidget(tabId);
			return action;
		}
		return action;
	};

	/**
	 *    Handle model changes, event used on the FlexLayout component
	 **/
	const onModelChange = (newModel: any) => {
		if (!locked) {
			setModel(newModel);
			syncLayout(newModel);
		}
	};

	return {
		model,
		onAction,
		onModelChange,
	};
};
