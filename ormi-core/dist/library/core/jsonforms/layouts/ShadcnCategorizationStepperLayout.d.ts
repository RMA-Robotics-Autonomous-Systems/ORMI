import { RankedTester, StatePropsOfLayout } from '@jsonforms/core';
import { TranslateProps } from '@jsonforms/react';
import { AjvProps } from '../utils/layouts';
export declare const shadcnCategorizationStepperTester: RankedTester;
export interface CategorizationStepperState {
    activeCategory: number;
}
export interface ShadcnCategorizationStepperLayoutRendererProps extends StatePropsOfLayout, AjvProps, TranslateProps {
    data: any;
}
export declare const ShadcnCategorizationStepperLayoutRenderer: (props: ShadcnCategorizationStepperLayoutRendererProps) => import("react/jsx-runtime").JSX.Element | null;
declare const _default: (props: ShadcnCategorizationStepperLayoutRendererProps & import("@jsonforms/core").OwnPropsOfLayout) => import("react/jsx-runtime").JSX.Element;
export default _default;
