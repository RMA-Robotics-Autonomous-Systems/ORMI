import { JsonSchema } from "@jsonforms/core";

interface MessageField {
    name: string;
    type: string;
    isArray: boolean;
    arraySize?: number;
    isConstant?: boolean;
    defaultValue?: any;
    nestedType?: MessageDefinition;
}

interface MessageDefinition {
    name: string;
    fields: MessageField[];
    constants?: { [key: string]: any };
    subTypes?: { [key: string]: MessageDefinition };  // Add support for nested types
}

function parseMessageDefinition(content: string): MessageDefinition[] {
    const lines = content.split('\n');
    const definitions: MessageDefinition[] = [];
    let currentDef: MessageDefinition | null = null;
    
    // Initialize first message definition
    currentDef = {
        name: "Message",
        fields: [],
        constants: {},
        subTypes: {}
    };

    let processingSubType = false;
    let currentSubTypeName = "";

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Handle sub-type declaration
        if (line.startsWith('MSG: ')) {
            processingSubType = true;
            currentSubTypeName = line.substring(5).trim();

            const names = currentSubTypeName.split('/');
            currentSubTypeName = names[names.length - 1];

            if (!currentDef.subTypes) currentDef.subTypes = {};
            currentDef.subTypes[currentSubTypeName] = {
                name: currentSubTypeName,
                fields: [],
                subTypes: {}
            };
            continue;
        }

        // Handle field definitions
        if (!line.startsWith('#') && !line.startsWith('===')) {
            const fieldMatch = line.match(/^(\w+)\s+(\w+)(\[\d*\])?/);
            if (fieldMatch) {
                const field: MessageField = {
                    name: fieldMatch[2],
                    type: fieldMatch[1],
                    isArray: !!fieldMatch[3],
                };
                
                if (processingSubType) {
                    if (!currentDef.subTypes) currentDef.subTypes = {};
                    currentDef.subTypes[currentSubTypeName].fields.push(field);
                } else {
                    currentDef.fields.push(field);
                }
            }
        }

        // Handle separator
        if (line.startsWith('===')) {
            processingSubType = false;
        }
    }

    definitions.push(currentDef);
    return definitions;
}

function ros2TypeToJsonSchema(field: MessageField): object {
    const typeMap: { [key: string]: object } = {
        'bool': { type: 'boolean' },
        'int8': { type: 'integer', minimum: -128, maximum: 127 },
        'uint8': { type: 'integer', minimum: 0, maximum: 255 },
        'int16': { type: 'integer', minimum: -32768, maximum: 32767 },
        'uint16': { type: 'integer', minimum: 0, maximum: 65535 },
        'int32': { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
        'uint32': { type: 'integer', minimum: 0, maximum: 4294967295 },
        'int64': { type: 'integer' },
        'uint64': { type: 'integer', minimum: 0 },
        'float32': { type: 'number' },
        'float64': { type: 'number' },
        'string': { type: 'string' },
        'time': { 
            type: 'object',
            properties: {
                sec: { type: 'integer' },
                nanosec: { type: 'integer', minimum: 0, maximum: 999999999 }
            },
            required: ['sec', 'nanosec']
        },
        'duration': {
            type: 'object',
            properties: {
                sec: { type: 'integer' },
                nanosec: { type: 'integer', minimum: 0, maximum: 999999999 }
            },
            required: ['sec', 'nanosec']
        }
    };

    if (field.isArray) {
        const itemSchema = typeMap[field.type] || { $ref: `#/definitions/${field.type}` };
        return {
            type: 'array',
            items: itemSchema,
            ...(field.arraySize ? { minItems: field.arraySize, maxItems: field.arraySize } : {})
        };
    }

    return typeMap[field.type] || { $ref: `#/definitions/${field.type}` };
}

function messageDefinitionToJsonSchema(definitions: MessageDefinition[]): JsonSchema {
    const schema: JsonSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: 'object',
        properties: {},
        required: [],
        definitions: {},
        additionalProperties: false
    };

    // First pass: create all definitions
    for (const def of definitions) {
        schema.definitions![def.name] = {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false
        };

        // Add sub-types
        if (def.subTypes) {
            for (const subType of Object.values(def.subTypes)) {
                schema.definitions![subType.name] = {
                    type: 'object',
                    properties: {},
                    required: [],
                    additionalProperties: false
                };

                for (const field of subType.fields) {
                    schema.definitions![subType.name].properties![field.name] = ros2TypeToJsonSchema(field);
                    if (!field.defaultValue) {
                        schema.definitions![subType.name]!.required!.push(field.name);
                    }
                }

            }
        }
    }

    // Second pass: fill in all properties
    for (const def of definitions) {
        const defSchema = schema.definitions![def.name];

        for (const field of def.fields) {
            defSchema.properties![field.name] = ros2TypeToJsonSchema(field);
            if (!field.defaultValue) {
                defSchema.required!.push(field.name);
            }
        }

        if (def.constants) {
            for (const [name, value] of Object.entries(def.constants)) {
                defSchema.properties![name] = {
                    const: value
                };
                defSchema.required!.push(name);
            }
        }
    }

    // Set the root message as the main schema
    if (definitions.length > 0) {
        schema.type = 'object';
        schema.properties = schema.definitions![definitions[0].name].properties;
        schema.required = schema.definitions![definitions[0].name].required;
        schema.additionalProperties = false;
    }

    return schema;
}

// Update the decodeTypeDefs function to return JSON Schema
export function decodeTypeDefs(rawDef: string): JsonSchema {
    const definitions = parseMessageDefinition(rawDef);
    return messageDefinitionToJsonSchema(definitions);
}
