"use client";

import { withJsonFormsControlProps } from "@jsonforms/react";
import {
  ControlProps,
  rankWith,
  isControl,
  and,
  uiTypeIs,
  ControlElement,
} from "@jsonforms/core";

import { Label } from "@workspace/ui/components/label";
import {
  DigitalInput,
  DigitalInputComponent,
} from "@workspace/ui/combined/triggers";

const DigitalControl = (props: ControlProps) => {
  const { data, handleChange, path, label } = props;

  const handleSelecting = (selectedInput: DigitalInput) => {
    handleChange(path, selectedInput);
  };

  return (
    <div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
      <Label> {label}</Label>
      <DigitalInputComponent
        onChange={handleSelecting}
        data={data as DigitalInput | null}
      />
    </div>
  );
};

export default withJsonFormsControlProps(DigitalControl);

// Define a tester that checks for a specific option in uischema
const keySelectorTester = rankWith(
  10, // Increase rank to ensure this tester is selected when applicable
  and(
    isControl,
    uiTypeIs("Key"), // Check if uischema is of type 'Control'
  ),
);

export { keySelectorTester };

export interface KeyControlType extends Omit<ControlElement, "type"> {
  type: "Key";
}
