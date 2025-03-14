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
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { CalendarIcon } from "@radix-ui/react-icons"
import {
    ControlProps,
    isDateControl,
    isDescriptionHidden,
    RankedTester,
    rankWith,
} from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import merge from 'lodash/merge';
import React from 'react';

import style from "@/core/jsonforms/utils/renderer.module.css";

export const ShadcnDateControl = ({
    description,
    errors,
    uischema,
    visible,
    enabled,
    path,
    handleChange,
    data,
    config,
}: ControlProps) => {
    const isValid = errors.length === 0;
    const appliedUiSchemaOptions = merge({}, config, uischema.options);
    const format = appliedUiSchemaOptions.dateFormat ?? 'yyyy-MM-dd';

    const showDescription = !isDescriptionHidden(
        visible,
        description,
        false,
        appliedUiSchemaOptions.showUnfocusedDescription
    );

    if (!visible) {
        return null;
    }

    return (
        <div className={style.cell}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn(
                            "w-full justify-start text-left font-normal",
                            !data && "text-muted-foreground",
                            !isValid && "border-red-500"
                        )}
                        disabled={!enabled}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {data ? format(new Date(data), format) : <span>Pick a date</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={data ? new Date(data) : undefined}
                        onSelect={(newDate) => handleChange(path, newDate?.toISOString())}
                        disabled={!enabled}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>

            {showDescription && (
                <p className="text-sm text-muted-foreground">{description}</p>
            )}

            {!isValid && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );
};

export const shadcnDateControlTester: RankedTester = rankWith(5, isDateControl);

export default withJsonFormsControlProps(ShadcnDateControl);
