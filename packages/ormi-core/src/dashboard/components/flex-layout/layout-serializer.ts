import { IJsonModel, Model, IJsonTabNode } from "flexlayout-react";

/**
 * Serializes FlexLayout Model to JSON-safe format
 * Filters out transient state (focus, selection, exact sizes, auto-generated IDs)
 * Only preserves structural layout data that should be persisted
 */
export function serializeFlexLayoutModel(model: Model): Record<string, any> {
  const rawJson = model.toJson();

  // Create a clean copy with only persistent data
  const cleanJson = {
    global: cleanGlobalSettings(rawJson.global), // Keep only user-configurable global settings
    borders: cleanBorders(rawJson.borders || []),
    layout: cleanLayout(rawJson.layout),
    // Skip popouts - they're temporary
  };

  return cleanJson;
}

/**
 * Cleans global settings by preserving essential FlexLayout functionality
 * Only removes truly unnecessary runtime state
 */
function cleanGlobalSettings(global: any): any {
  // For border functionality, we need to preserve most global settings
  // The freeze likely happens because we're missing essential FlexLayout configuration
  const cleaned: any = {
    // Essential FlexLayout settings that should always be present
    enableEdgeDock:
      global.enableEdgeDock !== undefined ? global.enableEdgeDock : true,
    splitterSize: global.splitterSize || 4,
    splitterExtra: global.splitterExtra || 4,

    // Tab configuration
    tabEnableClose: global.tabEnableClose,
    tabEnableRename: global.tabEnableRename,
    tabEnableDrag: global.tabEnableDrag,

    // TabSet configuration
    tabSetEnableDrop: global.tabSetEnableDrop,
    tabSetEnableDrag: global.tabSetEnableDrag,
    tabSetEnableMaximize: global.tabSetEnableMaximize,
    tabSetEnableClose: global.tabSetEnableClose,
    tabSetMinHeight: global.tabSetMinHeight || 100,
    tabSetMinWidth: global.tabSetMinWidth || 100,

    // Border configuration
    borderMinSize: global.borderMinSize || 100,
  };

  // Only skip CSS classes and truly runtime-specific properties
  // Skip: tabClassName, borderClassName (theme-determined)

  return cleaned;
}

/**
 * Cleans border data by removing transient state
 */
function cleanBorders(borders: any[]): any[] {
  return borders.map((border) => ({
    type: border.type,
    location: border.location,
    children: border.children
      ? border.children.map((child: any) => cleanLayout(child))
      : [],
    // Remove: selected (runtime state), size (auto-calculated), id (auto-generated)
  }));
}

/**
 * Removes transient state and metadata from a single layout node
 * Preserves essential IDs for tabs (widget connections) but removes auto-generated container IDs
 */
function cleanLayout(node: any): any {
  const nodeType = node.getType?.() || node.type;
  const cleaned: any = {
    type: nodeType,
  };

  // Handle TabNode - PRESERVE IDs as they connect to widgets
  if (nodeType === "tab") {
    // Tab IDs are essential for widget connections - always preserve them
    const id = node.getId?.() || node.id;
    if (id) {
      cleaned.id = id;
    }

    // Preserve tab-specific attributes (these define the widget)
    if (node._model?._attributes) {
      const attrs = node._model._attributes;
      if (attrs.component) cleaned.component = attrs.component;
      if (attrs.name) cleaned.name = attrs.name;
      if (attrs.config) cleaned.config = attrs.config;
    } else if (node.component || node.name || node.config) {
      // Handle already serialized tab data
      if (node.component) cleaned.component = node.component;
      if (node.name) cleaned.name = node.name;
      if (node.config) cleaned.config = node.config;
    }
    // Skip: rect (positioning), active state
  }

  // Handle layout containers - DON'T preserve auto-generated IDs
  if (nodeType === "row" || nodeType === "tabset") {
    // Skip auto-generated container IDs (they get regenerated)
    // Only preserve structural weight if it's not default
    const weight = node._model?._attributes?.weight || node.weight;
    if (weight !== undefined && weight !== 100) {
      cleaned.weight = weight;
    }
    // Skip: id (auto-generated), selected (runtime state), rect (positioning)
  }

  // Recursively clean children
  const children = node.getChildren?.() || node.children;
  if (children && children.length > 0) {
    cleaned.children = children.map((child: any) => cleanLayout(child));
  }

  return cleaned;
}

