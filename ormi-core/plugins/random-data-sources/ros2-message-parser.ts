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
}

function parseMessageDefinition(content: string): MessageDefinition[] {
    const lines = content.split('\n');
    const definitions: MessageDefinition[] = [];
    let currentDef: MessageDefinition | null = null;
    let currentComments: string[] = [];

    // Create default message definition if no explicit name
    currentDef = {
        name: "Message", // Default name if none specified
        fields: [],
    } as MessageDefinition;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Handle comments
        if (line.startsWith('#')) {
            currentComments.push(line.substring(1).trim());
            continue;
        }

        // Check for msg definition separator
        if (line.startsWith('===')) {
            if (currentDef) {
                if (currentComments.length > 0) {
                    currentComments = [];
                }
                definitions.push(currentDef);
            }
            currentDef = null;
            continue;
        }

        // Parse message name if found
        const msgMatch = line.match(/^msg:\s*([A-Za-z0-9_]+)$/);
        if (msgMatch) {
            if (currentDef) {

                definitions.push(currentDef);
            }
            currentDef = {
                name: msgMatch[1],
                fields: [],

            };
            continue;
        }

        // Parse field definition
        const fieldMatch = line.match(/^([a-zA-Z0-9_/]+)(\[\]|\[\d+\])?\s+([a-zA-Z0-9_]+)(\s*=\s*(.+))?$/);
        if (fieldMatch && currentDef) {
            const [_, type, arrayDef, name, __, defaultValue] = fieldMatch;
            const field: MessageField = {
                name,
                type,
                isArray: !!arrayDef,
                arraySize: arrayDef ? parseInt(arrayDef.replace(/[\[\]]/g, '')) || undefined : undefined
            };

            if (defaultValue) {
                field.defaultValue = parseDefaultValue(type, defaultValue.trim());
            }

            currentDef.fields.push(field);
            continue;
        }
    }

    // Add final definition and comments
    if (currentDef) {
        definitions.push(currentDef);
    }

    return definitions;
}

function parseConstValue(type: string, value: string): any {
    switch (type) {
        case 'bool':
            return value.toLowerCase() === 'true';
        case 'int8':
        case 'uint8':
        case 'int16':
        case 'uint16':
        case 'int32':
        case 'uint32':
        case 'int64':
        case 'uint64':
            return parseInt(value);
        case 'float32':
        case 'float64':
            return parseFloat(value);
        case 'string':
            return value.replace(/^["']|["']$/g, '');
        default:
            return value;
    }
}

function parseDefaultValue(type: string, value: string): any {
    if (value === 'None' || value === '') return null;
    return parseConstValue(type, value);
}

function ros2TypeToJsonSchema(field: MessageField, definitions: MessageDefinition[]): object {
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
    const schema: any = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: 'object',
        properties: {},
        required: [],
        definitions: {},
        additionalProperties: false
    };

    // First pass: create all definitions
    for (const def of definitions) {
        schema.definitions[def.name] = {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false
        };
    }

    // Second pass: fill in all properties
    for (const def of definitions) {
        const defSchema = schema.definitions[def.name];

        for (const field of def.fields) {
            defSchema.properties[field.name] = ros2TypeToJsonSchema(field, definitions);
            if (!field.defaultValue) {
                defSchema.required.push(field.name);
            }
        }

        if (def.constants) {
            for (const [name, value] of Object.entries(def.constants)) {
                defSchema.properties[name] = {
                    const: value
                };
                defSchema.required.push(name);
            }
        }
    }

    // Set the root message as the main schema
    if (definitions.length > 0) {
        schema.type = 'object';
        schema.properties = schema.definitions[definitions[0].name].properties;
        schema.required = schema.definitions[definitions[0].name].required;
        schema.additionalProperties = false;
    }

    return schema;
}

// Update the decodeTypeDefs function to return JSON Schema
export function decodeTypeDefs(rawDef: string): JsonSchema {
    const definitions = parseMessageDefinition(rawDef);
    return messageDefinitionToJsonSchema(definitions);
}
