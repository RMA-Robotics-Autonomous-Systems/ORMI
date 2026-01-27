import { DataRequirements, WidgetDefinition } from "./widget-interface";
import { DatasourceTopic } from "../datasources/datasource-interface";
import { JsonSchema } from "@jsonforms/core";
import { getSchemaFromStringName } from "../types/jsonSchema";
import { JSONSchema7 } from "json-schema";

/**
 * Represents a compatible property path within a topic
 */
export interface CompatibleProperty {
  path: string; // Property path like "linear.x" or "position.z"
  type: string; // Final type of the property ("number", "string", etc.)
  source: "webapp" | "raw"; // Whether this comes from webapp type or raw type schema
}

/**
 * Represents a property node in the tree structure
 */
export interface PropertyTreeNode {
  name: string; // Property name (e.g., "linear", "x")
  path: string; // Full path (e.g., "linear.x")
  type?: string; // Final type if this is a leaf node
  isCompatible: boolean; // Whether this property matches widget requirements
  children: PropertyTreeNode[]; // Nested properties
  isLeaf: boolean; // Whether this is a final property (no children)
}

/**
 * Structured property trees for both type systems
 */
export interface DualPropertyTree {
  webapp: PropertyTreeNode[]; // Tree from webapp type schema
  raw: PropertyTreeNode[]; // Tree from raw type schema
  hasWebappData: boolean; // Whether webapp schema was found
  hasRawData: boolean; // Whether raw schema was found
}

/**
 * Result of topic compatibility analysis
 */
export interface TopicCompatibilityResult {
  isCompatible: boolean;
  directMatch: boolean; // Topic type directly matches requirements
  compatibleProperties: CompatibleProperty[]; // Properties that match requirements
  propertyTree?: DualPropertyTree; // Optional property trees for detailed analysis
  reason?: string; // Why not compatible (if applicable)
}

/**
 * Analyzes a JSON schema to find properties that match accepted types
 */
export const analyzeSchemaProperties = (
  schema: JsonSchema | JSONSchema7,
  acceptedTypes: string[],
  source: "webapp" | "raw",
  parentPath: string = "",
): CompatibleProperty[] => {
  const compatibleProperties: CompatibleProperty[] = [];

  if (!schema.properties) return compatibleProperties;

  Object.entries(schema.properties).forEach(([propName, propSchema]) => {
    const currentPath = parentPath ? `${parentPath}.${propName}` : propName;

    if (typeof propSchema === "object" && propSchema !== null) {
      // Check if this property's type is directly accepted
      if (
        propSchema.type &&
        (acceptedTypes.includes("*") ||
          acceptedTypes.includes(propSchema.type as string))
      ) {
        compatibleProperties.push({
          path: currentPath,
          type: propSchema.type as string,
          source,
        });
      }

      // Recursively check nested properties
      if (propSchema.properties) {
        compatibleProperties.push(
          ...analyzeSchemaProperties(
            propSchema,
            acceptedTypes,
            source,
            currentPath,
          ),
        );
      }
      // Handle object references to webapp types (only if no explicit properties)
      // This prevents double recursion when an object has both type="object" and properties
      else if (source === "webapp" && propSchema.type === "object") {
        // Try to find nested compatible types
        compatibleProperties.push(
          ...analyzeSchemaProperties(
            propSchema,
            acceptedTypes,
            source,
            currentPath,
          ),
        );
      }
    }
  });

  return compatibleProperties;
};

/**
 * Comprehensive topic compatibility analysis
 * Checks direct type match and analyzes properties from both webapp and raw schemas
 */
