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
"use client";

import React from "react";
import merge from "lodash/merge";
import {
	ControlProps,
	isDateTimeControl,
	isDescriptionHidden,
	RankedTester,
	rankWith,
} from "@jsonforms/core";
import { withJsonFormsControlProps } from "@jsonforms/react";
import { format } from "date-fns";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Date + time control.
 *
 * Uses a single native `datetime-local` input so the operator picks the date
 * AND the time in one widget (the previous calendar-popover + separate, until-a-
 * date-is-picked-disabled time field was easy to get stuck on and overflowed
 * narrow widgets). The input works in local "yyyy-MM-ddTHH:mm"; the stored value
 * is a full ISO-8601 string (UTC via `toISOString()`) so it round-trips and
 * passes ISO-8601 validators.
 */
const ShadcnDateTimeControl = ({
	id,
	label,
	required,
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

	const showDescription = !isDescriptionHidden(
		visible,
		description,
		true,
		appliedUiSchemaOptions.showUnfocusedDescription,
	);

	// Local input value "yyyy-MM-ddTHH:mm" from the stored ISO string (guarded
	// against an invalid/garbage date so a bad value renders empty, not a throw).
	let localValue = "";
	if (data) {
		const parsed = new Date(data);
		if (!Number.isNaN(parsed.getTime())) {
			localValue = format(parsed, "yyyy-MM-dd'T'HH:mm");
		}
	}

	const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		handleChange(path, value ? new Date(value).toISOString() : undefined);
	};

	if (!visible) {
		return null;
	}

	return (
		<div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
			<Label
				htmlFor={id}
				className={cn(
					"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
					required && "after:text-destructive after:content-['*']",
				)}
			>
				{label}
			</Label>

			<Input
				id={id}
				type="datetime-local"
				className={cn("w-full", !isValid && "border-destructive")}
				value={localValue}
				onChange={onChange}
				disabled={!enabled}
			/>

			{showDescription && (
				<p className="text-sm text-muted-foreground">{description}</p>
			)}

			{!isValid && <p className="text-sm text-destructive">{errors}</p>}
		</div>
	);
};

export const shadcnDateTimeControlTester: RankedTester = rankWith(
	5,
	isDateTimeControl,
);

export default withJsonFormsControlProps(ShadcnDateTimeControl);
