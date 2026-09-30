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
	isBooleanControl,
	RankedTester,
	rankWith,
	ControlProps,
	isDescriptionHidden,
} from "@jsonforms/core";
import { withJsonFormsControlProps } from "@jsonforms/react";
import merge from "lodash/merge";
import React from "react";

import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import { controlAriaProps, descriptionId, errorId } from "../../utils/aria";
import { useFieldErrorText } from "../../utils/field-errors";

export const ShadcnBooleanControl = ({
	data,
	visible,
	label,
	id,
	enabled,
	uischema,
	handleChange,
	errors,
	path,
	schema,
	config,
	description,
	required,
}: ControlProps) => {
	const isValid = errors.length === 0;
	const errorText = useFieldErrorText({ path, schema, errors });
	const appliedUiSchemaOptions = merge({}, config, uischema.options);

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

	if (!visible) {
		return null;
	}

	return (
		// Label in the label column, switch in the control column: the same
		// geometry as every other row of the form.
		<div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
			<label
				htmlFor={id}
				className={cn(
					"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
					required && "after:text-destructive after:content-['*']",
					!isValid && "text-destructive",
				)}
			>
				{label}
			</label>
			<div className="flex items-center">
				<Switch
					id={id}
					checked={data || false}
					disabled={!enabled}
					onCheckedChange={(checked) => handleChange(path, checked)}
					{...ariaProps}
				/>
			</div>
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
					{errorText}
				</p>
			)}
		</div>
	);
};

export const shadcnBooleanControlTester: RankedTester = rankWith(
	4,
	isBooleanControl,
);

export default withJsonFormsControlProps(ShadcnBooleanControl);
