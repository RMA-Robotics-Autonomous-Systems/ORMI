import { jsx as _jsx } from "react/jsx-runtime";
import { isBooleanControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import { Checkbox } from "../../../../../library/components/ui/checkbox";
export var ShadcnBooleanCell = function (props) {
    var data = props.data, id = props.id, enabled = props.enabled, handleChange = props.handleChange;
    return (_jsx(Checkbox, { id: id, checked: data !== null && data !== void 0 ? data : false, disabled: !enabled, onCheckedChange: function (checked) { return handleChange(id, checked); } }));
};
export var shadcnBooleanCellTester = rankWith(3, isBooleanControl);
export default withJsonFormsCellProps(ShadcnBooleanCell);
