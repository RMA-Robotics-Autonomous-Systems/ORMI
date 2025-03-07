export interface DetectedPlugin {
    name: string;
    packageName: string;
    path: string;
    version: string;
    main: string;
    description: string;
    author: string;
    email: string;
    url: string;
}
export declare class PluginDetector {
    private static readonly PLUGIN_PREFIX;
    /**
     * Scans node_modules for ORMI plugins
     * @param rootDir The root directory of the project (where node_modules is located)
     * @returns An array of detected plugins with their metadata
     */
    static detectPlugins(rootDir?: string): DetectedPlugin[];
    /**
     * Checks if a package explicitly marks itself as an ORMI plugin via the package.json
     */
    private static isOrmiFlaggedPlugin;
    /**
     * Process a plugin directory to extract metadata
     */
    private static processPluginDirectory;
}
