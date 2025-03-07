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
import { existsSync, readFileSync } from "fs";
import path from "path";
import { rm } from "fs/promises";
import ora from "ora";
import { add } from "./add";
export function update() {
    return __awaiter(this, arguments, void 0, function (options) {
        var spinner, pluginsFilePath, content, plugins, branch, allUpdated, _i, _a, _b, pluginName, git, targetDir, e_1, error_1;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    spinner = ora("Updating all plugins").start();
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 9, , 10]);
                    pluginsFilePath = path.join(process.cwd(), "ormi-plugins.json");
                    if (!existsSync(pluginsFilePath)) {
                        spinner.fail("ormi-plugins.json not found");
                        process.exit(1);
                    }
                    content = readFileSync(pluginsFilePath, "utf-8");
                    plugins = JSON.parse(content);
                    branch = options.branch || "main";
                    allUpdated = true;
                    _i = 0, _a = Object.entries(plugins);
                    _c.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 8];
                    _b = _a[_i], pluginName = _b[0], git = _b[1].git;
                    spinner.text = "Updating plugin ".concat(pluginName);
                    targetDir = path.join(process.cwd(), "plugins", pluginName);
                    if (!existsSync(targetDir)) {
                        spinner.warn("Plugin \"".concat(pluginName, "\" is not installed locally. Skipping."));
                        return [3 /*break*/, 7];
                    }
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 6, , 7]);
                    return [4 /*yield*/, rm(targetDir, { recursive: true, force: true })];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, add(pluginName, git, { yes: true, branch: branch })];
                case 5:
                    _c.sent();
                    return [3 /*break*/, 7];
                case 6:
                    e_1 = _c.sent();
                    spinner.fail("Failed updating plugin \"".concat(pluginName, "\": ").concat(e_1 instanceof Error ? e_1.message : e_1));
                    allUpdated = false;
                    return [3 /*break*/, 7];
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8:
                    if (allUpdated) {
                        spinner.succeed("Successfully updated all plugins");
                        process.exit(0);
                    }
                    else {
                        console.log("Some plugins were not updated successfully.");
                    }
                    return [3 /*break*/, 10];
                case 9:
                    error_1 = _c.sent();
                    spinner.fail("Failed to update plugins: ".concat(error_1 instanceof Error ? error_1.message : error_1));
                    process.exit(1);
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/];
            }
        });
    });
}
