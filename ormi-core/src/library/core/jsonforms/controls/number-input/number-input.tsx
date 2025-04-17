import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, isNumberControl } from '@jsonforms/core';
import { Label } from '@/library/components/ui/label';
import { Input } from '@/library/components/ui/input';
import { useEffect } from 'react';
import styles from "./../../styles/controls.module.css";
import React from 'react';



const NumberControl = (props: ControlProps) => {
    const { data, handleChange, path, label, id, schema } = props;

    const parseValue = (value: string): number => {
        if (value === '') return 0;
        return Number(value);
    }

    useEffect(() => {
        if (data === undefined) {
            handleChange(path, schema.default || 0);
        }
    }, []);

    return (
        <div className={styles.cell}>
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type="number"
                value={data !== undefined && data !== null ? data : ''}
                onChange={event => handleChange(path, parseValue(event.target.value))}
            />
        </div>
    );
};

export default withJsonFormsControlProps(NumberControl);

// Define a tester that checks for a specific option in uischema; the type of the field is 'boolean'
const NumberTester = rankWith(
    5, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        isNumberControl
    )
);

export { NumberTester };

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