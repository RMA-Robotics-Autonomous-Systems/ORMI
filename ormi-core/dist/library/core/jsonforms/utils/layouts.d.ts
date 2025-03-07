import React, { ComponentType } from 'react';
import type { UISchemaElement } from '@jsonforms/core';
import { JsonFormsCellRendererRegistryEntry, JsonFormsRendererRegistryEntry, JsonSchema, OwnPropsOfRenderer } from '@jsonforms/core';
export declare const renderLayoutElements: (elements: UISchemaElement[], schema: JsonSchema, path: string, enabled: boolean, renderers?: JsonFormsRendererRegistryEntry[], cells?: JsonFormsCellRendererRegistryEntry[]) => import("react/jsx-runtime").JSX.Element[];
export interface shadcnLayoutRendererProps extends OwnPropsOfRenderer {
    elements: UISchemaElement[];
    direction: 'row' | 'column';
}
export declare const ShadcnLayoutRenderer: React.MemoExoticComponent<({ elements, schema, path, enabled, direction, renderers, cells, }: shadcnLayoutRendererProps) => import("react/jsx-runtime").JSX.Element | null>;
export interface AjvProps {
    ajv: any;
}
export declare const withAjvProps: <P extends {}>(Component: ComponentType<AjvProps & P>) => (props: P) => import("react/jsx-runtime").JSX.Element;
export interface shadcnLabelableLayoutRendererProps extends shadcnLayoutRendererProps {
    label?: string;
}
