import { JsonFormsCellRendererRegistryEntry } from '@jsonforms/core';
declare const shadcnRenderer: ({
    tester: import("@jsonforms/core").RankedTester;
    renderer: import("react").ComponentType<import("@jsonforms/core").OwnPropsOfControl>;
} | {
    tester: import("@jsonforms/core").RankedTester;
    renderer: (props: import("./layouts/ShadcnCategorizationLayout").ShadcnCategorizationLayoutRendererProps & import("@jsonforms/core").OwnPropsOfLayout) => import("react/jsx-runtime").JSX.Element;
} | {
    tester: import("@jsonforms/core").RankedTester;
    renderer: (props: import("./layouts/ShadcnCategorizationStepperLayout").ShadcnCategorizationStepperLayoutRendererProps & import("@jsonforms/core").OwnPropsOfLayout) => import("react/jsx-runtime").JSX.Element;
} | {
    tester: import("@jsonforms/core").RankedTester;
    renderer: import("react").ComponentType<import("@jsonforms/core").OwnPropsOfControl & import("@jsonforms/core").OwnPropsOfEnum>;
})[];
export declare const shadcnCells: JsonFormsCellRendererRegistryEntry[];
export default shadcnRenderer;
