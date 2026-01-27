"use client";

import { withJsonFormsControlProps } from "@jsonforms/react";
import { ControlProps, rankWith, optionIs } from "@jsonforms/core";

import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

const ColorSelectControl = (props: ControlProps) => {
  const { data, handleChange, path, label, id } = props;

  return (
    <div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="color"
        value={data || "#000000"}
        onChange={(event) => handleChange(path, event.target.value)}
      />
    </div>
  );
};

export default withJsonFormsControlProps(ColorSelectControl);

// Define a tester that checks for a specific option in uischema
const colorSelectTester = rankWith(
  200,
  optionIs("color", true), // Check if 'async' option is true
);

export { colorSelectTester };

/*

        <select value={data} onChange={event => handleChange(path, event.target.value)}>
            <option value="">Select an option</option>
            {options.map((option: { value: string; label: string }) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>

*/
