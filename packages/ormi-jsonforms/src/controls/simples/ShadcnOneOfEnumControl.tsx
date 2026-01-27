/*
  The MIT License

  Copyright (c) 2018-2020 EclipseSource Munich
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

import { Check, ChevronsUpDown } from "lucide-react";
import {
  ControlProps,
  isOneOfEnumControl,
  OwnPropsOfEnum,
  RankedTester,
  rankWith,
} from "@jsonforms/core";
import {
  TranslateProps,
  withJsonFormsOneOfEnumProps,
  withTranslateProps,
} from "@jsonforms/react";
import { ShadcnInputControl } from "./ShadcnInputControl";
import merge from "lodash/merge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import {
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Command,
} from "@workspace/ui/components/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";

const ShadcnSelect = ({
  data,
  options,
  path,
  handleChange,
  errors,
  label,
  enabled,
}: ControlProps & OwnPropsOfEnum) => (
  <Select
    value={data || ""}
    onValueChange={(value) => handleChange(path, value)}
    disabled={!enabled}
  >
    <SelectTrigger
      className={cn("w-full", errors.length > 0 && "border-red-500")}
    >
      <SelectValue placeholder={label} />
    </SelectTrigger>
    <SelectContent>
      {options!.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const ShadcnCombobox = ({
  data,
  options,
  path,
  handleChange,
  errors,
  label,
  enabled,
}: ControlProps & OwnPropsOfEnum) => {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            errors.length > 0 && "border-red-500",
          )}
          disabled={!enabled}
        >
          {data
            ? (options || []).find((option) => option.value === data)?.label
            : label}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder={`Search ${label}...`} />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {(options || [])!.map((option) => (
                <CommandItem
                  key={option.value}
                  onSelect={() => {
                    handleChange(path, option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      data === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const ShadcnOneOfEnumControl = (
  props: ControlProps & OwnPropsOfEnum & TranslateProps,
) => {
  const { config, uischema } = props;
  const appliedUiSchemaOptions = merge({}, config, uischema.options);

  return appliedUiSchemaOptions.autocomplete === false ? (
    <ShadcnInputControl {...props} input={ShadcnSelect} />
  ) : (
    <ShadcnCombobox {...props} />
  );
};

export const shadcnOneOfEnumControlTester: RankedTester = rankWith(
  6,
  isOneOfEnumControl,
);

export default withJsonFormsOneOfEnumProps(
  withTranslateProps(React.memo(ShadcnOneOfEnumControl)),
  false,
);
