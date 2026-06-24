import { DataRequirements, WidgetDefinition } from "./widget-interface";
import { DatasourceTopic } from "../datasources/datasource-interface";
import { JsonSchema } from "@jsonforms/core";
import { getSchemaFromStringName } from "../types/jsonSchema";
import { JSONSchema7 } from "json-schema";

/** Compatible property path within a topic. */
export interface CompatibleProperty {
	path: string; // Property path like "linear.x" or "position.z"
	type: string; // Final type of the property ("number", "string", etc.)
	source: "webapp" | "raw"; // Whether this comes from webapp type or raw type schema
}

/** Property node within a tree structure. */
export interface PropertyTreeNode {
	name: string; // Property name (e.g., "linear", "x")
	path: string; // Full path (e.g., "linear.x")
	type?: string; // Final type if this is a leaf node
	isCompatible: boolean; // Whether this property matches widget requirements
	children: PropertyTreeNode[]; // Nested properties
	isLeaf: boolean; // Whether this is a final property (no children)
}

/** Property trees for webapp and raw schemas. */
export interface DualPropertyTree {
	webapp: PropertyTreeNode[]; // Tree from webapp type schema
	raw: PropertyTreeNode[]; // Tree from raw type schema
	hasWebappData: boolean; // Whether webapp schema was found
	hasRawData: boolean; // Whether raw schema was found
}

/** Result of topic compatibility analysis. */
export interface TopicCompatibilityResult {
	isCompatible: boolean;
	directMatch: boolean; // Topic type directly matches requirements
	compatibleProperties: CompatibleProperty[]; // Properties that match requirements
	propertyTree?: DualPropertyTree; // Optional property trees for detailed analysis
	reason?: string; // Why not compatible (if applicable)
}

/**
 * Analyze a JSON schema to find properties that match accepted types.
 * @param schema - JSON schema to analyze.
 * @param acceptedTypes - Accepted type list.
 * @param source - Source type system.
 * @param parentPath - Parent property path.
 * @returns Compatible properties list.
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
 * Analyze topic compatibility against data requirements.
 * @param topic - Datasource topic.
 * @param requirements - Widget data requirements.
 * @param pluginsManager - Plugins manager for raw schema access.
 * @returns Compatibility analysis result.
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

	// 1. Check direct webapp type match, then direct raw type match.
	const directMatch =
		requirements.accepts.includes(topic.type) ||
		!!(topic.rawType && requirements.acceptsRaw?.includes(topic.rawType));
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
		result.reason = describeRequirementsMismatch(topic, requirements);
	}

	return result;
};

/**
 * Build the "not compatible" reason string for a topic/requirements pair.
 * @param topic - Datasource topic.
 * @param requirements - Widget data requirements.
 * @returns Human-readable mismatch reason.
 */
const describeRequirementsMismatch = (
	topic: DatasourceTopic,
	requirements: DataRequirements,
): string => {
	const parts: string[] = [];
	if (requirements.accepts.length > 0) {
		parts.push(`webapp types: ${requirements.accepts.join(", ")}`);
	}
	if (requirements.acceptsRaw && requirements.acceptsRaw.length > 0) {
		parts.push(`raw types: ${requirements.acceptsRaw.join(", ")}`);
	}
	return `Topic type '${topic.type}' (raw '${topic.rawType}') and its properties don't match any of {${parts.join("; ")}}`;
};

/**
 * Synchronous compatibility check.
 * @param topic - Datasource topic.
 * @param requirements - Widget data requirements.
 * @returns True if compatible.
 */
