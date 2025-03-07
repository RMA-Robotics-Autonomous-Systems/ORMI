import React, { ComponentType, Dispatch } from 'react';
import { JsonFormsStateContext } from '@jsonforms/react';
import { ControlElement, JsonFormsRendererRegistryEntry, JsonSchema, JsonFormsCellRendererRegistryEntry, JsonFormsUISchemaRegistryEntry, ArrayTranslations } from '@jsonforms/core';
interface OwnPropsOfExpandPanel {
    enabled: boolean;
    index: number;
    path: string;
    uischema: ControlElement;
    schema: JsonSchema;
    expanded: boolean;
    renderers?: JsonFormsRendererRegistryEntry[];
    cells?: JsonFormsCellRendererRegistryEntry[];
    uischemas?: JsonFormsUISchemaRegistryEntry[];
    rootSchema: JsonSchema;
    enableMoveUp: boolean;
    enableMoveDown: boolean;
    config: any;
    childLabelProp?: string;
    handleExpansion(panel: string): (event: any, expanded: boolean) => void;
    translations: ArrayTranslations;
    disableRemove?: boolean;
}
interface StatePropsOfExpandPanel extends OwnPropsOfExpandPanel {
    childLabel: string;
    childPath: string;
    enableMoveUp: boolean;
    enableMoveDown: boolean;
}
/**
 * Dispatch props of a table control
 */
export interface DispatchPropsOfExpandPanel {
    removeItems(path: string, toDelete: number[]): (event: any) => void;
    moveUp(path: string, toMove: number): (event: any) => void;
    moveDown(path: string, toMove: number): (event: any) => void;
}
export interface ExpandPanelProps extends StatePropsOfExpandPanel, DispatchPropsOfExpandPanel {
}
export declare const ExpandPanelRenderer: React.MemoExoticComponent<(props: ExpandPanelProps) => import("react/jsx-runtime").JSX.Element>;
/**
 * Maps state to dispatch properties of an expand pandel control.
 *
 * @param dispatch the store's dispatch method
 * @returns {DispatchPropsOfArrayControl} dispatch props of an expand panel control
 */
export declare const ctxDispatchToExpandPanelProps: (dispatch: Dispatch<any>) => DispatchPropsOfExpandPanel;
/**
 * Map state to control props.
 * @param state the JSON Forms state
 * @param ownProps any own props
 * @returns {StatePropsOfControl} state props for a control
 */
export declare const withContextToExpandPanelProps: (Component: ComponentType<ExpandPanelProps>) => ComponentType<{
    ctx: JsonFormsStateContext;
    props: OwnPropsOfExpandPanel;
}>;
export declare const withJsonFormsExpandPanelProps: (Component: ComponentType<ExpandPanelProps>) => ComponentType<OwnPropsOfExpandPanel>;
declare const _default: React.ComponentType<OwnPropsOfExpandPanel>;
export default _default;
