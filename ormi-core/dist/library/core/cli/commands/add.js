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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "fs";
import path from "path";
import { execSync } from "child_process";
import ora from "ora";
export function add(pluginName, gitUrl, options) {
    return __awaiter(this, void 0, void 0, function () {
        var spinner, targetDir, files, _i, files_1, file, mainPackageJsonPath, pluginPackageJsonPath, pluginPackageJson, deps, pluginsFilePath, plugins, content, err;
        return __generator(this, function (_a) {
            spinner = ora("Installing plugin ".concat(pluginName)).start();
            try {
                targetDir = path.join(process.cwd(), "plugins", pluginName);
                if (existsSync(targetDir)) {
                    spinner.succeed("Plugin \"".concat(pluginName, "\" already exists"));
                    process.exit(0);
                }
                // Create plugin directory
                mkdirSync(targetDir, { recursive: true });
                // Clone the repository
                execSync("git clone --depth 1 --branch ".concat(options.branch, " ").concat(gitUrl, " ").concat(targetDir), { stdio: "pipe" });
                // remove .git directory and .gitignore file
                rmSync(path.join(targetDir, ".git"), { recursive: true, force: true });
                rmSync(path.join(targetDir, ".gitignore"), { recursive: true, force: true });
                files = readdirSync(targetDir);
                for (_i = 0, files_1 = files; _i < files_1.length; _i++) {
                    file = files_1[_i];
                    if (file.includes("lock")) {
                        rmSync(path.join(targetDir, file), { recursive: true, force: true });
                    }
                }
                // remove the tsconfig.json file
                rmSync(path.join(targetDir, "tsconfig.json"), { recursive: true, force: true });
                mainPackageJsonPath = path.join(process.cwd(), "package.json");
                if (existsSync(mainPackageJsonPath)) {
                    pluginPackageJsonPath = path.join(targetDir, "package.json");
                    if (existsSync(pluginPackageJsonPath)) {
                        spinner.text = "Installing plugin dependencies...";
                        pluginPackageJson = JSON.parse(readFileSync(pluginPackageJsonPath, "utf-8"));
                        if (pluginPackageJson.dependencies) {
                            deps = Object.entries(pluginPackageJson.dependencies)
                                .map(function (_a) {
                                var dep = _a[0], version = _a[1];
                                return "".concat(dep, "@").concat(version);
                            })
                                .join(" ");
                            execSync("bun add ".concat(deps), {
                                cwd: process.cwd(),
                                stdio: "pipe",
                            });
                        }
                    }
                }
                // remove the package.json file
                rmSync(path.join(targetDir, "package.json"), { recursive: true, force: true });
                // Update or create the ormi-plugins.json file with the new plugin entry
                try {
                    pluginsFilePath = path.join(process.cwd(), "ormi-plugins.json");
                    plugins = {};
                    if (existsSync(pluginsFilePath)) {
                        content = readFileSync(pluginsFilePath, "utf-8");
                        plugins = JSON.parse(content);
                    }
                    if (!plugins[pluginName]) {
                        plugins[pluginName] = { git: gitUrl };
                        writeFileSync(pluginsFilePath, JSON.stringify(plugins, null, 2));
                    }
                }
                catch (err) {
                    console.error("Failed to update ormi-plugins.json:", err);
                }
                spinner.succeed("Successfully installed plugin \"".concat(pluginName, "\""));
            }
            catch (error) {
                err = error instanceof Error ? error : new Error(String(error));
                spinner.fail("Failed to install plugin: ".concat(err.message));
                process.exit(1);
            }
            return [2 /*return*/];
        });
    });
}