export const isTopicCompatible = (
	topic: DatasourceTopic,
	requirements: DataRequirements | undefined,
): boolean => {
	if (!requirements) return true;

	// Direct webapp type match, then direct raw type match
	if (requirements.accepts.includes(topic.type)) return true;
	if (topic.rawType && requirements.acceptsRaw?.includes(topic.rawType))
		return true;

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
 * Filter topics to those compatible with requirements.
 * @param topics - Topics list.
 * @param requirements - Widget data requirements.
 * @param pluginsManager - Plugins manager for raw schema access.
 * @returns Compatible topics with analysis.
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
 * Get possible data sources for a widget.
 * @param topics - Topics list.
 * @param requirements - Widget data requirements.
 * @param pluginsManager - Plugins manager for raw schema access.
 * @returns Direct topics and compatible properties.
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
 * Resolve a $ref reference in a JSON schema.
 * @param ref - Reference string.
 * @param rootSchema - Root schema.
 * @returns Resolved schema or null.
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
 * Build a property tree from a JSON schema.
 * @param schema - JSON schema.
 * @param acceptedTypes - Accepted type list.
 * @param parentPath - Parent property path.
 * @param rootSchema - Root schema.
 * @returns Property tree nodes.
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
				const referencedSchema = resolveRef(
					propSchema.$ref,
					rootSchemaToUse,
				);
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
					? acceptedTypes.includes("*") ||
						acceptedTypes.includes(nodeType)
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
 * Build dual property trees for a topic.
 * @param topic - Datasource topic.
 * @param requirements - Widget data requirements.
 * @param pluginsManager - Plugins manager for raw schema access.
 * @returns Dual property tree.
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
				result.raw = buildPropertyTree(
					rawSchema,
					acceptedTypes,
					"",
					rawSchema,
				);
				result.hasRawData = true;
			}
		} catch (error) {
			// Raw schema not available - that's okay
		}
	}

	return result;
};

/**
 * Get compatible properties from a property tree.
 * @param nodes - Property tree nodes.
 * @param source - Source type system.
 * @returns Compatible properties list.
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
 * Analyze topic compatibility with property trees.
 * @param topic - Datasource topic.
 * @param requirements - Widget data requirements.
 * @param pluginsManager - Plugins manager for raw schema access.
 * @returns Compatibility analysis result.
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

	// 1. Check direct webapp type match, then direct raw type match
	const directMatch =
		requirements.accepts.includes(topic.type) ||
		!!(topic.rawType && requirements.acceptsRaw?.includes(topic.rawType));

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
			? describeRequirementsMismatch(topic, requirements)
			: undefined,
	};

	return result;
};

/**
 * Count compatible properties in a property tree.
 * @param nodes - Property tree nodes.
 * @returns Compatible property count.
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
 * Get tab info for dual property tree UI.
 * @param propertyTree - Dual property tree.
 * @returns Tab info payload.
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
 * Find a property node by path.
 * @param nodes - Property tree nodes.
 * @param targetPath - Property path.
 * @returns Matching node or null.
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
 * Get selectable properties from a property tree.
 * @param nodes - Property tree nodes.
 * @returns Selectable nodes.
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
 * Validate data requirements configuration.
 * @param requirements - Widget data requirements.
 * @param widgetId - Optional widget id.
 * @returns Validation errors.
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

	const hasWebapp = !!requirements.accepts && requirements.accepts.length > 0;
	const hasRaw =
		!!requirements.acceptsRaw && requirements.acceptsRaw.length > 0;
	if (!hasWebapp && !hasRaw) {
		errors.push(
			`Data requirements must specify at least one accepted data type (accepts or acceptsRaw)`,
		);
	}

	return errors;
};

/**
 * Get validation summary text for UI display.
 * @param errors - Validation errors.
 * @param compatibilityResult - Compatibility result.
 * @returns Summary text.
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
 * Get compatibility icon for UI display.
 * @param compatibilityResult - Compatibility result.
 * @returns Icon string.
 */
export const getCompatibilityIcon = (
	compatibilityResult?: TopicCompatibilityResult,
): string => {
	if (!compatibilityResult) return "❓";

	if (compatibilityResult.directMatch) return "✅";
	if (compatibilityResult.isCompatible) return "🔶";
	return "❌";
};
