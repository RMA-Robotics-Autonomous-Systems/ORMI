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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isControl, and, uiTypeIs } from '@jsonforms/core';
import { useEffect, useState } from 'react';
import { cn } from "../../../../../library/lib/utils";
import { Label } from '../../../../../library/components/ui/label';
import { usePluginsManager } from '../../../../../library/core/plugins/components/plugins-provider';
import { toast } from '../../../../../library/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../../library/components/ui/popover';
import { Button } from '../../../../../library/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../../../library/components/ui/command';
import { generateTreeView } from '../../../../../library/core/utils/json-schema-to-tree-view';
import TopicCreator from './topic-creator';
import { Check, ChevronsUpDown } from 'lucide-react';
import { CommandSeparator } from 'cmdk';
import { Input } from '../../../../../library/components/ui/input';
import style from "../../../../../library/core/jsonforms/utils/renderer.module.css";
import { TreeView } from '../../../../../library/components/tree-view';
var AsyncTopicControl = function (props) {
    var _a;
    // Destructure props for clarity
    var data = props.data, handleChange = props.handleChange, path = props.path, uischema = props.uischema, label = props.label;
    var _b = useState(false), open = _b[0], setOpen = _b[1];
    var _c = useState([]), topics = _c[0], setTopics = _c[1];
    var _d = useState([]), topicProps = _d[0], setTopicProps = _d[1];
    var _e = useState(''), selectedTopic = _e[0], setSelectedTopic = _e[1];
    var _f = useState(undefined), selectedTopicObject = _f[0], setSelectedTopicObject = _f[1];
    var pluginsManager = usePluginsManager();
    var _g = useState(''), cmd = _g[0], setCmd = _g[1];
    var getTopicByName = function (name) { return topics.find(function (topic) { return topic.topic === name; }); };
    // Helper function to retrieve topic definition and update tree view items.
    var fetchTopicDefinition = function (topic, currentData) { return __awaiter(void 0, void 0, void 0, function () {
        var topicDef;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync("".concat(topic === null || topic === void 0 ? void 0 : topic.source.id, "-definition"), {}, topic)];
                case 1:
                    topicDef = _b.sent();
                    if (!topicDef.properties) {
                        // Validate type if topic definition is primitive.
                        if (!((_a = uischema.options) === null || _a === void 0 ? void 0 : _a.propertyType))
                            return [2 /*return*/];
                        if (topicDef.type !== uischema.options.propertyType) {
                            toast({
                                title: "Error",
                                description: "The topic type is not equal to the property type: ".concat(uischema.options.propertyType),
                                variant: "destructive"
                            });
                            return [2 /*return*/];
                        }
                        return [2 /*return*/];
                    }
                    setTopicProps(generateTreeView(topicDef, handleItemSelect));
                    return [2 /*return*/];
            }
        });
    }); };
    var handleTopicChange = function (topicIdentifier) { return __awaiter(void 0, void 0, void 0, function () {
        var topicName, topic, newTopicObj;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    topicName = topicIdentifier.split('@')[0];
                    topic = getTopicByName(topicName);
                    setTopicProps([]);
                    setOpen(false);
                    setSelectedTopic(topicName);
                    newTopicObj = topic ? __assign(__assign({}, topic), { property: '' }) : undefined;
                    setSelectedTopicObject(newTopicObj);
                    handleChange(path, {
                        topic: topic === null || topic === void 0 ? void 0 : topic.topic,
                        source: topic === null || topic === void 0 ? void 0 : topic.source,
                        property: '',
                        type: topic === null || topic === void 0 ? void 0 : topic.type,
                        rawType: topic === null || topic === void 0 ? void 0 : topic.rawType, // Include rawType property
                        bufferSize: (topic === null || topic === void 0 ? void 0 : topic.bufferSize) || ((_a = uischema.options) === null || _a === void 0 ? void 0 : _a.buffer) || 1
                    });
                    if (!topic) return [3 /*break*/, 2];
                    return [4 /*yield*/, fetchTopicDefinition(topic)];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    }); };
    var handleCustomTopics = function (source, topic, type) {
        setSelectedTopic(topic);
        setSelectedTopicObject(function (prev) {
            var _a;
            return prev ? __assign(__assign({}, prev), { topic: topic, rawType: prev.rawType, source: source.settings, type: type, property: prev.property || '', bufferSize: prev.bufferSize || ((_a = uischema.options) === null || _a === void 0 ? void 0 : _a.buffer) || 1 }) : prev;
        });
        handleChange(path, {
            topic: topic,
            source: source.settings,
            property: '',
            type: type,
            rawType: type, // Include rawType property
            bufferSize: 1
        });
        setOpen(false);
    };
    var handleBufferChange = function (event) {
        var value = parseInt(event.target.value);
        var updated = selectedTopicObject ? __assign(__assign({}, selectedTopicObject), { bufferSize: value }) : undefined;
        setSelectedTopicObject(updated);
        if (updated)
            handleChange(path, updated);
    };
    var handleItemSelect = function (itemId) {
        if (!selectedTopicObject)
            return;
        var updated = __assign(__assign({}, selectedTopicObject), { property: itemId });
        setSelectedTopicObject(updated);
        handleChange(path, updated);
    };
    useEffect(function () {
        var _a;
        var asyncFunction = (_a = uischema.options) === null || _a === void 0 ? void 0 : _a.asyncFunction;
        if (asyncFunction) {
            asyncFunction().then(function (result) { return __awaiter(void 0, void 0, void 0, function () {
                var value, topic;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            setTopics(result);
                            value = data;
                            if (!value) return [3 /*break*/, 2];
                            setSelectedTopic(value.topic);
                            setSelectedTopicObject(value);
                            topic = getTopicByName(value.topic);
                            if (!topic) return [3 /*break*/, 2];
                            return [4 /*yield*/, fetchTopicDefinition(topic, value)];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2: return [2 /*return*/];
                    }
                });
            }); });
        }
    }, []); // run once on mount
    return (_jsxs("div", { className: style.cell, children: [_jsx(Label, { children: label }), _jsxs("div", { className: 'flex flex-col gap-2 w-full', children: [_jsxs(Popover, { open: open, onOpenChange: setOpen, children: [_jsx(PopoverTrigger, { asChild: true, className: "w-full", children: _jsxs(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: "w-full justify-between", children: [selectedTopic || 'Select a topic', _jsx(ChevronsUpDown, { className: "opacity-50" })] }) }), _jsx(PopoverContent, { children: _jsxs(Command, { children: [_jsx(CommandInput, { onValueChange: setCmd, placeholder: "Search topic..." }), _jsx(TopicCreator, { value: cmd, handleTopic: handleCustomTopics }), _jsx(CommandSeparator, {}), _jsx(CommandList, { children: _jsx(CommandGroup, { children: topics.map(function (topic) { return (_jsxs(CommandItem, { value: "".concat(topic.topic, "@").concat(topic.source.id), onSelect: handleTopicChange, children: [_jsx("small", { className: "text-gray-500", children: topic.source.title }), _jsx("small", { className: "text-gray-500", children: topic.type || "".concat(topic.rawType, "*") }), topic.topic, _jsx(Check, { className: cn("ml-auto", (selectedTopic === topic.topic && (selectedTopicObject === null || selectedTopicObject === void 0 ? void 0 : selectedTopicObject.source.id) === topic.source.id) ? "opacity-100" : "opacity-0") })] }, "".concat(topic.topic, "-").concat(topic.source.id))); }) }) })] }) })] }), _jsx("div", { children: topicProps.length > 0 && _jsx(TreeView, { data: topicProps }) }), !((_a = uischema.options) === null || _a === void 0 ? void 0 : _a.buffer) && (_jsxs("div", { className: 'flex flex-row gap-2', children: [_jsx("label", { className: "text-gray-500", children: "Buffer size (optional)" }), _jsx(Input, { type: "number", defaultValue: selectedTopicObject === null || selectedTopicObject === void 0 ? void 0 : selectedTopicObject.bufferSize, onChange: handleBufferChange })] }))] })] }));
};
export default withJsonFormsControlProps(AsyncTopicControl);
// Define a tester that checks for a specific option in uischema
var asyncTopicTester = rankWith(10, // Increase rank to ensure this tester is selected when applicable
and(isControl, uiTypeIs('TopicSelect')));
export { asyncTopicTester };
