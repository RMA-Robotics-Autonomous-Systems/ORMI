import { TreeDataItem } from "../../../library/components/tree-view";
import { JsonSchema } from "@jsonforms/core";
export declare function generateTreeView(schema: JsonSchema, handlePropertyChange: (itemId: string) => void): TreeDataItem[];
