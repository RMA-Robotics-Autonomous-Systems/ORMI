var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "../../../../../library/components/ui/button";
import { Input } from "../../../../../library/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../../library/components/ui/select";
import { usePluginsManager } from "../../../../../library/core/plugins/components/plugins-provider";
import { PluginsHooks } from "../../../../../library/core/plugins/plugins-types";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
export default function TopicCreator(props) {
    var _this = this;
    var pluginsManager = usePluginsManager();
    var _a = useState([]), datasources = _a[0], setDatasources = _a[1];
    var _b = useState(''), selectedDatasource = _b[0], setSelectedDatasource = _b[1];
    var _c = useState(''), selectedTopic = _c[0], setSelectedTopic = _c[1];
    var _d = useState(''), selectedType = _d[0], setSelectedType = _d[1];
    var _e = useState([]), availableTypes = _e[0], setAvailableTypes = _e[1];
    useEffect(function () {
        setDatasources(pluginsManager.applyFilter(PluginsHooks.AVAILABLE_DATASOURCES, []));
    }, []);
    var setTypes = function (datasource_id) { return __awaiter(_this, void 0, void 0, function () {
        var types;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync("".concat(datasource_id, "-available-types"), [])];
                case 1:
                    types = _a.sent();
                    setAvailableTypes(types);
                    return [2 /*return*/];
            }
        });
    }); };
    var handleDatasourceChange = function (datasource_id) {
        setSelectedDatasource(datasource_id);
        setTypes(datasource_id);
    };
    var handleTopicChange = function (topic) {
        setSelectedTopic(topic);
    };
    var handleTypeChange = function (type) {
        setSelectedType(type);
    };
    var handleValidate = function () {
        var datasource = datasources.find(function (ds) { return ds.settings.id === selectedDatasource; });
        if (!datasource) {
            return;
        }
        props.handleTopic(datasource, selectedTopic, selectedType);
    };
    return (_jsxs("div", { className: 'p-2 items-center gap-2 justify-between w-full', style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto" }, children: [_jsxs(Select, { onValueChange: handleDatasourceChange, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, { placeholder: "Datasource" }) }), _jsx(SelectContent, { children: datasources.map(function (datasource) { return (_jsx(SelectItem, { value: datasource.settings.id, children: datasource.title }, datasource.settings.id)); }) })] }), _jsx(Input, { placeholder: "Topic name", defaultValue: props.value, onChange: function (e) { return handleTopicChange(e.target.value); } }), _jsxs(Select, { onValueChange: handleTypeChange, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, { placeholder: "Type" }) }), _jsx(SelectContent, { children: availableTypes.map(function (type) { return (_jsx(SelectItem, { value: type, children: type }, type)); }) })] }), _jsx(Button, { onClick: handleValidate, children: _jsx(CheckIcon, {}) })] }));
}