export const analyzeTopicCompatibility = async (
  topic: DatasourceTopic,
  requirements: DataRequirements | undefined,
  pluginsManager?: any, // PluginsManager type - optional for raw schema analysis
): Promise<TopicCompatibilityResult> => {
  if (!requirements) {
    return {
      isCompatible: true,
      directMatch: true,
      compatibleProperties: [],
    };
  }

  const result: TopicCompatibilityResult = {
    isCompatible: false,
    directMatch: false,
    compatibleProperties: [],
  };

  // 1. Check direct webapp type match
  const directMatch = requirements.accepts.includes(topic.type);
  if (directMatch) {
    result.isCompatible = true;
    result.directMatch = true;
    return result;
  }

  // 2. Analyze webapp type properties
  if (topic.type) {
    try {
      const webappSchema = getSchemaFromStringName(topic.type);
      const webappProperties = analyzeSchemaProperties(
        webappSchema,
        requirements.accepts,
        "webapp",
      );
      result.compatibleProperties.push(...webappProperties);
    } catch (error) {
      // Webapp type not found or invalid - continue with raw analysis
    }
  }

  // 3. Analyze raw type properties ONLY if no webapp type exists
  // If there's a webapp type, the data will be converted to webapp format
  if (pluginsManager && topic.rawType && !topic.type) {
    try {
      const rawSchema = (await pluginsManager.applyFilterAsync(
        `${topic.source.id}-definition`,
        {},
        topic,
      )) as JsonSchema;

      if (rawSchema && rawSchema.properties) {
        const rawProperties = analyzeSchemaProperties(
          rawSchema,
          requirements.accepts,
          "raw",
        );
        result.compatibleProperties.push(...rawProperties);
      }
    } catch (error) {
      // Raw schema not available - that's okay
    }
  }

  // 4. Determine final compatibility
  result.isCompatible =
    result.directMatch || result.compatibleProperties.length > 0;

  if (!result.isCompatible) {
    result.reason = `Topic type '${topic.type}' and its properties don't match any of: ${requirements.accepts.join(", ")}`;
  }

  return result;
};

/**
 * Simple synchronous compatibility check (for backward compatibility)
 */
export const isTopicCompatible = (
  topic: DatasourceTopic,
  requirements: DataRequirements | undefined,
): boolean => {
  if (!requirements) return true;

  // Direct type match
  if (requirements.accepts.includes(topic.type)) return true;

  // Basic webapp property analysis (synchronous only)
  if (topic.type) {
    try {
      const webappSchema = getSchemaFromStringName(topic.type);
      const compatibleProps = analyzeSchemaProperties(
        webappSchema,
        requirements.accepts,
        "webapp",
      );
      return compatibleProps.length > 0;
    } catch (error) {
      return false;
    }
  }

  return false;
};

/**
 * Filters a list of topics to only include those compatible with widget requirements
 */
export const filterCompatibleTopics = async (
  topics: DatasourceTopic[],
  requirements: DataRequirements | undefined,
  pluginsManager?: any,
): Promise<
  { topic: DatasourceTopic; analysis: TopicCompatibilityResult }[]
> => {
  const results = await Promise.all(
    topics.map(async (topic) => {
      const analysis = await analyzeTopicCompatibility(
        topic,
        requirements,
        pluginsManager,
      );
      return { topic, analysis };
    }),
  );

  return results.filter((result) => result.analysis.isCompatible);
};

/**
 * Gets all possible data sources for a widget (topics + their compatible properties)
 */
export const getWidgetDataSources = async (
  topics: DatasourceTopic[],
  requirements: DataRequirements | undefined,
  pluginsManager?: any,
): Promise<{
  directTopics: DatasourceTopic[];
  topicProperties: {
    topic: DatasourceTopic;
    properties: CompatibleProperty[];
  }[];
}> => {
  const compatibleResults = await filterCompatibleTopics(
    topics,
    requirements,
    pluginsManager,
  );

  const directTopics: DatasourceTopic[] = [];
  const topicProperties: {
    topic: DatasourceTopic;
    properties: CompatibleProperty[];
  }[] = [];

  compatibleResults.forEach(({ topic, analysis }) => {
    if (analysis.directMatch) {
      directTopics.push(topic);
    }

    if (analysis.compatibleProperties.length > 0) {
      topicProperties.push({
        topic,
        properties: analysis.compatibleProperties,
      });
    }
  });

  return { directTopics, topicProperties };
};

/**
 * Resolves a $ref reference in a JSON schema
 */
