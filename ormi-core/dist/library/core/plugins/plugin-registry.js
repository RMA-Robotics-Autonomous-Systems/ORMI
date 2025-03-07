/**
 * A registry for plugins to register themselves
 * This avoids the need for dynamic imports
 */
var PluginRegistry = /** @class */ (function () {
    function PluginRegistry() {
        this.pluginConstructors = new Map();
    }
    PluginRegistry.getInstance = function () {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    };
    /**
     * Register a plugin constructor
     * @param name The name of the plugin
     * @param constructor The plugin constructor
     */
    PluginRegistry.prototype.register = function (name, constructor) {
        this.pluginConstructors.set(name, constructor);
        console.log("Plugin \"".concat(name, "\" registered"));
    };
    /**
     * Get a plugin constructor by name
     * @param name The name of the plugin
     */
    PluginRegistry.prototype.getConstructor = function (name) {
        return this.pluginConstructors.get(name);
    };
    /**
     * Get all registered plugin constructors
     */
    PluginRegistry.prototype.getAllConstructors = function () {
        return this.pluginConstructors;
    };
    return PluginRegistry;
}());
export default PluginRegistry;
