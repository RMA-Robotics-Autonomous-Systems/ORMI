import React from 'react';
import { ArrayTranslations } from '@jsonforms/core';
export interface ArrayLayoutToolbarProps {
    label: string;
    description: string;
    errors: string;
    path: string;
    enabled: boolean;
    addItem(path: string, data: any): () => void;
    createDefault(): any;
    translations: ArrayTranslations;
    disableAdd?: boolean;
}
export declare const ArrayLayoutToolbar: React.NamedExoticComponent<ArrayLayoutToolbarProps>;
