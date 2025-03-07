var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
import { PluginsHooks } from '../../../../library/core/plugins/plugins-types';
import { registerPlugin } from '../plugin-utils';
import { PluginServerSide } from '../plugin-core';
/**
 * Example plugin that demonstrates manual registration
 */
var ExamplePlugin = /** @class */ (function (_super) {
    __extends(ExamplePlugin, _super);
    function ExamplePlugin() {
        return _super.call(this, {
            name: 'example',
            description: 'An example plugin',
            version: '1.0.0',
            author: 'ORMI Team'
        }) || this;
    }
    ExamplePlugin.prototype.initialize = function () {
        // Add some example actions and filters
        this.addAction(PluginsHooks.PLUGIN_PROVIDER_AFTER_CHILDREN, {
            id: 'example-action',
            priority: 10,
            action: function () {
                console.log('Example action executed!');
            }
        });
    };
    return ExamplePlugin;
}(PluginServerSide));
// Register the plugin with the system
registerPlugin('example', ExamplePlugin);
// Note: This file needs to be imported somewhere in your application for the registration to happen
