import { useCallback, useEffect, useState, useRef } from "react";
import { Model, Action, Actions } from "flexlayout-react";
import { Widget } from "../../../../widgets/widget-interface";
import {
  serializeFlexLayoutModel,
  deserializeFlexLayoutModel,
  createTabConfig,
  getDefaultFlexLayoutConfig,
} from "../layout-serializer";

interface UseFlexLayoutModelProps {
  widgets: Map<string, Widget>;
  layouts: Record<string, any>;
  locked: boolean;
  getDefinition: (widget_id: string) => any;
  dispatch: React.Dispatch<any>;
  removeWidget: (box_id: string) => void;
  updateLayouts: (newLayouts: Record<string, any>) => void;
}

/**
 * Hook to manage FlexLayout Model state
 * Handles model creation, updates, widget synchronization, and FlexLayout actions
 */
export const useFlexLayoutModel = ({
  widgets,
  layouts,
  locked,
  getDefinition,
  dispatch,
  removeWidget,
  updateLayouts,
}: UseFlexLayoutModelProps) => {
  const [model, setModel] = useState<Model | null>(null);
  const lastSerializedRef = useRef<string>("");

  // Manage FlexLayout model - handle initialization and widget synchronization together
  useEffect(() => {
    const currentWidgetIds = new Set(widgets.keys());
    let newModel: Model;

    // Try to initialize from saved layout first
    if (!model && layouts && typeof layouts === "object") {
      try {
        newModel = deserializeFlexLayoutModel(layouts);
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
          const definition = widget ? getDefinition(widget.widget_id) : null;
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

    // Model exists - sync widgets and update lock state
    const modelJson = model.toJson();

    // Update lock state if needed
    if (modelJson.global && modelJson.global.tabEnableClose === locked) {
      modelJson.global.tabEnableClose = !locked;
    }

    // Find existing tabs in the model
    const existingTabIds = new Set<string>();
    const extractTabIds = (node: any) => {
      if (node.type === "tab" && node.id) {
        existingTabIds.add(node.id);
      }
      if (node.children) {
        node.children.forEach(extractTabIds);
      }
    };

    if (modelJson.layout) {
      extractTabIds(modelJson.layout);
    }
    if (modelJson.borders) {
      modelJson.borders.forEach((border: any) => {
        extractTabIds(border);
      });
    }

    // Find missing widgets that need to be added (only if not locked)
    const missingWidgets = locked
      ? []
      : Array.from(currentWidgetIds).filter((id) => !existingTabIds.has(id));

    // Update model if lock state changed or widgets need to be added
    if (
      (modelJson.global && modelJson.global.tabEnableClose === locked) ||
      missingWidgets.length > 0
    ) {
      const newModelJson = JSON.parse(JSON.stringify(modelJson));

      if (missingWidgets.length > 0) {
        // Create tabs for missing widgets
        const missingTabs = missingWidgets.map((id) => {
          const widget = widgets.get(id);
          const definition = widget ? getDefinition(widget.widget_id) : null;
          const title = widget?.title || definition?.name || "Widget";
          return createTabConfig(id, title, id);
        });

        // Add missing widgets to the main tabset
        const addToTabset = (node: any): boolean => {
          if (node.type === "tabset" && node.children) {
            node.children.push(...missingTabs);
            return true;
          }
          if (node.children) {
            for (const child of node.children) {
              if (addToTabset(child)) return true;
            }
          }
          return false;
        };

        if (newModelJson.layout) {
          const added = addToTabset(newModelJson.layout);
          if (!added) {
            // Create new layout if no tabset exists
            newModelJson.layout = {
              type: "row" as const,
              weight: 100,
              children: [
                {
                  type: "tabset" as const,
                  weight: 100,
                  children: missingTabs,
                },
              ],
            };
          }
        }
      }

      const updatedModel = Model.fromJson(newModelJson);
      setModel(updatedModel);

      // Sync layout to provider after programmatic model updates
      if (updatedModel) {
        const serializedModel = serializeFlexLayoutModel(updatedModel);
        updateLayouts(serializedModel);
      }
    }
  }, [layouts, widgets, locked, getDefinition, model, updateLayouts]);

  /**
   *    Handle FlexLayout actions, event used on the FlexLayout component
   */
  const onAction = (action: Action) => {
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
      const serializedModel = serializeFlexLayoutModel(newModel);
      const serializedString = JSON.stringify(serializedModel);
      if (serializedString !== lastSerializedRef.current) {
        lastSerializedRef.current = serializedString;
        // FlexLayout dashboard only cares about its own layout data
        updateLayouts(serializedModel);
      }
    }
  };

  return {
    model,
    onAction,
    onModelChange,
  };
};
