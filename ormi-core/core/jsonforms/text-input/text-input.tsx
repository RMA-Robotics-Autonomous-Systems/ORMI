import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, isStringControl } from '@jsonforms/core';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const TextControl = (props: ControlProps) => {
    const { data, handleChange, path, label, id } = props;

    return (
        <div style={{ marginBottom: "1rem" }} className='flex gap-2 items-center'>
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type="text"
                value={data || ''}
                onChange={event => handleChange(path, event.target.value)}
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
        isStringControl
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