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
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
"use client";

import React from "react";
import { ControlProps, isDescriptionHidden } from "@jsonforms/core";
import merge from "lodash/merge";

import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

export interface WithInput {
	input: any;
}

export const ShadcnInputControl = (props: ControlProps & WithInput) => {
	const {
		id,
		description,
		errors,
		label,
		uischema,
		visible,
		required,
		config,
		input: InnerComponent,
	} = props;

	const isValid = errors.length === 0;
	const appliedUiSchemaOptions = merge({}, config, uischema.options);

	const showDescription = !isDescriptionHidden(
		visible,
		description,
		true,
		appliedUiSchemaOptions.showUnfocusedDescription,
	);

	if (!visible) {
		return null;
	}

	return (
		<div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
			<Label
				htmlFor={id}
				className={cn(
					"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
					required && "after:text-red-500 after:content-['*']",
				)}
			>
				{label}
			</Label>

			<InnerComponent
				className={cn("w-full", !isValid && "border-red-500")}
				{...props}
			/>

			{showDescription && (
				<p className="text-sm text-muted-foreground">{description}</p>
			)}

			{!isValid && <p className="text-sm text-destructive">{errors}</p>}
		</div>
	);
};

export default ShadcnInputControl;
