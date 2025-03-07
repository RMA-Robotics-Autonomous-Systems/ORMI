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
import { existsSync, readFileSync, writeFileSync } from "fs";
import { rm } from "fs/promises";
import path from "path";
import ora from "ora";
import inquirer from "inquirer";
export function remove(pluginName, options) {
    return __awaiter(this, void 0, void 0, function () {
        var spinner, targetDir, confirm_1, pluginsFilePath, content, plugins, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    spinner = ora("Removing plugin ".concat(pluginName)).start();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    targetDir = path.join(process.cwd(), "plugins", pluginName);
                    console.log(targetDir);
                    if (!existsSync(targetDir)) {
                        spinner.fail("Plugin \"".concat(pluginName, "\" does not exist"));
                        process.exit(1);
                    }
                    if (!!options.yes) return [3 /*break*/, 3];
                    spinner.stop();
                    return [4 /*yield*/, inquirer.prompt({
                            type: 'confirm',
                            name: 'confirm',
                            message: "Are you sure you want to remove plugin \"".concat(pluginName, "\"?"),
                            default: false
                        })];
                case 2:
                    confirm_1 = (_a.sent()).confirm;
                    if (!confirm_1) {
                        console.log('Operation cancelled');
                        process.exit(0);
                    }
                    spinner.start();
                    _a.label = 3;
                case 3: 
                // Remove the plugin directory
                return [4 /*yield*/, rm(targetDir, { recursive: true, force: true })];
                case 4:
                    // Remove the plugin directory
                    _a.sent();
                    // Update the ormi-plugins.json file to remove the plugin entry
                    try {
                        pluginsFilePath = path.join(process.cwd(), "ormi-plugins.json");
                        if (existsSync(pluginsFilePath)) {
                            content = readFileSync(pluginsFilePath, "utf-8");
                            plugins = JSON.parse(content);
                            if (plugins[pluginName]) {
                                delete plugins[pluginName];
                                writeFileSync(pluginsFilePath, JSON.stringify(plugins, null, 2));
                            }
                        }
                    }
                    catch (err) {
                        console.error("Failed to update ormi-plugins.json:", err);
                    }
                    spinner.succeed("Successfully removed plugin \"".concat(pluginName, "\""));
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    spinner.fail("Failed to remove plugin: ".concat(error_1.message));
                    process.exit(1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
