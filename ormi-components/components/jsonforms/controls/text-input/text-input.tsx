import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, isStringControl, isEnumControl } from '@jsonforms/core';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import styles from "@/src/styles/key.module.css";
import React from 'react';

const TextControl = (props: ControlProps) => {
    const { data, handleChange, path, label, id, schema } = props;

    return (
        <div className={styles.cell}>
            {(!schema.const) && <Label htmlFor={id}>{label}</Label>}
            <Input
                id={id}
                type="text"
                value={data || schema.default || schema.const || ''}
                onChange={event => handleChange(path, event.target.value)}
                hidden={schema.const !== undefined}

            />
        </div>
    );
};

export default withJsonFormsControlProps(TextControl);

// Define a tester that checks for a specific option in uischema; the type of the field is 'boolean'
const TextTester = rankWith(
    5, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        isStringControl,
    )
);

export { TextTester };

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