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
import { cn } from "@workspace/ui/lib/utils";
import { controlAriaProps, errorId } from "../../utils/aria";
import {
	AnalogInput,
	AnalogInputComponent,
} from "@workspace/ui/combined/triggers";

const AnalogControl = (props: ControlProps) => {
	const { data, handleChange, path, label, id, errors, required } = props;

	const handleSelecting = (selectedInput: AnalogInput) => {
		handleChange(path, selectedInput);
	};

	const isValid = errors.length === 0;
	// The picker is a composite widget rather than a single form control, so
	// the ARIA state lives on the group wrapper.
	const ariaProps = controlAriaProps({ id, isValid, required });

	return (
		<div className="grid grid-cols-[10dvw_1fr] gap-4 items-center">
			<Label
				htmlFor={id}
				className={cn(
					required && "after:text-destructive after:content-['*']",
				)}
			>
				{" "}
				{label}
			</Label>
			<div id={id} role="group" {...ariaProps}>
				<AnalogInputComponent
					onChange={handleSelecting}
					data={data as AnalogInput | null}
				/>
			</div>

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
