import { jsx as _jsx } from "react/jsx-runtime";
import { isNumberControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import { Input } from "../../../../../library/components/ui/input";
export var ShadcnNumberCell = function (props) {
    var data = props.data, id = props.id, enabled = props.enabled, handleChange = props.handleChange, path = props.path;
    var handleInputChange = function (e) {
        var value = e.target.value;
        var number = value === '' ? undefined : Number(value);
        handleChange(path, number);
    };
    return (_jsx(Input, { type: "number", id: id, value: data !== null && data !== void 0 ? data : '', onChange: handleInputChange, disabled: !enabled, className: "w-full", step: "any" }));
};
export var shadcnNumberCellTester = rankWith(3, isNumberControl);
export default withJsonFormsCellProps(ShadcnNumberCell);
