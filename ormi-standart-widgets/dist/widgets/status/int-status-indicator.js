var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
import { jsx as _jsx } from "react/jsx-runtime";
import { LocalDataSourcesProvider, useLocalDataSource, DatasourceTopicFilter } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { CircleAlertIcon } from "lucide-react";
import { TypeAnimation } from 'react-type-animation';
function IntStatusIndicator(props) {
    var sources = useLocalDataSource().sources;
    var sources_keys = Array.from(sources.keys());
    var value = sources_keys.length > 0 ? sources.get(sources_keys[0]).data[0] : 0;
    // Convert boolean to number if needed, or keep integer value
    var parsedValue = typeof value === 'boolean' ? (value ? 1 : 0) : typeof value === 'number' ? value : parseInt(value);
    // display the status based on the value and the props.status index
    // if the value is 0, the status is the first element of the array
    // if the value is 1, the status is the second element of the array
    // if the value is greater than the length of the array, the status is undifined
    var statu = props.status[parsedValue] || { name: 'Undefined', color: 'gray' };
    return (_jsx("div", { style: {
            backgroundColor: statu.color,
            color: 'white',
            height: "100%",
            width: "100%",
            display: "grid",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "xxx-large",
            transition: "all 0.5s ease"
        }, children: _jsx(TypeAnimation, { speed: 75, cursor: false, sequence: [statu.name], repeat: 1 }, statu.name) }));
}
export function IntStatusIndicatorDefinition() {
    var _this = this;
    var pluginsManager = usePluginsManager();
    return {
        id: 'int-status-indicator',
        name: 'Status indicator',
        description: 'Display a status based on an Integer value',
        titleProp: 'title',
        icon: _jsx(CircleAlertIcon, {}),
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    "type": "object",
                    "title": "Topic",
                },
                status: {
                    "type": "array",
                    "title": "Status",
                    "items": {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                title: 'Name'
                            },
                            color: {
                                type: 'string',
                                title: 'Color'
                            },
                        }
                    }
                }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                },
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /number|boolean/ }))];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); },
                        buffer: 1,
                    }
                },
                {
                    type: "Control",
                    scope: "#/properties/status",
                    options: {
                        detail: {
                            type: "VerticalLayout",
                            elements: [
                                {
                                    type: "Control",
                                    scope: "#/properties/name"
                                },
                                {
                                    type: "Control",
                                    scope: "#/properties/color",
                                    options: {
                                        color: true,
                                    }
                                }
                            ]
                        }
                    }
                }
            ]
        },
        data: {
            title: 'Status',
            use3D: false,
        },
        Component: function (data) { return (_jsx(LocalDataSourcesProvider, { SelectedTopics: [data.topic], buffersSize: 1, children: _jsx(IntStatusIndicator, __assign({}, data)) })); }
    };
}
;