const resolveRef = (
  ref: string,
  rootSchema: JsonSchema | JSONSchema7,
): JsonSchema | JSONSchema7 | null => {
  if (!rootSchema.definitions) {
    return null;
  }

  const definitionKey = ref.replace(/#\/definitions\//g, "");
  const definition = rootSchema.definitions[definitionKey];

  // Check if definition exists and is an object (not boolean)
  if (definition && typeof definition === "object") {
    return definition as JsonSchema | JSONSchema7;
  }

  return null;
};

/**
 * Builds a property tree from a JSON schema
 */
export const buildPropertyTree = (
  schema: JsonSchema | JSONSchema7,
  acceptedTypes: string[],
  parentPath: string = "",
  rootSchema?: JsonSchema | JSONSchema7,
): PropertyTreeNode[] => {
  const nodes: PropertyTreeNode[] = [];

  // Use the current schema as root schema if not provided
  const rootSchemaToUse = rootSchema || schema;

  if (!schema.properties) return nodes;

  Object.entries(schema.properties).forEach(([propName, propSchema]) => {
    const currentPath = parentPath ? `${parentPath}.${propName}` : propName;

    if (typeof propSchema === "object" && propSchema !== null) {
      let resolvedSchema = propSchema;
      let nodeType = propSchema.type as string;
      let isRefResolved = false;

      // Handle $ref references
      if (propSchema.$ref) {
        const referencedSchema = resolveRef(propSchema.$ref, rootSchemaToUse);
        if (referencedSchema) {
          resolvedSchema = referencedSchema;
          nodeType = referencedSchema.type as string;
          isRefResolved = true;
        }
      }

      const node: PropertyTreeNode = {
        name: propName,
        path: currentPath,
        type: nodeType,
        isCompatible: nodeType
          ? acceptedTypes.includes("*") || acceptedTypes.includes(nodeType)
          : false,
        children: [],
        isLeaf:
          !resolvedSchema.properties ||
          Object.keys(resolvedSchema.properties).length === 0,
      };

      // Recursively build children if this has nested properties
      if (
        resolvedSchema.properties &&
        Object.keys(resolvedSchema.properties).length > 0
      ) {
        node.children = buildPropertyTree(
          resolvedSchema,
          acceptedTypes,
          currentPath,
          rootSchemaToUse,
        );
        node.isLeaf = false;
      }

      nodes.push(node);
    }
  });

  return nodes;
};

/**
 * Builds dual property trees for a topic (separate webapp and raw trees)
 *
 * Important: Raw properties are only available when there's no webapp type.
 * If a topic has a webapp type, the data will be converted to that format,
 * making raw properties inaccessible to widgets.
 */
export const buildDualPropertyTree = async (
  topic: DatasourceTopic,
  requirements: DataRequirements | undefined,
  pluginsManager?: any,
): Promise<DualPropertyTree> => {
  const result: DualPropertyTree = {
    webapp: [],
    raw: [],
    hasWebappData: false,
    hasRawData: false,
  };

  // If no requirements, build trees but mark everything as compatible
  const acceptedTypes = requirements ? requirements.accepts : ["*"]; // Accept all types

  // Build webapp property tree
  if (topic.type) {
    try {
      const webappSchema = getSchemaFromStringName(topic.type);
      result.webapp = buildPropertyTree(
        webappSchema,
        acceptedTypes,
        "",
        webappSchema,
      );
      result.hasWebappData = true;
    } catch (error) {
      // Webapp type not found - that's okay
    }
  }

  // Build raw property tree ONLY if there's no webapp type
  // If there's a webapp type, the data will be converted to webapp format
  // so raw properties wouldn't be accessible to widgets
  if (pluginsManager && topic.rawType && !topic.type) {
    try {
      const rawSchema = (await pluginsManager.applyFilterAsync(
        `${topic.source.id}-definition`,
        {},
        topic,
      )) as JsonSchema;

      if (rawSchema && rawSchema.properties) {
        result.raw = buildPropertyTree(rawSchema, acceptedTypes, "", rawSchema);
        result.hasRawData = true;
      }
    } catch (error) {
      // Raw schema not available - that's okay
    }
  }

  return result;
};

/**
 * Gets all compatible properties from a property tree (flattened)
 */
export const getCompatiblePropertiesFromTree = (
  nodes: PropertyTreeNode[],
  source: "webapp" | "raw",
): CompatibleProperty[] => {
  const compatibleProperties: CompatibleProperty[] = [];

  const traverse = (nodes: PropertyTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.isCompatible && node.type) {
        compatibleProperties.push({
          path: node.path,
          type: node.type,
          source,
        });
      }

      if (node.children.length > 0) {
        traverse(node.children);
      }
    });
  };

  traverse(nodes);
  return compatibleProperties;
};

/**
 * Comprehensive topic compatibility analysis with property trees
 * This is the enhanced version that includes dual property trees for UI consumption
 */
