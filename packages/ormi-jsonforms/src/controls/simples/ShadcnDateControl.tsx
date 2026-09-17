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

import {
	ControlProps,
	isDateControl,
	isDescriptionHidden,
	RankedTester,
	rankWith,
} from "@jsonforms/core";
import { withJsonFormsControlProps } from "@jsonforms/react";
import merge from "lodash/merge";
import React from "react";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Button } from "@workspace/ui/components/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Calendar } from "@workspace/ui/components/calendar";
import { Label } from "@workspace/ui/components/label";
import { format } from "date-fns";
import { controlAriaProps, descriptionId, errorId } from "../../utils/aria";

export const ShadcnDateControl = ({
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
	const dateFormat = appliedUiSchemaOptions.dateFormat ?? "yyyy-MM-dd";

	// `true` for the focus argument: help text is always shown, never gated on
	// the field being focused.
	const showDescription = !isDescriptionHidden(
		visible,
		description,
		true,
		appliedUiSchemaOptions.showUnfocusedDescription,
	);

	const ariaProps = controlAriaProps({
		id,
		isValid,
		required,
		showDescription,
	});

	// Guarded so a garbage stored value renders the placeholder instead of
	// throwing out of the whole form.
	const parsed = data ? new Date(data) : undefined;
	const formatted =
		parsed && !Number.isNaN(parsed.getTime())
			? format(parsed, dateFormat)
			: undefined;

	if (!visible) {
		return null;
	}

	return (
		<div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
			<Label
				htmlFor={id}
				className={cn(
					"text-sm font-medium leading-none",
					required && "after:text-destructive after:content-['*']",
				)}
			>
				{label}
			</Label>

			<Popover>
				<PopoverTrigger asChild>
					<Button
						id={id}
						variant={"outline"}
						className={cn(
							"w-full justify-start text-left font-normal",
							!data && "text-muted-foreground",
							!isValid && "border-destructive",
						)}
						disabled={!enabled}
						{...ariaProps}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{formatted ?? <span>Pick a date</span>}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={formatted ? parsed : undefined}
						onSelect={(newDate) =>
							handleChange(path, newDate?.toISOString())
						}
						disabled={!enabled}
						autoFocus
					/>
				</PopoverContent>
			</Popover>

			{showDescription && (
				<p
					id={descriptionId(id)}
					className="col-start-2 text-sm text-muted-foreground"
				>
					{description}
				</p>
			)}

			{!isValid && (
				<p
					id={errorId(id)}
					className="col-start-2 text-sm text-destructive"
				>
					{errors}
				</p>
			)}
		</div>
	);
};

export const shadcnDateControlTester: RankedTester = rankWith(5, isDateControl);

export default withJsonFormsControlProps(ShadcnDateControl);
