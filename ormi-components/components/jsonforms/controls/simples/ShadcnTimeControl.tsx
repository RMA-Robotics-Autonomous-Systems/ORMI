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
'use client';
import React from 'react';
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
    ControlProps,
    isTimeControl,
    isDescriptionHidden,
    RankedTester,
    rankWith,
} from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import { useFocus } from '../../utils';

export const ShadcnTimeControl = (props: ControlProps) => {
    const [focused, onFocus, onBlur] = useFocus();
    const {
        id,
        description,
        errors,
        label,
        uischema,
        visible,
        enabled,
        required,
        path,
        handleChange,
        data,
        config,
    } = props;

    const isValid = errors.length === 0;
    const appliedUiSchemaOptions = merge({}, config, uischema.options);

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
        <div className="space-y-2">
            <Label
                htmlFor={id}
                className={cn(
                    "text-sm font-medium leading-none",
                    required && "after:text-red-500 after:content-['*']"
                )}
            >
                {label}
            </Label>

            <Input
                type="time"
                id={id}
                value={data || ''}
                onChange={(e) => handleChange(path, e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
                disabled={!enabled}
                className={cn(
                    "w-full",
                    !isValid && "border-red-500"
                )}
            />

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

export const shadcnTimeControlTester: RankedTester = rankWith(
    5,
    isTimeControl
);

export default withJsonFormsControlProps(ShadcnTimeControl);