export const analyzeTopicCompatibilityWithTrees = async (
  topic: DatasourceTopic,
  requirements: DataRequirements | undefined,
  pluginsManager?: any,
): Promise<TopicCompatibilityResult> => {
  if (!requirements) {
    return {
      isCompatible: true,
      directMatch: true,
      compatibleProperties: [],
      propertyTree: {
        webapp: [],
        raw: [],
        hasWebappData: false,
        hasRawData: false,
      },
    };
  }

  // 1. Check direct webapp type match
  const directMatch = requirements.accepts.includes(topic.type);

  // 2. Build dual property trees
  const propertyTree = await buildDualPropertyTree(
    topic,
    requirements,
    pluginsManager,
  );

  // 3. Extract compatible properties from both trees
  const webappProperties = getCompatiblePropertiesFromTree(
    propertyTree.webapp,
    "webapp",
  );
  const rawProperties = getCompatiblePropertiesFromTree(
    propertyTree.raw,
    "raw",
  );
  const allCompatibleProperties = [...webappProperties, ...rawProperties];

  // 4. Determine compatibility
  const isCompatible = directMatch || allCompatibleProperties.length > 0;

  const result: TopicCompatibilityResult = {
    isCompatible,
    directMatch,
    compatibleProperties: allCompatibleProperties,
    propertyTree,
    reason: !isCompatible
      ? `Topic type '${topic.type}' and its properties don't match any of: ${requirements.accepts.join(", ")}`
      : undefined,
  };

  return result;
};

/**
 * Counts compatible properties in a property tree
 */
export const countCompatibleProperties = (
  nodes: PropertyTreeNode[],
): number => {
  let count = 0;

  const traverse = (nodes: PropertyTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.isCompatible && node.type) {
        count++;
      }
      if (node.children.length > 0) {
        traverse(node.children);
      }
    });
  };

  traverse(nodes);
  return count;
};

/**
 * Gets tab information for the dual property tree UI
 */
export const getPropertyTreeTabInfo = (propertyTree: DualPropertyTree) => {
  const webappCount = countCompatibleProperties(propertyTree.webapp);
  const rawCount = countCompatibleProperties(propertyTree.raw);

  return {
    webapp: {
      hasData: propertyTree.hasWebappData,
      compatibleCount: webappCount,
      totalCount: propertyTree.webapp.length,
      label: `Webapp Types${webappCount > 0 ? ` (${webappCount})` : ""}`,
    },
    raw: {
      hasData: propertyTree.hasRawData,
      compatibleCount: rawCount,
      totalCount: propertyTree.raw.length,
      label: `Raw Types${rawCount > 0 ? ` (${rawCount})` : ""}`,
    },
  };
};

/**
 * Finds a specific property node by path in a tree
 */
export const findPropertyNodeByPath = (
  nodes: PropertyTreeNode[],
  targetPath: string,
): PropertyTreeNode | null => {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    if (node.children.length > 0) {
      const found = findPropertyNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }

  return null;
};

/**
 * Gets all leaf nodes (selectable properties) from a tree
 */
export const getSelectableProperties = (
  nodes: PropertyTreeNode[],
): PropertyTreeNode[] => {
  const selectableNodes: PropertyTreeNode[] = [];

  const traverse = (nodes: PropertyTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.isLeaf && node.type) {
        selectableNodes.push(node);
      } else if (node.children.length > 0) {
        traverse(node.children);
      }
    });
  };

  traverse(nodes);
  return selectableNodes;
};

/**
 * Validates that a data requirements object is properly configured
 */
export const validateDataRequirements = (
  requirements: DataRequirements | undefined,
  widgetId?: string,
): string[] => {
  const errors: string[] = [];

  if (!requirements) {
    if (widgetId) {
      errors.push(
        `Widget ${widgetId} has no data requirements defined - all topics will be accepted`,
      );
    }
    return errors;
  }

  if (!requirements.accepts || requirements.accepts.length === 0) {
    errors.push(
      `Data requirements must specify at least one accepted data type`,
    );
  }

  return errors;
};

/**
 * Utility function to get validation summary text for UI display
 */
export const getValidationSummary = (
  errors: string[],
  compatibilityResult?: TopicCompatibilityResult,
): string => {
  if (errors.length > 0) {
    return `❌ ${errors.length} error(s)`;
  }

  if (!compatibilityResult) {
    return "❓ No validation performed";
  }

  if (compatibilityResult.directMatch) {
    return "✅ Perfect match";
  }

  if (
    compatibilityResult.isCompatible &&
    compatibilityResult.compatibleProperties.length > 0
  ) {
    return `🔶 Compatible via ${compatibilityResult.compatibleProperties.length} properties`;
  }

  if (compatibilityResult.isCompatible) {
    return "✅ Compatible";
  }

  return "❌ Not compatible";
};

/**
 * Utility function to get compatibility icon for UI display
 */
export const getCompatibilityIcon = (
  compatibilityResult?: TopicCompatibilityResult,
): string => {
  if (!compatibilityResult) return "❓";

  if (compatibilityResult.directMatch) return "✅";
  if (compatibilityResult.isCompatible) return "🔶";
  return "❌";
};
