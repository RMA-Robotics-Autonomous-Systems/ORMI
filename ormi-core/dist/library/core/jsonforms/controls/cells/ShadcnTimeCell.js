import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isTimeControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "../../../../../library/components/ui/select";
import { format } from "date-fns";
export var ShadcnTimeCell = function (props) {
    var data = props.data, id = props.id, enabled = props.enabled, handleChange = props.handleChange, path = props.path;
    // Generate time options every 30 minutes
    var timeOptions = Array.from({ length: 48 }, function (_, i) {
        var minutes = i * 30;
        var time = new Date();
        time.setHours(Math.floor(minutes / 60), minutes % 60, 0);
        return {
            value: format(time, 'HH:mm'),
            label: format(time, 'hh:mm a')
        };
    });
    return (_jsxs(Select, { value: data || '', onValueChange: function (value) { return handleChange(path, value); }, disabled: !enabled, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, { placeholder: "Select time" }) }), _jsx(SelectContent, { children: timeOptions.map(function (option) { return (_jsx(SelectItem, { value: option.value, children: option.label }, option.value)); }) })] }));
};
export var shadcnTimeCellTester = rankWith(2, isTimeControl);
export default withJsonFormsCellProps(ShadcnTimeCell);
