import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isDateControl, rankWith, } from '@jsonforms/core';
import { withJsonFormsCellProps } from '@jsonforms/react';
import { Calendar } from "../../../../../library/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../../library/components/ui/popover";
import { Button } from "../../../../../library/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "../../../../../library/lib/utils";
import { format } from "date-fns";
export var ShadcnDateCell = function (props) {
    var data = props.data, enabled = props.enabled, handleChange = props.handleChange, path = props.path;
    var date = data ? new Date(data) : undefined;
    return (_jsxs(Popover, { children: [_jsx(PopoverTrigger, { asChild: true, children: _jsxs(Button, { variant: "outline", className: cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground"), disabled: !enabled, children: [_jsx(CalendarIcon, { className: "mr-2 h-4 w-4" }), date ? format(date, "PPP") : _jsx("span", { children: "Pick a date" })] }) }), _jsx(PopoverContent, { className: "w-auto p-0", align: "start", children: _jsx(Calendar, { mode: "single", selected: date, onSelect: function (date) { return handleChange(path, date === null || date === void 0 ? void 0 : date.toISOString()); }, disabled: !enabled, initialFocus: true }) })] }));
};
export var shadcnDateCellTester = rankWith(3, isDateControl);
export default withJsonFormsCellProps(ShadcnDateCell);
