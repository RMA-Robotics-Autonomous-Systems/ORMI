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
import { TreeView, Spinner } from "ormi-core/components";
import { LocalDataSourcesProvider, useLocalDataSource } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { ListTreeIcon } from "lucide-react";
export function TreeViewer() {
    var _a;
    var sources = useLocalDataSource().sources;
    // const animationFrameId = useRef<number>();
    function generateTreeView(obj, parentId) {
        if (parentId === void 0) { parentId = ''; }
        if (!obj)
            return [];
        var treeViewItems = [];
        for (var key in obj) {
            var prop = obj[key];
            var uniqueId = parentId ? "".concat(parentId, "-").concat(key) : key;
            var item = {
                id: uniqueId,
                name: isPrimitive(prop) ? "".concat(key, ": ").concat(prop) : key,
                children: []
            };
            if (typeof prop === 'object') {
                item.children = generateTreeView(prop, uniqueId);
            }
            treeViewItems.push(item);
        }
        return treeViewItems;
    }
    function isPrimitive(val) {
        if (val === null)
            return true;
        var primitiveTypes = ['string', 'number', 'boolean'];
        return primitiveTypes.includes(typeof val);
    }
    // Get data directly from sources
    var treeData = generateTreeView((_a = Array.from(sources.values())[0]) === null || _a === void 0 ? void 0 : _a.data[0]);
    return (_jsx("div", { style: { height: "100%", overflow: "auto" }, children: treeData && treeData.length > 0 ? (_jsx(TreeView, { data: treeData })) : (_jsx(Spinner, {})) }));
}
export function TreeViewerDefinition() {
    var _this = this;
    var pluginsManager = usePluginsManager();
    return {
        id: 'tree-viewer-widget',
        name: 'Tree viewer',
        description: 'Display a tree view of data',
        titleProp: 'title',
        icon: _jsx(ListTreeIcon, {}),
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title"
                },
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync(PluginsHooks.AVAILABLE_TOPICS, [])];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); },
                        buffer: 1,
                    }
                }
            ],
        },
        data: {
            title: 'Tree viewer'
        },
        Component: function (data) { return (_jsx(LocalDataSourcesProvider, { SelectedTopics: [data.topic], buffersSize: 1, children: _jsx(TreeViewer, {}) })); }
    };
}
