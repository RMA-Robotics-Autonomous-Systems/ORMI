import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, isBooleanControl } from '@jsonforms/core';
import { Switch } from '@/library/components/ui/switch';
import { Label } from '@/library/components/ui/label';

import styles from "./../../styles/controls.module.css";
import React from 'react';


const SwitchControl = (props: ControlProps) => {
    const { data, handleChange, path, label, id } = props;

    return (
        <div className={styles.cell}>
            <Label htmlFor={id}>{label}</Label>
            <Switch
                id={id}
                onCheckedChange={(value) => handleChange(path, value)}
                checked={data}
            />
        </div>
    );
};

export default withJsonFormsControlProps(SwitchControl);

// Define a tester that checks for a specific option in uischema; the type of the field is 'boolean'
const switchTester = rankWith(
    100, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        isBooleanControl
    )
);

export { switchTester };

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