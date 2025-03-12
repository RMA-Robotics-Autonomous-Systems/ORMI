"use server"
/*
    Class that loads all plugins using the plugin registry system,
    and stores them in a Map object.
*/
import fs from 'fs';
import path from 'path';
import { PluginInfo } from './plugins-types';

class PluginsLoader {

    public plugins: Map<string, PluginInfo>;

    constructor() {
        this.plugins = new Map();

        this.loadPlugins();
    }

    /**
     * Load all plugins from the given directory
     * @param directory 
     */
    loadPlugins() {
        // Path to node_modules
        const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');

        // Find all packages with ormi_plugin flag
        const dirs = fs.readdirSync(nodeModulesPath);

        for (const dir of dirs) {
            const packageJsonPath = path.join(nodeModulesPath, dir, 'package.json');
        
            if (fs.existsSync(packageJsonPath)) {
                try {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                    
                    if (packageJson.ormi_plugin === true) {

                        const pluginInfo: PluginInfo = {
                            name: packageJson.name,
                            version: packageJson.version,
                            description: packageJson.description,
                        };

                        this.plugins.set(packageJson.name, pluginInfo);
                    }
                } catch (err) {
                    console.error(`Error reading package.json from ${dir}:`, err);
                }
            }
        }

        console.log('Plugins loaded:', this.plugins);
    }
}

export default PluginsLoader;