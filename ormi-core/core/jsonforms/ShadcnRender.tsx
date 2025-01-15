import AsyncSelectControl, { asyncSelectTester } from '@/core/jsonforms/controls/async-select/async-select-control';
import colorSelect, { colorSelectTester } from "@/core/jsonforms/controls/color-select/color-select";
import SwitchControl, { switchTester } from "@/core/jsonforms/controls/switch/switch-render";
import TextControl, { TextTester } from "@/core/jsonforms/controls/text-input/text-input";
import NumberControl, { NumberTester } from "@/core/jsonforms/controls/number-input/number-input";
import AsyncTopicControl, { asyncTopicTester } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import KeySelectorControl, { keySelectorTester } from "@/core/jsonforms/controls/key/key";
import shadcnArrayLayoutRenderer, { shadcnArrayLayoutTester } from "@/core/jsonforms/layouts/ShadcnArrayLayoutRenderer";
import { shadcnVerticalLayoutTester, ShadcnVerticalLayoutRenderer } from './layouts/ShadcnVerticalLayout';
import { ShadcnHorizontalLayoutRenderer, shadcnHorizontalLayoutTester } from './layouts/ShadcnHorizontalLayout';
import { ShadcnGroupLayoutRenderer, shadcnGroupTester } from './layouts/ShadcnGroupLayout';
import ShadcnCategorizationStepperLayout, { shadcnCategorizationStepperTester } from './layouts/ShadcnCategorizationStepperLayout';
import ShadcnCategorizationLayout, { shadcnCategorizationTester } from './layouts/ShadcnCategorizationLayout';
import ShadcnArrayControlRenderer, { shadcnArrayControlTester } from './controls/tables/ShadcnArrayControlRenderer';

const shadcnRenderer = [
    { tester: shadcnArrayLayoutTester, renderer: shadcnArrayLayoutRenderer },
    { tester: asyncSelectTester, renderer: AsyncSelectControl },
    { tester: colorSelectTester, renderer: colorSelect },
    { tester: switchTester, renderer: SwitchControl },
    { tester: TextTester, renderer: TextControl },
    { tester: NumberTester, renderer: NumberControl },
    { tester: asyncTopicTester, renderer: AsyncTopicControl },
    { tester: keySelectorTester, renderer: KeySelectorControl },
    { tester: shadcnVerticalLayoutTester, renderer: ShadcnVerticalLayoutRenderer },
    { tester: shadcnHorizontalLayoutTester, renderer: ShadcnHorizontalLayoutRenderer },
    { tester: shadcnGroupTester, renderer: ShadcnGroupLayoutRenderer },
    {
        tester: shadcnCategorizationTester,
        renderer: ShadcnCategorizationLayout,
    },
    {
        tester: shadcnCategorizationStepperTester,
        renderer: ShadcnCategorizationStepperLayout,
    },
    {
        tester: shadcnArrayControlTester,
        renderer: ShadcnArrayControlRenderer,
    }
];

export default shadcnRenderer;