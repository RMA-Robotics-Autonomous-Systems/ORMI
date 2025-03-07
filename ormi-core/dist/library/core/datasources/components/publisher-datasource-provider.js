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
import { createContext, useContext, useEffect, useState } from 'react';
import { usePluginsManager } from '../../../../library/core/plugins/components/plugins-provider';
import { useDashboardManager } from '../../../../library/core/dashboard/components/dashboard-provider';
import { toast } from '../../../../library/hooks/use-toast';
var Publisher = /** @class */ (function () {
    function Publisher(topic, pluginManager) {
        this.topic = topic;
        this.pm = pluginManager;
    }
    Publisher.prototype.advertise = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.pm.applyFilterAsync("".concat(this.topic.source.id, "-advertise"), this.topic)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    Publisher.prototype.unadvertise = function () {
        this.pm.doAction("".concat(this.topic.source.id, "-unadvertise"), this.topic);
    };
    Publisher.prototype.publish = function (data, webtype) {
        this.pm.doAction("".concat(this.topic.source.id, "-").concat(this.topic.topic, "-publish"), this.topic, data, webtype);
    };
    return Publisher;
}());
var PublisherDataSourcesContext = createContext({
    publishers: new Map()
});
var PublisherDataSourcesProvider = function (props) {
    var children = props.children, SelectedTopics = props.SelectedTopics;
    // const sources = useRef<Map<string, Source<any>>>(new Map<string, Source<any>>()).current;
    var pluginsManager = usePluginsManager();
    var Topics = SelectedTopics;
    var _a = useState(new Map()), publishers = _a[0], setPublishers = _a[1];
    var _b = useState(false), initialized = _b[0], setInitialized = _b[1];
    var datasources = useDashboardManager().datasources;
    useEffect(function () {
        new Promise(function (resolve) {
            var initializedTopics = new Map();
            function setInitializedTopic(topic, state) {
                initializedTopics.set(topic, state);
                if (initializedTopics.size === Topics.length) {
                    resolve(initializedTopics);
                }
            }
            // For each topic, create a source
            Topics.forEach(function (topic) { return __awaiter(void 0, void 0, void 0, function () {
                var publisher, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            publisher = new Publisher(topic, pluginsManager);
                            return [4 /*yield*/, publisher.advertise()];
                        case 1:
                            result = _a.sent();
                            console.log('PublisherDataSourcesProvider', topic.topic, result);
                            setPublishers(function (prev) {
                                var newPublishers = new Map(prev);
                                newPublishers.set(topic.topic, publisher);
                                return newPublishers;
                            });
                            setInitializedTopic(topic.topic, result);
                            return [2 /*return*/];
                    }
                });
            }); });
        }).then(function (initializedTopics) {
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
            console.log('PublisherDataSourcesProvider initialized');
            setInitialized(true);
        });
        return function () {
            // for each publisher, destroy it
            publishers.forEach(function (publisher) {
                publisher.unadvertise();
            });
        };
    }, [SelectedTopics, datasources]);
    return (_jsxs(PublisherDataSourcesContext.Provider, { value: { publishers: publishers }, children: [initialized && children, !initialized && _jsx("div", { children: "Loading..." })] }));
};
var usePublisherDataSource = function () {
    var context = useContext(PublisherDataSourcesContext);
    if (!context) {
        throw new Error('useLocalDataSource must be used within a GlobalDataSourcesProvider');
    }
    return context;
};
export { PublisherDataSourcesProvider, usePublisherDataSource };
