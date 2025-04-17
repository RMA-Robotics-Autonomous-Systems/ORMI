// import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";
// import { JsonSchema7 } from "@jsonforms/core";

// /**
//  * Converts MessageDefinition[] array into a JSON Schema
//  * @param messageDefinitions - Array of message definitions
//  * @returns JSON Schema representation of the message definitions
//  */
// export function convertMessageDefinitionsToJsonSchema(
//   messageDefinitions: MessageDefinition[],
//   rootDefName: string
// ): JsonSchema7 {
//   // Create a map to easily look up message definitions by name
//   const definitionMap = new Map<string, MessageDefinition>();

//   // First pass: add all definitions to the map
//   for (const def of messageDefinitions) {
//     if (def.name) {
//       definitionMap.set(def.name, def);
//     }
//   }

//   // Second pass: convert each message definition to a schema
//   const schemas: Record<string, JsonSchema7> = {};
//   for (const def of messageDefinitions) {
//     if (def.name) {
//       schemas[def.name] = convertSingleMessageDefinitionToJsonSchema(def, definitionMap);
//     }
//   }

//   // Find the root message definition (the first one without references or the first in the list)
  
//   if (!rootDefName) {
//     throw new Error("Root message definition must have a name");
//   }

//   // Create the final schema
//   const jsonSchema: JsonSchema7 = {
//     $schema: "http://json-schema.org/draft-07/schema#",
//     type: "object",
//     title: rootDefName,
//     properties: schemas[rootDefName].properties,
//     definitions: {}
//   };

//   // Add required fields if present
//   if (schemas[rootDefName].required && schemas[rootDefName].required.length > 0) {
//     jsonSchema.required = schemas[rootDefName].required;
//   }

//   // Add all other message definitions as sub-schemas in definitions
//   for (const [name, schema] of Object.entries(schemas)) {
//     if (name !== rootDefName) {
//       // Use a simplified name for the definition
//       const simpleName = getSimplifiedName(name);
//       if (jsonSchema.definitions) {
//         jsonSchema.definitions[simpleName] = schema;
//       }
//     }
//   }

//   return jsonSchema;
// }

// /**
//  * Get a simplified name from a fully qualified name
//  * @param name - Full type name (e.g., 'geometry_msgs/msg/Point')
//  * @returns Simplified name (e.g., 'Point')
//  */
// function getSimplifiedName(name: string): string {
//   const parts = name.split(/[/:]/); // Split on / or :
//   return parts[parts.length - 1];
// }

// /**
//  * Converts a single MessageDefinition to JSON Schema
//  * @param messageDef - Message definition to convert
//  * @param definitionMap - Map of all available message definitions
//  * @returns JSON Schema representation of the message definition
//  */
// function convertSingleMessageDefinitionToJsonSchema(
//   messageDef: MessageDefinition,
//   definitionMap: Map<string, MessageDefinition>
// ): JsonSchema7 {
//   const properties: Record<string, JsonSchema7> = {};
//   const required: string[] = [];

//   for (const field of messageDef.definitions) {
//     // Skip constants as they're not part of the JSON Schema structure
//     if (field.isConstant) {
//       continue;
//     }

//     const fieldSchema = convertFieldToJsonSchema(field, definitionMap);
//     properties[field.name] = fieldSchema;

//     // Add to required fields if no default value is specified
//     if (field.defaultValue === undefined) {
//       required.push(field.name);
//     }
//   }

//   const schema: JsonSchema7 = {
//     type: "object",
//     properties,
//   };

//   if (required.length > 0) {
//     schema.required = required;
//   }

//   return schema;
// }

// /**
//  * Converts a MessageDefinitionField to JSON Schema property
//  * @param field - Field to convert
//  * @param definitionMap - Map of all available message definitions
//  * @returns JSON Schema representation of the field
//  */
// function convertFieldToJsonSchema(
//   field: MessageDefinitionField,
//   definitionMap: Map<string, MessageDefinition>
// ): JsonSchema7 {
//   // Handle arrays
//   if (field.isArray) {
//     const itemSchema = getSchemaForType(field.type, field.isComplex, definitionMap);
    
//     const arraySchema: JsonSchema7 = {
//       type: "array",
//       items: itemSchema,
//     };

//     // Handle fixed-length arrays
//     if (field.arrayLength !== undefined) {
//       arraySchema.minItems = field.arrayLength;
//       arraySchema.maxItems = field.arrayLength;
//     } else if (field.arrayUpperBound !== undefined) {
//       // Handle upper-bounded arrays
//       arraySchema.maxItems = field.arrayUpperBound;
//     }

//     // Add default value if provided
//     if (field.defaultValue !== undefined) {
//       arraySchema.default = field.defaultValue;
//     }

//     return arraySchema;
//   }

//   // Handle non-array types
//   const schema = getSchemaForType(field.type, field.isComplex, definitionMap);
  
//   // Add default value if provided
//   if (field.defaultValue !== undefined) {
//     schema.default = field.defaultValue;
//   }

//   // Handle string upper bound
//   if (field.type === "string" && field.upperBound !== undefined) {
//     schema.maxLength = field.upperBound;
//   }


//   return schema;
// }

// /**
//  * Gets the appropriate JSON Schema type for a given message type
//  * @param type - The message field type
//  * @param isComplex - Whether the type is a complex (user-defined) type
//  * @param definitionMap - Map of all available message definitions
//  * @returns JSON Schema representation for the type
//  */
// function getSchemaForType(
//   type: string,
//   isComplex: boolean | undefined,
//   definitionMap: Map<string, MessageDefinition>
// ): JsonSchema7 {
//   // If it's explicitly marked as complex, treat it as a reference to another type
//   if (isComplex === true) {
//     const simpleName = getSimplifiedName(type);
//     return { $ref: `#/definitions/${simpleName}` };
//   }

//   // Handle primitive types
//   switch (type) {
//     case "bool":
//     case "boolean":
//       return { type: "boolean" };

//     // Integer types
//     case "int8":
//     case "uint8":
//     case "int16":
//     case "uint16":
//     case "int32":
//     case "uint32":
//     case "int64":
//     case "uint64":
//       return { type: "integer" };
    
//     // Floating point types
//     case "float32":
//     case "float64":
//     case "float":
//     case "double":
//     case "number":
//       return { type: "number" };
      
//     case "string":
//     case "wstring":
//       return { type: "string" };
      
//     case "time":
//     case "duration":
//       return {
//         type: "object",
//         properties: {
//           sec: { type: "integer" },
//           nsec: { type: "integer" },
//         },
//         required: ["sec", "nsec"],
//       };

//     default:
//       // Check if this is a complex type by looking it up in the definition map
//       const complexDef = definitionMap.get(type);
//       if (complexDef) {
//         // Make a reference to the type, use a simplified name
//         const simpleName = getSimplifiedName(type);
//         return { $ref: `#/definitions/${simpleName}` };
//       }
      
//       // If not found, default to generic object
//       console.warn(`Unknown type ${type}, defaulting to generic object`);
//       return { type: "object" };
//   }
// }