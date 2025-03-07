import { jsx as _jsx } from "react/jsx-runtime";
import { isStringControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import { Input } from "../../../../../library/components/ui/input";
export var ShadcnTextCell = function (props) {
    var data = props.data, className = props.className, id = props.id, enabled = props.enabled, handleChange = props.handleChange, path = props.path;
    return (_jsx(Input, { type: "text", value: data || '', onChange: function (ev) { return handleChange(path, ev.target.value); }, className: className, id: id, disabled: !enabled }));
};
export var shadcnTextCellTester = rankWith(2, isStringControl);
export default withJsonFormsCellProps(ShadcnTextCell);
