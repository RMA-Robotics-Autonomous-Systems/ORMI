import { RankedTester, StatePropsOfLayout, Tester } from '@jsonforms/core';
import { TranslateProps } from '@jsonforms/react';
import { AjvProps } from '../utils/layouts';
export declare const isSingleLevelCategorization: Tester;
export declare const shadcnCategorizationTester: RankedTester;
export interface CategorizationState {
    activeCategory: number;
}
export interface ShadcnCategorizationLayoutRendererProps extends StatePropsOfLayout, AjvProps, TranslateProps {
    selected?: number;
    ownState?: boolean;
    data?: any;
    onChange?(selected: number, prevSelected: number): void;
}
export declare const ShadcnCategorizationLayoutRenderer: (props: ShadcnCategorizationLayoutRendererProps) => import("react/jsx-runtime").JSX.Element | null;
declare const _default: (props: ShadcnCategorizationLayoutRendererProps & import("@jsonforms/core").OwnPropsOfLayout) => import("react/jsx-runtime").JSX.Element;
export default _default;
