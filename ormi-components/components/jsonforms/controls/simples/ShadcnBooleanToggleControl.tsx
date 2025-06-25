/*
  The MIT License

  Copyright (c) 2017-2021 EclipseSource Munich
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
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. INFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
'use client';
import { Switch } from "@/components/ui/switch"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    isBooleanControl,
    RankedTester,
    rankWith,
    ControlProps,
    optionIs,
    and,
    isDescriptionHidden,
} from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import React from 'react';

import styles from "../../../../src/styles/key.module.css";

export const ShadcnBooleanToggleControl = ({
    data,
    visible,
    label,
    id,
    enabled,
    uischema,
    handleChange,
    errors,
    path,
    config,
    description,
}: ControlProps) => {
    const isValid = errors.length === 0;
    const appliedUiSchemaOptions = merge({}, config, uischema.options);

    const showDescription = !isDescriptionHidden(
        visible,
        description,
        false,
        appliedUiSchemaOptions.showUnfocusedDescription
    );

    const showTooltip = !showDescription && !isDescriptionHidden(
        visible,
        description,
        true,
        true
    );

    if (!visible) {
        return null;
    }

    const control = (
        <div className={styles.cell}>
            <Switch
                id={id}
                checked={data || false}
                disabled={!enabled}
                onCheckedChange={(checked) => handleChange(path, checked)}
            />
            <label
                htmlFor={id}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
                {label}
            </label>
        </div>
    );

    return (
        <div className={styles.cell}>
            {showTooltip ? (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>{control}</TooltipTrigger>
                        <TooltipContent>{description}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                control
            )}

            {showDescription && (
                <p className="text-sm text-muted-foreground">{description}</p>
            )}

            {!isValid && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );
};

export const shadcnBooleanToggleControlTester: RankedTester = rankWith(
    5,
    and(isBooleanControl, optionIs('toggle', true))
);

export default withJsonFormsControlProps(ShadcnBooleanToggleControl);
