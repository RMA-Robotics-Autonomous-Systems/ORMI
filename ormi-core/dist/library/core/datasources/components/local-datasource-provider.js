"use client";
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
/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePluginsManager } from '../../../../library/core/plugins/components/plugins-provider';
import { useDashboardManager } from '../../../../library/core/dashboard/components/dashboard-provider';
import { toast } from '../../../../library/hooks/use-toast';
import { Spinner } from '../../../../library/components/spinner';
var LocalDataSourcesContext = createContext({
    sources: new Map()
});
var LocalDataSourcesProvider = function (props) {
    var children = props.children, SelectedTopics = props.SelectedTopics, buffersSize = props.buffersSize;
    var _a = useState(new Map()), sources = _a[0], setSources = _a[1];
    // const sources = useRef<Map<string, Source<any>>>(new Map<string, Source<any>>()).current;
    var pluginsManager = usePluginsManager();
    var Topics = SelectedTopics;
    var local_id = useRef(Math.random().toString(36).substring(7)).current;
    var _b = useState(false), initialized = _b[0], setInitialized = _b[1];
    var datasources = useDashboardManager().datasources;
    useEffect(function () {
        // create a random id for the local datasource
        sources.clear();
        var propertiesGetter = function (data, property) {
            /*
                create a function that gets the value of the property from the data
                the property is a string that is in the form of "property1-property2-property3"

                the properties are recursively accessed from the data object

                the function should return the value of the property from the data
            */
            if (!property || property === '') {
                return data;
            }
            var properties = property.split('-');
            var value = data;
            for (var _i = 0, properties_1 = properties; _i < properties_1.length; _i++) {
                var prop = properties_1[_i];
                value = value[prop];
            }
            return value;
        };
        var isMounted = true;
        new Promise(function (resolve) {
            var initializedTopics = new Map();
            function setInitializedTopic(topic, state) {
                if (!isMounted)
                    return;
                initializedTopics.set(topic, state);
                if (initializedTopics.size === Topics.length) {
                    resolve(initializedTopics);
                }
            }
            // For each topic, create a source
            Topics.forEach(function (topic) { return __awaiter(void 0, void 0, void 0, function () {
                var sourceId, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;
                            sources.set(sourceId, {
                                data: [],
                                times: []
                            });
                            return [4 /*yield*/, pluginsManager.WaitAndDoAction("".concat(topic.source.id, "-subscribe"), 1, topic)];
                        case 1:
                            result = _a.sent();
                            if (result === false) {
                                setInitializedTopic(topic.topic, false);
                                return [2 /*return*/];
                            }
                            // add an action on the data hook of the topic, will only be triggered when the data is published, and if the topic is subscribed
                            //topic.source.id + "-" + topic.topic + "-published"
                            pluginsManager.addAction("".concat(topic.source.id, "-").concat(topic.topic, "-published"), {
                                id: "".concat(local_id, "-").concat(topic.source.id, "-").concat(topic.topic, "_").concat(topic.property, "-published"),
                                priority: 10,
                                action: function (value, time) {
                                    if (!isMounted)
                                        return;
                                    var source = sources.get(sourceId);
                                    if (!source) {
                                        console.error('source not found', sourceId, sources);
                                        return;
                                    }
                                    if (topic.property && topic.property !== '') {
                                        value = propertiesGetter(value, topic.property);
                                    }
                                    source.data.push(value);
                                    source.times.push(time);
                                    if (source.data.length > (topic.bufferSize || buffersSize)) {
                                        source.data.shift();
                                        source.times.shift();
                                    }
                                    setSources(function (prevSources) {
                                        var newSources = new Map(prevSources);
                                        newSources.set(sourceId, source);
                                        return newSources;
                                    });
                                }
                            });
                            setInitializedTopic(topic.topic, true);
                            return [2 /*return*/];
                    }
                });
            }); });
        }).then(function (initializedTopics) {
            if (!isMounted)
                return;
            // add toast for the topics that are not initialized
            var notInitializedTopics = Topics.filter(function (topic) { return !initializedTopics.get(topic.topic); });
            var message = (_jsxs("div", { children: [_jsx("div", { children: "Some topics are not initialized:" }), _jsx("ul", { children: notInitializedTopics.map(function (topic, index) { return _jsx("li", { children: topic.topic }, "".concat(topic.topic, "-").concat(index)); }) })] }));
            if (notInitializedTopics.length > 0) {
                toast({
                    title: "Error",
                    description: message,
                    variant: "destructive"
                });
            }
            setInitialized(true);
        });
        return function () {
            isMounted = false;
            Topics.forEach(function (topic) { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            // unsubscribe from the topic, if no other widget is subscribed to the topic, the data flow will stop
                            // await pluginsManager.WaitForActionToExist(`${topic.source}-unsubscribe`);
                            // pluginsManager.doAction(`${topic.source}-unsubscribe`, topic);
                            console.log('ask to unsubscribe from topic', topic);
                            return [4 /*yield*/, pluginsManager.WaitAndDoAction("".concat(topic.source.id, "-unsubscribe"), 1, topic)];
                        case 1:
                            _a.sent();
                            // remove the action that was added to the data hook of the topic,
                            pluginsManager.removeAction("".concat(local_id, "-").concat(topic.source.id, "-").concat(topic.topic, "_").concat(topic.property, "-published"));
                            return [2 /*return*/];
                    }
                });
            }); });
        };
    }, [SelectedTopics, datasources, buffersSize]);
    return (_jsxs(LocalDataSourcesContext.Provider, { value: { sources: sources }, children: [initialized && children, !initialized && _jsx(Spinner, {})] }));
};
var useLocalDataSource = function () {
    var context = useContext(LocalDataSourcesContext);
    if (!context) {
        throw new Error('useLocalDataSource must be used within a GlobalDataSourcesProvider');
    }
    return context;
};
export { LocalDataSourcesProvider, useLocalDataSource };
