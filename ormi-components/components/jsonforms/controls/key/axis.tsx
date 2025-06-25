import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, uiTypeIs, ControlElement } from '@jsonforms/core';

import React from 'react';

import { Label } from '@/components/ui/label';

import styles from "@/src/styles/controls.module.css";
import { AnalogInputComponent, AnalogInput } from '@/components/advanced/triggers/analog-trigger-input';


const AnalogControl = (props: ControlProps) => {
    const { data, handleChange, path, label } = props;

    const handleSelecting = (selectedInput: AnalogInput) => {
        handleChange(path, selectedInput);
    };

    return (
        <div className={styles.cell}>
            <Label> {label}</Label>
            <AnalogInputComponent onChange={handleSelecting} data={data as AnalogInput | null} />
        </div >
    );
}

export default withJsonFormsControlProps(AnalogControl);

// Define a tester that checks for a specific option in uischema
const axisSelectorTester = rankWith(
    10, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        uiTypeIs('Axis'), // Check if uischema is of type 'Control'
    )
);

export { axisSelectorTester };

export interface axisControlType extends Omit<ControlElement, 'type'> {
    type: 'Axis';
}