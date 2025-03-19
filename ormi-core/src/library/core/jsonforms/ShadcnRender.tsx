import AsyncSelectControl, { asyncSelectTester } from '@/library/core/jsonforms/controls/async-select/async-select-control';
import colorSelect, { colorSelectTester } from "@/library/core/jsonforms/controls/color-select/color-select";
import SwitchControl, { switchTester } from "@/library/core/jsonforms/controls/switch/switch-render";
import TextControl, { TextTester } from "@/library/core/jsonforms/controls/text-input/text-input";
import NumberControl, { NumberTester } from "@/library/core/jsonforms/controls/number-input/number-input";
import AsyncTopicControl, { asyncTopicTester } from "@/library/core/jsonforms/controls/topic-selector/topic-selector";
import KeySelectorControl, { keySelectorTester } from "@/library/core/jsonforms/controls/key/key";
import shadcnArrayLayoutRenderer, { shadcnArrayLayoutTester } from "@/library/core/jsonforms/layouts/ShadcnArrayLayoutRenderer";
import { shadcnVerticalLayoutTester, ShadcnVerticalLayoutRenderer } from './layouts/ShadcnVerticalLayout';
import { ShadcnHorizontalLayoutRenderer, shadcnHorizontalLayoutTester } from './layouts/ShadcnHorizontalLayout';
import { ShadcnGroupLayoutRenderer, shadcnGroupTester } from './layouts/ShadcnGroupLayout';
import ShadcnCategorizationStepperLayout, { shadcnCategorizationStepperTester } from './layouts/ShadcnCategorizationStepperLayout';
import ShadcnCategorizationLayout, { shadcnCategorizationTester } from './layouts/ShadcnCategorizationLayout';
import ShadcnArrayControlRenderer, { shadcnArrayControlTester } from './controls/tables/ShadcnArrayControlRenderer';
import { ShadcnBooleanControl, shadcnBooleanControlTester, ShadcnBooleanToggleControl, shadcnBooleanToggleControlTester, ShadcnDateControl, shadcnDateControlTester, ShadcnDateTimeControl, shadcnDateTimeControlTester, ShadcnEnumControl, shadcnEnumControlTester, ShadcnIntegerControl, shadcnIntegerControlTester, ShadcnNativeControl, shadcnNativeControlTester, ShadcnNumberControl, shadcnNumberControlTester, ShadcnOneOfEnumControl, shadcnOneOfEnumControlTester, ShadcnOneOfRadioGroupControl, shadcnOneOfRadioGroupControlTester, ShadcnRadioGroupControl, shadcnRadioGroupControlTester, ShadcnSliderControl, shadcnSliderControlTester, ShadcnTextControl, shadcnTextControlTester, ShadcnTimeControl, shadcnTimeControlTester } from './controls/simples';
import { ShadcnBooleanCell, shadcnBooleanCellTester, ShadcnBooleanToggleCell, shadcnBooleanToggleCellTester, ShadcnDateCell, shadcnDateCellTester, ShadcnEnumCell, shadcnEnumCellTester, ShadcnIntegerCell, shadcnIntegerCellTester, ShadcnNumberCell, shadcnNumberCellTester, ShadcnNumberFormatCell, shadcnNumberFormatCellTester, ShadcnOneOfEnumCell, shadcnOneOfEnumCellTester, ShadcnTextCell, shadcnTextCellTester, ShadcnTimeCell, shadcnTimeCellTester } from './controls/cells';
import { JsonFormsCellRendererRegistryEntry, JsonFormsRendererRegistryEntry } from '@jsonforms/core';
import ShadcnColorCell, { shadcnColorCellTester } from './controls/cells/ShadcnColorCell';
import ShadcnColorControl, { shadcnColorControlTester } from './controls/simples/ShadcnColorControl';


export const shadcnRenderer: JsonFormsRendererRegistryEntry[] = [
    { tester: shadcnArrayLayoutTester, renderer: shadcnArrayLayoutRenderer },
    { tester: asyncSelectTester, renderer: AsyncSelectControl },
    { tester: colorSelectTester, renderer: colorSelect },
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
    },


    // simples controls
    { tester: shadcnNativeControlTester, renderer: ShadcnNativeControl },
    { tester: shadcnEnumControlTester, renderer: ShadcnEnumControl },
    { tester: shadcnIntegerControlTester, renderer: ShadcnIntegerControl },
    { tester: shadcnNumberControlTester, renderer: ShadcnNumberControl },
    { tester: shadcnTextControlTester, renderer: ShadcnTextControl },
    { tester: shadcnDateTimeControlTester, renderer: ShadcnDateTimeControl },
    { tester: shadcnDateControlTester, renderer: ShadcnDateControl },
    { tester: shadcnTimeControlTester, renderer: ShadcnTimeControl },
    { tester: shadcnSliderControlTester, renderer: ShadcnSliderControl },
    {
        tester: shadcnArrayControlTester,
        renderer: ShadcnArrayControlRenderer,
    },
    { tester: shadcnBooleanControlTester, renderer: ShadcnBooleanControl },
    {
        tester: shadcnBooleanToggleControlTester,
        renderer: ShadcnBooleanToggleControl,
    },

    {
        tester: shadcnRadioGroupControlTester,
        renderer: ShadcnRadioGroupControl,
    },
    {
        tester: shadcnOneOfRadioGroupControlTester,
        renderer: ShadcnOneOfRadioGroupControl,
    },
    {
        tester: shadcnOneOfEnumControlTester,
        renderer: ShadcnOneOfEnumControl,
    },
    {
        tester: shadcnColorControlTester,
        renderer: ShadcnColorControl,
    }

];


export const shadcnCells: JsonFormsCellRendererRegistryEntry[] = [
    { tester: shadcnBooleanCellTester, cell: ShadcnBooleanCell },
    { tester: shadcnBooleanToggleCellTester, cell: ShadcnBooleanToggleCell },
    { tester: shadcnDateCellTester, cell: ShadcnDateCell },
    { tester: shadcnEnumCellTester, cell: ShadcnEnumCell },
    { tester: shadcnIntegerCellTester, cell: ShadcnIntegerCell },
    { tester: shadcnNumberCellTester, cell: ShadcnNumberCell },
    { tester: shadcnNumberFormatCellTester, cell: ShadcnNumberFormatCell },
    { tester: shadcnOneOfEnumCellTester, cell: ShadcnOneOfEnumCell },
    { tester: shadcnTextCellTester, cell: ShadcnTextCell },
    { tester: shadcnTimeCellTester, cell: ShadcnTimeCell },
    { tester: shadcnColorCellTester, cell: ShadcnColorCell },
];