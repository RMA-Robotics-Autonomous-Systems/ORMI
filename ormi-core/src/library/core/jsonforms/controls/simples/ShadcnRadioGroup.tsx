/*
  The MIT License

  Copyright (c) 2017-2019 EclipseSource Munich
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
import { RadioGroup, RadioGroupItem } from "@/library/components/ui/radio-group"
import { Label } from "@/library/components/ui/label"
import { cn } from "@/library/lib/utils"
import merge from 'lodash/merge';
import React from 'react';
import {
    ControlProps,
    isDescriptionHidden,
    OwnPropsOfEnum,
} from '@jsonforms/core';
import { useFocus } from '../../utils';

export const ShadcnRadioGroup = (props: ControlProps & OwnPropsOfEnum) => {
    const [focused, onFocus, onBlur] = useFocus();
    const {
        config,
        label,
        required,
        description,
        errors,
        data,
        visible,
        options,
        handleChange,
        path,
        enabled,
        id
    } = props;

    const isValid = errors.length === 0;
    const appliedUiSchemaOptions = merge({}, config, props.uischema.options);
    const showDescription = !isDescriptionHidden(
        visible,
        description,
        focused,
        appliedUiSchemaOptions.showUnfocusedDescription
    );

    if (!visible) {
        return null;
    }

    return (
        <div
            className={cn(
                "space-y-2",
                !appliedUiSchemaOptions.trim && "w-full"
            )}
            onFocus={onFocus}
            onBlur={onBlur}
        >
            <Label
                className={cn(
                    "text-sm font-medium leading-none",
                    required && "after:text-red-500 after:content-['*']",
                    !isValid && "text-destructive"
                )}
            >
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
                        <RadioGroupItem
                            value={option.value}
                            id={`${id}-${option.value}`}
                        />
                        <Label htmlFor={`${id}-${option.value}`}>
                            {option.label}
                        </Label>
                    </div>
                ))}
            </RadioGroup>

            {showDescription && (
                <p className="text-sm text-muted-foreground">
                    {description}
                </p>
            )}

            {!isValid && (
                <p className="text-sm text-destructive">
                    {errors}
                </p>
            )}
        </div>
    );
};

export default ShadcnRadioGroup;
