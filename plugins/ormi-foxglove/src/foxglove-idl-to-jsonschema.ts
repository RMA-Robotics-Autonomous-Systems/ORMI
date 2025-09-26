import { JsonSchema } from "@jsonforms/core";

// Type definitions for Foxglove parsed message structures
interface FoxgloveField {
  name: string;
  type: string;
  isComplex: boolean;
  isArray: boolean;
  arrayUpperBound?: number;
  isConstant?: boolean;
  value?: any;
}

interface FoxgloveMessageDefinition {
  name?: string;
  definitions: FoxgloveField[];
}

/**
 * Converts Foxglove parsed IDL structure to JsonSchema format
 * @param parsedIDL - The result from @foxglove/rosmsg parse function
 * @returns JsonSchema compatible with JsonForms
 */
export function foxgloveIdlToJsonSchema(parsedIDL: any): JsonSchema {
  // parsedIDL is an array where each element is a message definition
  const definitions = Array.isArray(parsedIDL) ? parsedIDL : [parsedIDL];

  const schema: JsonSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {},
    required: [],
    definitions: {},
    additionalProperties: false,
  };

  if (!schema.definitions) {
    schema.definitions = {};
  }

  // First pass: create all type definitions
  for (const def of definitions) {
    const defName = def.name || "Message";

    schema.definitions[defName] = {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    };
  }

  // Second pass: fill in all properties
  for (const def of definitions) {
    const defName = def.name || "Message";
    const defSchema = schema.definitions[defName];

    if (!defSchema || !def.definitions) continue;

    if (!defSchema.properties) defSchema.properties = {};
    if (!defSchema.required) defSchema.required = [];

    // Process each field in the definitions array
    for (const field of def.definitions) {
      if (!field || !field.name) continue;

      defSchema.properties[field.name] = foxgloveFieldToJsonSchema(field);

      // Add to required if not constant and no default value
      if (!field.isConstant && field.value === undefined) {
        defSchema.required.push(field.name);
      }
    }
  }

  // Set the root message as the main schema
  if (definitions.length > 0) {
    const rootDef = definitions[0];
    const rootName = rootDef?.name || "Message";

    if (rootName && schema.definitions && schema.definitions[rootName]) {
      const rootSchema = schema.definitions[rootName];
      if (rootSchema && typeof rootSchema === "object") {
        schema.type = "object";
        schema.properties = rootSchema.properties;
        schema.required = rootSchema.required;
        schema.additionalProperties = false;
      }
    }
  }

  return schema;
}

/**
 * Converts a Foxglove field definition to JsonSchema property
 */
function foxgloveFieldToJsonSchema(field: FoxgloveField): any {
  const typeMap: { [key: string]: any } = {
    bool: { type: "boolean" },
    boolean: { type: "boolean" },
    int8: { type: "integer", minimum: -128, maximum: 127 },
    uint8: { type: "integer", minimum: 0, maximum: 255 },
    int16: { type: "integer", minimum: -32768, maximum: 32767 },
    uint16: { type: "integer", minimum: 0, maximum: 65535 },
    int32: { type: "integer", minimum: -2147483648, maximum: 2147483647 },
    uint32: { type: "integer", minimum: 0, maximum: 4294967295 },
    int64: { type: "integer" },
    uint64: { type: "integer", minimum: 0 },
    float32: { type: "number" },
    float64: { type: "number" },
    string: { type: "string" },
    time: {
      type: "object",
      properties: {
        sec: { type: "integer" },
        nanosec: { type: "integer", minimum: 0, maximum: 999999999 },
      },
      required: ["sec", "nanosec"],
    },
    duration: {
      type: "object",
      properties: {
        sec: { type: "integer" },
        nanosec: { type: "integer", minimum: 0, maximum: 999999999 },
      },
      required: ["sec", "nanosec"],
    },
  };

  if (!field.type) {
    return { type: "string" }; // fallback
  }

  // Handle constants
  if (field.isConstant && field.value !== undefined) {
    return {
      type: typeMap[field.type]?.type || "string",
      const: field.value,
    };
  }

  // Handle arrays
  if (field.isArray) {
    const itemSchema = typeMap[field.type] || {
      $ref: `#/definitions/${field.type}`,
    };
    const arraySchema: any = {
      type: "array",
      items: itemSchema,
    };

    // Handle bounded arrays using arrayUpperBound
    if (field.arrayUpperBound && field.arrayUpperBound > 0) {
      arraySchema.maxItems = field.arrayUpperBound;
    }

    return arraySchema;
  }

  // Handle complex types (references to other message types)
  if (field.isComplex) {
    return { $ref: `#/definitions/${field.type}` };
  }

  // Handle basic types
  return typeMap[field.type] || { type: "string" };
}
