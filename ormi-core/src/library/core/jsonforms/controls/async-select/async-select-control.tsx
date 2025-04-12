import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, optionIs, uiTypeIs } from '@jsonforms/core';

import React, { useEffect, useState } from 'react';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/library/components/ui/select"
import { Label } from '@/library/components/ui/label';

import styles from "./../../styles/controls.module.css";


const AsyncSelectControl = (props: ControlProps) => {
    const { data, handleChange, path, uischema, label } = props;
    const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {

        const asyncFunction = uischema.options?.asyncFunction;

        if (asyncFunction) {
            asyncFunction().then((result: unknown) => {
                setOptions(result as { value: string; label: string }[]);
            });
        }

    }, [uischema]);

    return (
        <div className={styles.cell}>
            <Label>{label}</Label>
            <Select value={data} onValueChange={value => handleChange(path, value)}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option: { value: string; label: string }) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};

export default withJsonFormsControlProps(AsyncSelectControl);

// Define a tester that checks for a specific option in uischema
const asyncSelectTester = rankWith(
    5, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        optionIs('async', true) // Check if 'async' option is true
    )
);

export { asyncSelectTester };

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