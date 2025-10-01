import { LayoutBase, LayoutData } from "rc-dock";

/**
 * Serializes RC-Dock LayoutBase to JSON-safe format
 * Removes circular references and runtime-only properties
 */
export function serializeRCDockLayout(layout: LayoutBase): Record<string, any> {
  return JSON.parse(
    JSON.stringify(layout, (key, value) => {
      // Skip circular reference properties that RC-Dock uses internally
      if (
        key === "parent" ||
        key === "_owner" ||
        key === "_store" ||
        key === "loadedFrom"
      ) {
        return undefined;
      }

      // Skip React elements and functions
      if (
        typeof value === "function" ||
        (value && typeof value === "object" && value.$$typeof)
      ) {
        return undefined;
      }

      return value;
    })
  );
}

/**
 * Deserializes JSON data back to LayoutBase format
 * This creates a clean LayoutBase that can be used with RC-Dock's loadLayout
 */
export function deserializeRCDockLayout(
  serializedLayout: Record<string, any>
): LayoutBase {
  // Ensure required structure exists
  const layout: LayoutBase = {
    dockbox: serializedLayout.dockbox || {
      mode: "horizontal",
      children: [],
      size: 200,
    },
    floatbox: serializedLayout.floatbox,
    windowbox: serializedLayout.windowbox,
    maxbox: serializedLayout.maxbox,
  };

  return layout;
}

/**
 * Creates minimal layout structure for RC-Dock with given widget IDs
 */
export function createMinimalRCDockLayout(
  widgetIds: string[] = []
): LayoutBase {
  const tabs = widgetIds.map((id) => ({ id }));

  return {
    dockbox: {
      mode: "horizontal",
      children:
        tabs.length > 0
          ? [
              {
                tabs: tabs,
                size: 200,
              },
            ]
          : [],
      size: 200,
    },
  };
}

/**
 * Extracts all tab IDs from an RC-Dock layout
 */
export function extractTabIdsFromLayout(layout: LayoutBase): string[] {
  const tabIds: string[] = [];

  function extractFromBox(box: any) {
    if (!box || !box.children) return;

    for (const child of box.children) {
      if (child.tabs) {
        // This is a panel
        for (const tab of child.tabs) {
          if (tab.id) {
            tabIds.push(tab.id);
          }
        }
      } else if (child.children) {
        // This is a box
        extractFromBox(child);
      }
    }
  }

  extractFromBox(layout.dockbox);
  if (layout.floatbox) extractFromBox(layout.floatbox);
  if (layout.windowbox) extractFromBox(layout.windowbox);
  if (layout.maxbox) extractFromBox(layout.maxbox);

  return tabIds;
}
