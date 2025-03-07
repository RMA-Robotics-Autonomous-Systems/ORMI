/*
    Class that implements the core of a plugin.
*/
var PluginServerSide = /** @class */ (function () {
    function PluginServerSide(options) {
        this.dependencies = [];
        // actions
        this.actions = new Map();
        this.filters = new Map();
        this.name = (options === null || options === void 0 ? void 0 : options.name) || "core";
        this.description = (options === null || options === void 0 ? void 0 : options.description) || "Core plugin";
        this.version = (options === null || options === void 0 ? void 0 : options.version) || "1.0.0";
        this.author = (options === null || options === void 0 ? void 0 : options.author) || "";
        this.email = (options === null || options === void 0 ? void 0 : options.email) || "";
        this.url = (options === null || options === void 0 ? void 0 : options.url) || "";
        this.dependencies = (options === null || options === void 0 ? void 0 : options.dependencies) || [];
        // Automatically initialize the plugin
        this.initialize();
    }
    /**
     * Initialize the plugin - register actions, filters, etc.
     * Override this method in subclasses to implement plugin logic.
     */
    PluginServerSide.prototype.initialize = function () {
        // To be overridden by subclasses
    };
    PluginServerSide.prototype.getName = function () {
        return this.name;
    };
    PluginServerSide.prototype.getDescription = function () {
        return this.description;
    };
    PluginServerSide.prototype.getVersion = function () {
        return this.version;
    };
    PluginServerSide.prototype.getAuthor = function () {
        return this.author;
    };
    PluginServerSide.prototype.getEmail = function () {
        return this.email;
    };
    PluginServerSide.prototype.getUrl = function () {
        return this.url;
    };
    PluginServerSide.prototype.getDependencies = function () {
        return this.dependencies;
    };
    PluginServerSide.prototype.addAction = function (actionName, action) {
        var _a;
        if (this.actions.has(actionName)) {
            (_a = this.actions.get(actionName)) === null || _a === void 0 ? void 0 : _a.set(action.id || this.name, action);
        }
        else {
            this.actions.set(actionName, new Map([[action.id || this.name, action]]));
        }
    };
    PluginServerSide.prototype.addFilter = function (filterName, filter) {
        var _a;
        if (this.filters.has(filterName)) {
            (_a = this.filters.get(filterName)) === null || _a === void 0 ? void 0 : _a.set(filter.id || this.name, filter);
        }
        else {
            this.filters.set(filterName, new Map([[filter.id || this.name, filter]]));
        }
    };
    PluginServerSide.prototype.toObject = function () {
        return {
            name: this.name,
            description: this.description,
            version: this.version,
            actions: this.actions,
            filters: this.filters
        };
    };
    return PluginServerSide;
}());
export { PluginServerSide };
