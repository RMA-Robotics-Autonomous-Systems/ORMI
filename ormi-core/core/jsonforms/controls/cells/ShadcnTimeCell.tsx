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
import React from 'react';
import {
    CellProps,
    isTimeControl,
    RankedTester,
    rankWith,
    WithClassname,
} from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

export const ShadcnTimeCell = (props: CellProps & WithClassname) => {
    const { data, id, enabled, handleChange, path } = props;

    // Generate time options every 30 minutes
    const timeOptions = Array.from({ length: 48 }, (_, i) => {
        const minutes = i * 30;
        const time = new Date();
        time.setHours(Math.floor(minutes / 60), minutes % 60, 0);
        return {
            value: format(time, 'HH:mm'),
            label: format(time, 'hh:mm a')
        };
    });

    return (
        <Select
            value={data || ''}
            onValueChange={(value) => handleChange(path, value)}
            disabled={!enabled}
        >
            <SelectTrigger className="w-full">
                <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent>
                {timeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

export const shadcnTimeCellTester: RankedTester = rankWith(2, isTimeControl);

export default withJsonFormsCellProps(ShadcnTimeCell);
