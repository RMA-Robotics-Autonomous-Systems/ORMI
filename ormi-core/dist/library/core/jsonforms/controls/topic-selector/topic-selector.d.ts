import { JsonSchema, ControlElement } from '@jsonforms/core';
import React from 'react';
declare const _default: React.ComponentType<import("@jsonforms/core").OwnPropsOfControl>;
export default _default;
declare const asyncTopicTester: (uischema: import("@jsonforms/core").UISchemaElement, schema: JsonSchema, context: import("@jsonforms/core").TesterContext) => number;
export { asyncTopicTester };
export interface AsyncTopicControlType extends Omit<ControlElement, 'type'> {
    type: 'TopicSelect';
}
