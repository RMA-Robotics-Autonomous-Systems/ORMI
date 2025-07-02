import { JsonFormsRendererRegistryEntry } from "@jsonforms/core";
import AsyncTopicControl,{ asyncTopicTester } from "./topic-selector";


export const coreRenderer: JsonFormsRendererRegistryEntry[] = [
    { tester: asyncTopicTester, renderer: AsyncTopicControl },
];


export * from "./topic-selector";