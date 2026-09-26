/*
  The MIT License

  Copyright (c) 2018-2019 EclipseSource Munich
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
import {
	and,
	ControlProps,
	isStringControl,
	optionIs,
	RankedTester,
	rankWith,
} from "@jsonforms/core";
import { withJsonFormsControlProps } from "@jsonforms/react";
import { RotateCcwIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { ShadcnInputControl } from "./ShadcnInputControl";
import type { WithAria } from "../../utils/aria";

/**
 * Where the native picker opens when the field holds no colour. Never written
 * unless the operator picks it.
 */
const PICKER_SEED = "#808080";

/**
 * Whether a stored colour is empty, meaning "automatic".
 *
 * @param value - Stored value.
 * @returns True for undefined, null or a blank string.
 */
export function isAutomaticColor(value: unknown): boolean {
	return typeof value !== "string" || value.trim().length === 0;
}

/**
 * A colour field that can be empty.
 *
 * An empty colour is a real setting, not a missing one: a chart series with
 * no colour takes one derived from its topic at runtime, and a schema default
 * would defeat that. A native `<input type="color">` cannot represent empty
 * and paints black, so the swatch is drawn here instead (dashed and labelled
 * "Automatic" when empty) with the native input laid invisibly over it to
 * open the picker. The stored value stays empty until the operator picks a
 * colour, and an optional field without a default can be reset to automatic.
 *
 * @param props - Control props with ARIA attributes.
 * @returns The swatch, its value and the reset action.
 */
const ShadcnInputColor = (props: ControlProps & WithAria) => {
	const {
		id,
		enabled,
		path,
		handleChange,
		data,
		required,
		schema,
		ariaProps,
	} = props;
	const automatic = isAutomaticColor(data);
	// Automatic is only a setting where the schema leaves the field empty: a
	// field with a default or a required one has no automatic to go back to.
	const resettable =
		!automatic && enabled && !required && schema.default === undefined;

	return (
		<div className="flex min-h-9 items-center gap-2">
			<div className="relative size-9 shrink-0">
				<input
					type="color"
					value={automatic ? PICKER_SEED : (data as string)}
					onChange={(ev) => handleChange(path, ev.target.value)}
					disabled={!enabled}
					id={id}
					className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
					{...ariaProps}
				/>
				<span
					aria-hidden
					className={cn(
						"border-field-border pointer-events-none absolute inset-0 rounded-md border peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:opacity-50",
						automatic && "border-dashed",
					)}
					style={
						automatic
							? undefined
							: { backgroundColor: data as string }
					}
				/>
			</div>
			<span
				className={cn(
					"text-sm",
					automatic ? "text-muted-foreground" : "font-mono",
				)}
			>
				{automatic ? "Automatic" : (data as string)}
			</span>
			{resettable && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="text-muted-foreground"
					onClick={() => handleChange(path, undefined)}
				>
					<RotateCcwIcon />
					Automatic
				</Button>
			)}
		</div>
	);
};

export const ShadcnColorControl = (props: ControlProps) => (
	<ShadcnInputControl {...props} input={ShadcnInputColor} />
);

export const shadcnColorControlTester: RankedTester = rankWith(
	50,
	and(isStringControl, optionIs("color", true)),
);

export default withJsonFormsControlProps(ShadcnColorControl);
