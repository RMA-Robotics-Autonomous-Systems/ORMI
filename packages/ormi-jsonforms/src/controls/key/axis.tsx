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
	AnalogInput,
	AnalogInputComponent,
} from "@workspace/ui/combined/triggers";

const AnalogControl = (props: ControlProps) => {
	const { data, handleChange, path, label } = props;

	const handleSelecting = (selectedInput: AnalogInput) => {
		handleChange(path, selectedInput);
	};

	return (
		<div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
			<Label> {label}</Label>
			<AnalogInputComponent
				onChange={handleSelecting}
				data={data as AnalogInput | null}
			/>
		</div>
	);
};

export default withJsonFormsControlProps(AnalogControl);

// Define a tester that checks for a specific option in uischema
const axisSelectorTester = rankWith(
	10, // Increase rank to ensure this tester is selected when applicable
	and(
		isControl,
		uiTypeIs("Axis"), // Check if uischema is of type 'Control'
	),
);

export { axisSelectorTester };

/**
 * Control element type for axis selector controls.
 */
export interface axisControlType extends Omit<ControlElement, "type"> {
	type: "Axis";
}
