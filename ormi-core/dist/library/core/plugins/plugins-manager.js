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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
/*

    Class used in client side to manage actions and filters of plugins

*/
var PluginsManager = /** @class */ (function () {
    function PluginsManager(pluginsMap) {
        this.plugins = pluginsMap;
        // add a "basic" plugin that will be used to add new filters and actions from the client side
        this.plugins.set("basic", {
            actions: new Map(),
            filters: new Map(),
            name: "basic",
            description: "basic plugin",
            version: "1.0.0"
        });
    }
    PluginsManager.prototype.applyFilter = function (filterName) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        if (args.length < 1) {
            throw new Error("No argument given in ".concat(filterName));
        }
        var result = args[0];
        var filters = [];
        this.plugins.forEach(function (plugin) {
            var filtersMap = plugin.filters.get(filterName);
            if (filtersMap !== undefined) {
                filtersMap.forEach(function (filter) {
                    filters.push(filter);
                });
            }
        });
        if (filters.length === 0) {
            console.warn("No filter found for ".concat(filterName));
        }
        filters.sort(function (a, b) { return a.priority - b.priority; });
        filters.forEach(function (filter) {
            result = filter.filter.apply(filter, __spreadArray([result], args.slice(1), false));
        });
        return result;
    };
    PluginsManager.prototype.applyFilterAsync = function (filterName) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return __awaiter(this, void 0, void 0, function () {
            var result, filters, _a, filters_1, filter;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (args.length < 1) {
                            throw new Error("No argument given in ".concat(filterName));
                        }
                        result = args[0];
                        filters = [];
                        this.plugins.forEach(function (plugin) {
                            var filtersMap = plugin.filters.get(filterName);
                            if (filtersMap !== undefined) {
                                filtersMap.forEach(function (filter) {
                                    filters.push(filter);
                                });
                            }
                        });
                        if (filters.length === 0) {
                            console.warn("No filter found for ".concat(filterName));
                        }
                        filters.sort(function (a, b) { return a.priority - b.priority; });
                        _a = 0, filters_1 = filters;
                        _b.label = 1;
                    case 1:
                        if (!(_a < filters_1.length)) return [3 /*break*/, 4];
                        filter = filters_1[_a];
                        return [4 /*yield*/, filter.filter.apply(filter, __spreadArray([result], args.slice(1), false))];
                    case 2:
                        result = (_b.sent());
                        _b.label = 3;
                    case 3:
                        _a++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, result];
                }
            });
        });
    };
    PluginsManager.prototype.addFilter = function (filterName, filter) {
        var _a, _b;
        var basicPlugin = this.plugins.get("basic");
        if (basicPlugin === undefined) {
            throw new Error("Basic plugin not found");
        }
        if (!basicPlugin.filters.has(filterName)) {
            basicPlugin.filters.set(filterName, new Map());
        }
        if ((_a = basicPlugin.filters.get(filterName)) === null || _a === void 0 ? void 0 : _a.has(filter.id)) {
            throw new Error("Filter with id ".concat(filter.id, " already exists"));
        }
        (_b = basicPlugin.filters.get(filterName)) === null || _b === void 0 ? void 0 : _b.set(filter.id, filter);
    };
    PluginsManager.prototype.removeFilter = function (pluginFilterId) {
        // search for the filter in all plugins
        // if none has the filter, throw an error, otherwise delete it
        this.plugins.forEach(function (plugin) {
            plugin.filters.forEach(function (filterMap) {
                if (filterMap.has(pluginFilterId)) {
                    filterMap.delete(pluginFilterId);
                    return;
                }
            });
        });
        // throw new Error(`Filter with id ${pluginFilterId} not found`);
    };
    /*
        Execute all callback registered on the "actionName" hook.
        If no action found, will log a warning.
    */
    PluginsManager.prototype.doAction = function (actionName) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var actions = [];
        this.plugins.forEach(function (plugin) {
            if (plugin.actions.has(actionName)) {
                var actionsMap = plugin.actions.get(actionName);
                if (actionsMap !== undefined) {
                    actionsMap.forEach(function (action) {
                        actions.push(action);
                    });
                }
            }
        });
        actions.sort(function (a, b) { return a.priority - b.priority; });
        if (actions.length === 0) {
            console.warn("No action found for ".concat(actionName));
        }
        actions.forEach(function (action) {
            action.action.apply(action, args);
        });
    };
    /*
        Same as do action, but will wait for action to exist.
    */
    PluginsManager.prototype.WaitAndDoAction = function (actionName_1) {
        return __awaiter(this, arguments, void 0, function (actionName, timeoutSecond) {
            var _i, result;
            if (timeoutSecond === void 0) { timeoutSecond = 5; }
            var args = [];
            for (_i = 2; _i < arguments.length; _i++) {
                args[_i - 2] = arguments[_i];
            }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.WaitForActionToExist(actionName, timeoutSecond)];
                    case 1:
                        result = _a.sent();
                        if (!result) {
                            return [2 /*return*/, false];
                        }
                        this.doAction.apply(this, __spreadArray([actionName], args, false));
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /*
        Add an action to the system. The action can later be called using the "actionName"
    */
    PluginsManager.prototype.addAction = function (actionName, action) {
        var _a, _b;
        var basicPlugin = this.plugins.get("basic");
        if (basicPlugin === undefined) {
            throw new Error("Basic plugin not found");
        }
        if (!basicPlugin.actions.has(actionName)) {
            basicPlugin.actions.set(actionName, new Map());
        }
        if ((_a = basicPlugin.actions.get(actionName)) === null || _a === void 0 ? void 0 : _a.has(action.id)) {
            throw new Error("Action with id ".concat(action.id, " already exists"));
        }
        (_b = basicPlugin.actions.get(actionName)) === null || _b === void 0 ? void 0 : _b.set(action.id, action);
    };
    /*
        Remove an action from its id
    */
    PluginsManager.prototype.removeAction = function (pluginActionId) {
        // search for the action in all plugins, if none has the action, throw an error, otherwise delete it
        this.plugins.forEach(function (plugin) {
            plugin.actions.forEach(function (actionsMap) {
                if (actionsMap.has(pluginActionId)) {
                    actionsMap.delete(pluginActionId);
                    return;
                }
            });
        });
        // throw new Error(`Action with id ${pluginActionId} not found`);
    };
    /*
        Wait for action to existe, check at a period of 100ms until found or timed out
    */
    PluginsManager.prototype.WaitForActionToExist = function (actionName, timeoutSecond) {
        var _this = this;
        if (timeoutSecond === void 0) { timeoutSecond = 5; }
        return new Promise(function (resolve) {
            var interval = setInterval(function () {
                var _a;
                if ((_a = _this.plugins.get("basic")) === null || _a === void 0 ? void 0 : _a.actions.has(actionName)) {
                    clearInterval(interval);
                    clearTimeout(timeout);
                    resolve(true);
                }
            }, 100);
            var timeout = setTimeout(function () {
                clearInterval(interval);
                resolve(false);
            }, timeoutSecond * 1000);
        });
    };
    PluginsManager.prototype.getPlugins = function () {
        return this.plugins;
    };
    return PluginsManager;
}());
export default PluginsManager;
