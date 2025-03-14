/*
  The MIT License

  Copyright (c) 2018-2020 EclipseSource Munich
  https://github.com/eclipsesource/jsonforms

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
import React from 'react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
    and,
    ControlProps,
    isOneOfEnumControl,
    optionIs,
    OwnPropsOfEnum,
    RankedTester,
    rankWith,
    isDescriptionHidden,
} from '@jsonforms/core';
import { withJsonFormsOneOfEnumProps } from '@jsonforms/react';
import merge from 'lodash/merge';

export const ShadcnRadioGroup = ({
    data,
    enabled,
    id,
    label,
    options,
    path,
    handleChange,
    errors,
    description,
    config,
    uischema,
}: ControlProps & OwnPropsOfEnum) => {
    const isValid = errors.length === 0;
    const appliedUiSchemaOptions = merge({}, config, uischema.options);
    const showDescription = !isDescriptionHidden(
        true,
        description,
        false,
        appliedUiSchemaOptions.showUnfocusedDescription
    );

    return (
        <div className="space-y-2">
            <Label className={cn(
                "text-sm font-medium",
                !isValid && "text-destructive"
            )}>
                {label}
            </Label>
            <RadioGroup
                defaultValue={data}
                onValueChange={(value) => handleChange(path, value)}
                disabled={!enabled}
                className="space-y-1"
            >
                {options!.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={option.value} id={`${id}-${option.value}`} />
                        <Label htmlFor={`${id}-${option.value}`}>{option.label}</Label>
                    </div>
                ))}
            </RadioGroup>

            {showDescription && (
                <p className="text-sm text-muted-foreground">{description}</p>
            )}

            {!isValid && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );
};

export const ShadcnOneOfRadioGroupControl = (props: ControlProps & OwnPropsOfEnum) => {
    return <ShadcnRadioGroup {...props} />;
};

export const shadcnOneOfRadioGroupControlTester: RankedTester = rankWith(
    21,
    and(isOneOfEnumControl, optionIs('format', 'radio'))
);

export default withJsonFormsOneOfEnumProps(ShadcnOneOfRadioGroupControl);
