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
import { PluginServerSide, PluginsHooks } from "ormi-core/plugins";
import WidgetExport from "./widget-export";
var PluginA = /** @class */ (function (_super) {
    __extends(PluginA, _super);
    function PluginA() {
        var _this = _super.call(this) || this;
        _this.name = "STD Widgets";
        _this.description = "Plugin that add standard widgets to the dashboard";
        _this.version = "1.0.0";
        _this.author = "Lbcqu Florian";
        _this.email = "florian.lebecque@mil.be";
        var widgetFilter = {
            id: _this.name + "-widget-export",
            priority: 10,
            filter: WidgetExport
        };
        _this.addFilter(PluginsHooks.WIDGETS_LIST, widgetFilter);
        return _this;
    }
    return PluginA;
}(PluginServerSide));
export default PluginA;