/**
 * Deserializes JSON data back to FlexLayout Model format
 * Validates and fills in missing required properties with defaults
 */
export function deserializeFlexLayoutModel(
  serializedModel: Record<string, any>,
): Model {
  // Validate that we have the minimum required structure
  if (
    !serializedModel ||
    typeof serializedModel !== "object" ||
    !serializedModel.global ||
    !serializedModel.layout
  ) {
    console.warn("Invalid or incomplete FlexLayout data, using default config");
    return Model.fromJson(getDefaultFlexLayoutConfig());
  }

  // Ensure global config has all required properties
  const defaultGlobal = getDefaultFlexLayoutConfig().global;
  const mergedGlobal = {
    ...defaultGlobal,
    ...serializedModel.global,
  };

  // Ensure borders exist with proper structure
  const borders = serializedModel.borders || [
    { type: "border", location: "left", children: [] },
    { type: "border", location: "right", children: [] },
  ];

  // Validate border structure to prevent infinite loops
  const validatedBorders = borders.map((border: any) => ({
    type: "border",
    location: border.location,
    children: Array.isArray(border.children) ? border.children : [],
  }));

  const validatedModel = {
    ...serializedModel,
    global: mergedGlobal,
    borders: validatedBorders,
  };

  try {
    return Model.fromJson(validatedModel as IJsonModel);
  } catch (error) {
    console.error("Failed to create FlexLayout model from data:", error);
    console.warn("Falling back to default configuration");
    return Model.fromJson(getDefaultFlexLayoutConfig());
  }
}

/**
 * Extracts all tab IDs from a FlexLayout model
 */
export function extractTabIdsFromModel(model: Model): string[] {
  const tabIds: string[] = [];

  model.visitNodes((node) => {
    if (node.getType() === "tab") {
      const id = node.getId();
      if (id) {
        tabIds.push(id);
      }
    }
  });

  return tabIds;
}

/**
 * Creates a new tab configuration for adding to FlexLayout
 */
export function createTabConfig(
  id: string,
  name: string,
  component?: string,
): IJsonTabNode {
  return {
    type: "tab",
    id: id,
    name: name,
    component: component || id,
    config: {},
  };
}

/**
 * Default FlexLayout configuration optimized for dashboard use
 */
export function getDefaultFlexLayoutConfig(): IJsonModel {
  return {
    global: {
      // Tab configuration - disable default close button since we'll add our own
      tabEnableClose: true,
      tabEnableRename: false,
      tabEnableDrag: true,
      tabClassName: "flex-tab",

      // TabSet configuration
      tabSetEnableDrop: true,
      tabSetEnableDrag: true,
      tabSetEnableMaximize: true,
      tabSetEnableClose: false,
      tabSetMinHeight: 100,
      tabSetMinWidth: 100,

      // Border configuration
      borderMinSize: 100,
      borderClassName: "flex-border",

      // Splitter configuration
      splitterSize: 4,
      splitterExtra: 4,

      // General
      rootOrientationVertical: false,
      enableEdgeDock: true,
    },
    borders: [
      // add left, right and bottom borders by default
      { type: "border", location: "left", children: [] },
      { type: "border", location: "right", children: [] },
    ],
    layout: {
      type: "row",
      weight: 100,
      children: [
        {
          type: "tabset",
          weight: 100,
          children: [],
        },
      ],
    },
  };
}
