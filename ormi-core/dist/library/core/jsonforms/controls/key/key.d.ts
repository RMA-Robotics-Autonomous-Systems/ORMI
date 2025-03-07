import { ControlElement } from '@jsonforms/core';
import React from 'react';
declare const _default: React.ComponentType<import("@jsonforms/core").OwnPropsOfControl>;
export default _default;
declare const keySelectorTester: (uischema: import("@jsonforms/core").UISchemaElement, schema: import("@jsonforms/core").JsonSchema, context: import("@jsonforms/core").TesterContext) => number;
export { keySelectorTester };
export interface KeyControlType extends Omit<ControlElement, 'type'> {
    type: 'Key';
}
