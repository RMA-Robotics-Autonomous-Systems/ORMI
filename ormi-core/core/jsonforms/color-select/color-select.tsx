import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, optionIs } from '@jsonforms/core';
import { Input } from '@/components/ui/input';

const ColorSelectControl = (props: ControlProps) => {
    const { data, handleChange, path } = props;

    return (
        <div style={{ marginBottom: "1rem" }}>
            <Input
                type="color"
                value={data || ''}
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