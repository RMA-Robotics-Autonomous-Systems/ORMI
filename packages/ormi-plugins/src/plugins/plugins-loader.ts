"use server";

/*
    Class that loads all plugins using the plugin registry system,
    and stores them in a Map object.
*/
import fs from 'fs';
import path from 'path';
import { PluginInfo } from './plugins-types';

/**
 * Server action to load plugins from the file system
 */
export async function loadPlugins(): Promise<Map<string, PluginInfo>> {
    
    const plugins = new Map<string, PluginInfo>();

    // Find node_modules paths in monorepo environment
    const nodeModulesPaths = findNodeModules();

    if (nodeModulesPaths.length === 0) {
        console.warn('No node_modules directories found');
        return plugins;
    }

    // Check each node_modules directory for plugins
    for (const nodeModulesPath of nodeModulesPaths) {
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

                        plugins.set(packageJson.name, pluginInfo);
                    }
                } catch (err) {
                    console.error(`Error reading package.json from ${dir}:`, err);
                }
            }
        }
    }
    
    return plugins;
}

/**
 * Find all node_modules directories by searching up the directory tree
 * This handles monorepo environments where node_modules might be hoisted
 * Returns an array of valid node_modules paths
 */
function findNodeModules(): string[] {
    const MAX_SEARCH_LEVELS = 10;
    const nodeModulesPaths: string[] = [];
    let currentDir = process.cwd();
    
    // Search up to MAX_SEARCH_LEVELS to avoid infinite loops
    for (let i = 0; i < MAX_SEARCH_LEVELS; i++) {
        // Check if package.json exists in current directory
        const packageJsonPath = path.join(currentDir, 'package.json');
        

        if (fs.existsSync(packageJsonPath)) {
            const nodeModulesPath = path.join(currentDir, 'node_modules');
            
            if (fs.existsSync(nodeModulesPath) && fs.statSync(nodeModulesPath).isDirectory()) {
                nodeModulesPaths.push(nodeModulesPath);
            }

            // if the package.json has a "workspaces" field, we can assume it's a monorepo, so we need to add the node_modules/@workspaces
            // if this is a monorepo, we can also check for the node_modules/@workspaces directory
            // and we can also stop searching further up the directory tree
            if (packageJsonPath) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                
                if (packageJson.workspaces) {
                    // If workspaces are defined, we can assume this is a monorepo
                    const workspaceNodeModulesPath = path.join(currentDir, 'node_modules', '@workspace');

                    
                    if (fs.existsSync(workspaceNodeModulesPath) && fs.statSync(workspaceNodeModulesPath).isDirectory() && !nodeModulesPaths.includes(workspaceNodeModulesPath)) {
                        nodeModulesPaths.push(workspaceNodeModulesPath);
                    }
                    break; // Stop searching further up the directory tree
                }
            }
        }
        
        const parentDir = path.dirname(currentDir);
        
        // If we've reached the root, stop searching
        if (parentDir === currentDir) {
            break;
        }
        
        currentDir = parentDir;
    }
    
    // Fallback: try the traditional approach
    const fallbackPath = path.resolve(process.cwd(), 'node_modules');
    if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isDirectory() && !nodeModulesPaths.includes(fallbackPath)) {
        nodeModulesPaths.push(fallbackPath);
    }
    
    return nodeModulesPaths;
}