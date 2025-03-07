import { jsx as _jsx } from "react/jsx-runtime";
import { and, isStringControl, optionIs, rankWith, } from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import { Input } from "../../../../../library/components/ui/input";
export var ShadcnColorCell = function (props) {
    var data = props.data, className = props.className, id = props.id, enabled = props.enabled, handleChange = props.handleChange, path = props.path;
    return (_jsx(Input, { type: "color", value: data || '#000000', onChange: function (ev) { return handleChange(path, ev.target.value); }, className: className, id: id, disabled: !enabled }));
};
export var shadcnColorCellTester = rankWith(5, and(isStringControl, optionIs('color', true)));
export default withJsonFormsCellProps(ShadcnColorCell);
