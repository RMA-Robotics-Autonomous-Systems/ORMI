"use client";

import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, uiTypeIs, ControlElement } from '@jsonforms/core';

import { Label } from '@/components/ui/label';

import styles from "../../../../src/styles/controls.module.css";
import { DigitalInput, DigitalInputComponent } from '@/components/advanced/triggers/digital-trigger-input';


const DigitalControl = (props: ControlProps) => {
    const { data, handleChange, path, label } = props;

    const handleSelecting = (selectedInput: DigitalInput) => {
        handleChange(path, selectedInput);
    };

    return (
        <div className={styles.cell}>
            <Label> {label}</Label>
            <DigitalInputComponent onChange={handleSelecting} data={data as DigitalInput | null} />
        </div >
    );
}

export default withJsonFormsControlProps(DigitalControl);

// Define a tester that checks for a specific option in uischema
const keySelectorTester = rankWith(
    10, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        uiTypeIs('Key'), // Check if uischema is of type 'Control'
    )
);

export { keySelectorTester };

export interface KeyControlType extends Omit<ControlElement, 'type'> {
    type: 'Key';
}