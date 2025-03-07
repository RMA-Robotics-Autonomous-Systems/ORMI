import { jsx as _jsx } from "react/jsx-runtime";
import { and, isBooleanControl, optionIs, rankWith, } from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import { Switch } from "../../../../../library/components/ui/switch";
export var ShadcnBooleanToggleCell = function (props) {
    var data = props.data, id = props.id, enabled = props.enabled, handleChange = props.handleChange;
    return (_jsx(Switch, { id: id, checked: data !== null && data !== void 0 ? data : false, disabled: !enabled, onCheckedChange: function (checked) { return handleChange(id, checked); } }));
};
export var shadcnBooleanToggleCellTester = rankWith(4, and(isBooleanControl, optionIs('toggle', true)));
export default withJsonFormsCellProps(ShadcnBooleanToggleCell);
