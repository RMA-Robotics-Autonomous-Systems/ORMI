import React from 'react';
import { ControlElement, JsonSchema, ArrayTranslations } from '@jsonforms/core';
export interface ShadcnTableToolbarProps {
    numColumns: number;
    errors: string;
    label: string;
    description: string;
    path: string;
    uischema: ControlElement;
    schema: JsonSchema;
    rootSchema: JsonSchema;
    enabled: boolean;
    translations: ArrayTranslations;
    addItem(path: string, value: any): () => void;
    disableAdd?: boolean;
}
export declare const TableToolbar: React.NamedExoticComponent<ShadcnTableToolbarProps>;
export default TableToolbar;
