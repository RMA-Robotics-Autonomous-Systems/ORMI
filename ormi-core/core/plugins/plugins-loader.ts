/*
    Class that load all plugins in the plugins directory,
    and store them in a Map object.
*/

// import Bun;
import fs from 'fs';

class PluginsLoader{

    private static plugins: Map<string,unknown> = {};
    private static pluginsDir: string = 'plugins';
    
    static addPlugin(plugin: unknown): void{
        // Add plugin to plugins object
        console.log(plugin);
    }

    static getPlugin(pluginName: string): unknown{
        // Get plugin from plugins object

        if(PluginsLoader.plugins.has(pluginName)){
            return PluginsLoader.plugins.get(pluginName);
        }

        throw new Error(`Plugin ${pluginName} not found`);
    }

    static getPlugins(): unknown{
        return PluginsLoader.plugins;
    }

    static Load(): void{
        // Load all plugins in the plugins directory
        const plugins: string[] = PluginsLoader.listPluginsDir();

        for(const plugin of plugins){
            const pluginClass = require(`../../${PluginsLoader.pluginsDir}/${plugin}/index.ts`).default;
            PluginsLoader.addPlugin(pluginClass);
        }

        console.log(plugins);

    }

    private static listPluginsDir(): string[]{
        // list all the folders in the plugins directory,
        // only if a file with the name index.ts exists in the folder
        const plugins: string[] = [];

        fs.readdirSync(PluginsLoader.pluginsDir).forEach(file => {
            if(fs.lstatSync(`${PluginsLoader.pluginsDir}/${file}`).isDirectory()){
                if(fs.existsSync(`${PluginsLoader.pluginsDir}/${file}/index.ts`)){
                    plugins.push(file);
                }
            }
        });

        return plugins;
    } 

}

export default PluginsLoader;