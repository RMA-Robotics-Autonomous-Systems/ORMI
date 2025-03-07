import { jsx as _jsx } from "react/jsx-runtime";
import { useButtonHolder } from "./button-holder-provider";
export default function ButtonHolder() {
    var items = useButtonHolder().items;
    return (_jsx("div", { className: "flex flex-row space-x-2", children: Array.from(items.values()).sort(function (a, b) { return a.priority - b.priority; }).map(function (item, index) { return (_jsx("div", { children: item.component }, index)); }) }));
}
