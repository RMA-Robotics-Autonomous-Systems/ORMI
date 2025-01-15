import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, isBooleanControl } from '@jsonforms/core';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const SwitchControl = (props: ControlProps) => {
    const { data, handleChange, path, label, id } = props;

    return (
        <div style={{ marginBottom: "1rem" }} className='flex gap-2 items-center'>
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