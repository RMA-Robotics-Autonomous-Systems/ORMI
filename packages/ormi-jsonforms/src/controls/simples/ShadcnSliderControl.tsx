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
  isDescriptionHidden,
  isRangeControl,
  RankedTester,
  rankWith,
} from "@jsonforms/core";
import { withJsonFormsControlProps } from "@jsonforms/react";
import merge from "lodash/merge";
import { useFocus } from "../../utils";
import { Label } from "@workspace/ui/components/label";
import { Slider } from "@workspace/ui/components/slider";
import { cn } from "@workspace/ui/lib/utils";

export const ShadcnSliderControl = (props: ControlProps) => {
  const [focused] = useFocus();
  const {
    id,
    data,
    description,
    enabled,
    errors,
    label,
    schema,
    handleChange,
    visible,
    path,
    required,
    config,
  } = props;

  const isValid = errors.length === 0;
  const appliedUiSchemaOptions = merge({}, config, props.uischema.options);
  const showDescription = !isDescriptionHidden(
    visible,
    description,
    focused,
    appliedUiSchemaOptions.showUnfocusedDescription,
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
          required && "after:text-red-500 after:content-['*']",
        )}
      >
        {label}
      </Label>

      <div className="flex items-center space-x-4">
        <span className="text-sm">{schema.minimum || 0}</span>
        <Slider
          id={id}
          defaultValue={[data || schema.minimum || 0]}
          min={schema.minimum || 0}
          max={schema.maximum || 100}
          step={schema.multipleOf || 1}
          disabled={!enabled}
          onValueChange={([value]) => handleChange(path, value)}
          className={cn("flex-1", !isValid && "border-red-500")}
        />
        <span className="text-sm">{schema.maximum || 100}</span>
      </div>

      {showDescription && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      {!isValid && <p className="text-sm text-destructive">{errors}</p>}
    </div>
  );
};

export const shadcnSliderControlTester: RankedTester = rankWith(
  5,
  isRangeControl,
);

export default withJsonFormsControlProps(ShadcnSliderControl);
