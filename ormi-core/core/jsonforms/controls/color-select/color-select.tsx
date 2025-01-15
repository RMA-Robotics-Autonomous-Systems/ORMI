import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, optionIs } from '@jsonforms/core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ColorSelectControl = (props: ControlProps) => {
    const { data, handleChange, path, label, id } = props;

    return (
        <div style={{ marginBottom: "1rem" }} className='flex gap-2 items-center'>
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
    5, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        optionIs('color', true) // Check if 'async' option is true
    )
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