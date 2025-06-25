import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, optionIs } from '@jsonforms/core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import styles from "../../../../src/styles/key.module.css";
import React from 'react';


const ColorSelectControl = (props: ControlProps) => {
    const { data, handleChange, path, label, id } = props;

    return (
        <div className={styles.cell}>
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type="color"
                value={data || '#000000'}
                onChange={event => handleChange(path, event.target.value)}
            />
        </div>
    );
};

export default withJsonFormsControlProps(ColorSelectControl);

// Define a tester that checks for a specific option in uischema
const colorSelectTester = rankWith(
    200,
    optionIs('color', true) // Check if 'async' option is true
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