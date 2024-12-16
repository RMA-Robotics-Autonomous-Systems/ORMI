import { JsonSchema } from "@jsonforms/core";
import { TreeViewBaseItem } from "@mui/x-tree-view/models";

interface TreeViewItem extends TreeViewBaseItem {
    id: string;
    label: string;
    children: TreeViewItem[];
}

export function generateTreeView(schema: JsonSchema): TreeViewItem[] {

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
    ): TreeViewItem => {
        const id = parentId ? `${parentId}-${propertyName}` : propertyName;

        // Handle $ref
        if (propertySchema.$ref) {
            const refSchema = resolveRef(propertySchema.$ref);
            const refType = propertySchema.$ref.split('/').pop();

            return {
                id,
                label: `${propertyName}: ${refType}`,
                children: Object.entries(refSchema.properties || {}).map(([childName, childSchema]) =>
                    processProperty(childName, childSchema, id)
                )
            };
        }

        // Handle regular properties
        return {
            id,
            label: `${propertyName}: ${propertySchema.type}`,
            children: []
        };
    };

    // Process root properties
    return Object.entries(schema.properties || {}).map(([propName, propSchema]) =>
        processProperty(propName, propSchema)
    );
}


