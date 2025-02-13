import { TreeDataItem } from "@/components/tree-view";
import { JsonSchema } from "@jsonforms/core";


export function generateTreeView(schema: JsonSchema, handlePropertyChange: (itemId: string) => void): TreeDataItem[] {

    const resolveRef = (ref: string): JsonSchema => {

        if (!schema.definitions) {
            return schema;
        }

        return schema.definitions[ref.replaceAll('#/definitions/', '')];
    };

    const processProperty = (
        propertyName: string,
        propertySchema: JsonSchema,
        parentId = ''
    ): TreeDataItem => {
        const id = parentId ? `${parentId}-${propertyName}` : propertyName;

        // Handle $ref
        if (propertySchema.$ref) {
            const refSchema = resolveRef(propertySchema.$ref);
            const refType = propertySchema.$ref.split('/').pop();

            if (!refSchema) {
                return {
                    id,
                    name: `${propertyName}: ${refType}`,
                    children: [],
                    onClick: () => handlePropertyChange(id)
                };
            }

            return {
                id,
                name: `${propertyName}: ${refType}`,
                children: Object.entries(refSchema.properties || {}).map(([childName, childSchema]) =>
                    processProperty(childName, childSchema, id)
                ),
                onClick: () => handlePropertyChange(id)
            };
        }

        // Handle regular properties
        return {
            id,
            name: `${propertyName}: ${propertySchema.type}`,
            children: [],
            onClick: () => handlePropertyChange(id)
        };
    };

    // Process root properties
    return Object.entries(schema.properties || {}).map(([propName, propSchema]) =>
        processProperty(propName, propSchema)
    );
}


