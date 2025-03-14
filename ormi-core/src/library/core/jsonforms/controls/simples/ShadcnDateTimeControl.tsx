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
import React, { useState } from 'react';
import merge from 'lodash/merge';
import {
    ControlProps,
    isDateTimeControl,
    isDescriptionHidden,
    RankedTester,
    rankWith,
} from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { Calendar } from "@/library/components/ui/calendar"
import { Button } from "@/library/components/ui/button"
import { Input } from "@/library/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/library/components/ui/popover"
import { cn } from "@/library/lib/utils"
import { CalendarIcon } from "@radix-ui/react-icons"
import { format } from "date-fns"

const ShadcnDateTimeControl = ({
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
    const [date, setDate] = useState<Date | undefined>(
        data ? new Date(data) : undefined
    );

    const isValid = errors.length === 0;
    const appliedUiSchemaOptions = merge({}, config, uischema.options);

    const showDescription = !isDescriptionHidden(
        visible,
        description,
        false,
        appliedUiSchemaOptions.showUnfocusedDescription
    );

    const handleDateChange = (newDate: Date | undefined) => {
        if (!newDate) return;

        if (date) {
            // Preserve time from existing date
            newDate.setHours(date.getHours());
            newDate.setMinutes(date.getMinutes());
        }

        setDate(newDate);
        handleChange(path, newDate.toISOString());
    };

    const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!date) return;

        const [hours, minutes] = event.target.value.split(':');
        const newDate = new Date(date);
        newDate.setHours(parseInt(hours), parseInt(minutes));

        setDate(newDate);
        handleChange(path, newDate.toISOString());
    };

    if (!visible) {
        return null;
    }

    return (
        <div className="space-y-2">
            <div className="flex space-x-2">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn(
                                "w-[260px] justify-start text-left font-normal",
                                !date && "text-muted-foreground",
                                !isValid && "border-red-500"
                            )}
                            disabled={!enabled}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={handleDateChange}
                            disabled={!enabled}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>

                <Input
                    type="time"
                    className={cn("w-[140px]", !isValid && "border-red-500")}
                    value={date ? format(date, "HH:mm") : ""}
                    onChange={handleTimeChange}
                    disabled={!enabled || !date}
                />
            </div>

            {showDescription && (
                <p className="text-sm text-muted-foreground">{description}</p>
            )}

            {!isValid && (
                <p className="text-sm text-destructive">{errors}</p>
            )}
        </div>
    );
};

export const shadcnDateTimeControlTester: RankedTester = rankWith(5, isDateTimeControl);

export default withJsonFormsControlProps(ShadcnDateTimeControl);
