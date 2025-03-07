import fs from 'fs';
import path from 'path';
var PluginDetector = /** @class */ (function () {
    function PluginDetector() {
    }
    /**
     * Scans node_modules for ORMI plugins
     * @param rootDir The root directory of the project (where node_modules is located)
     * @returns An array of detected plugins with their metadata
     */
    PluginDetector.detectPlugins = function (rootDir) {
        var _this = this;
        if (rootDir === void 0) { rootDir = process.cwd(); }
        var nodeModulesPath = path.join(rootDir, 'node_modules');
        var detectedPlugins = [];
        if (!fs.existsSync(nodeModulesPath)) {
            console.warn("Node modules path not found: ".concat(nodeModulesPath));
            return [];
        }
        // Read all directories in node_modules
        var directories = fs.readdirSync(nodeModulesPath)
            .filter(function (item) {
            var itemPath = path.join(nodeModulesPath, item);
            return fs.statSync(itemPath).isDirectory() &&
                (item.startsWith(_this.PLUGIN_PREFIX) || _this.isOrmiFlaggedPlugin(itemPath));
        });
        // Process each potential plugin
        for (var _i = 0, directories_1 = directories; _i < directories_1.length; _i++) {
            var dir = directories_1[_i];
            try {
                var pluginDir = path.join(nodeModulesPath, dir);
                var plugin = this.processPluginDirectory(pluginDir, dir);
                if (plugin) {
                    detectedPlugins.push(plugin);
                }
            }
            catch (error) {
                console.error("Error processing plugin directory ".concat(dir, ":"), error);
            }
        }
        return detectedPlugins;
    };
    /**
     * Checks if a package explicitly marks itself as an ORMI plugin via the package.json
     */
    PluginDetector.isOrmiFlaggedPlugin = function (dirPath) {
        var packageJsonPath = path.join(dirPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            return false;
        }
        try {
            var packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            return !!packageJson.ormiPlugin;
        }
        catch (_a) {
            return false;
        }
    };
    /**
     * Process a plugin directory to extract metadata
     */
    PluginDetector.processPluginDirectory = function (dirPath, packageName) {
        var packageJsonPath = path.join(dirPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            console.warn("No package.json found for potential plugin: ".concat(packageName));
            return null;
        }
        try {
            var packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            var pluginName = packageName.startsWith(this.PLUGIN_PREFIX)
                ? packageName.substring(this.PLUGIN_PREFIX.length)
                : packageName;
            var author = '';
            var email = '';
            var url = '';
            if (typeof packageJson.author === 'string') {
                author = packageJson.author;
            }
            else if (packageJson.author) {
                author = packageJson.author.name || '';
                email = packageJson.author.email || '';
                url = packageJson.author.url || '';
            }
            // For URL, fallback to homepage if available
            if (!url && packageJson.homepage) {
                url = packageJson.homepage;
            }
            return {
                name: pluginName,
                packageName: packageName,
                path: dirPath,
                version: packageJson.version || '0.0.0',
                main: packageJson.main || 'index.js',
                description: packageJson.description || '',
                author: author,
                email: email,
                url: url
            };
        }
        catch (error) {
            console.error("Error parsing package.json for ".concat(packageName, ":"), error);
            return null;
        }
    };
    PluginDetector.PLUGIN_PREFIX = 'ormi-plugin-';
    return PluginDetector;
}());
export { PluginDetector };
