import fs from 'fs';
import path from 'path';

interface PackageJson {
  name: string;
  version: string;
  main?: string;
  description?: string;
  author?: string | { name: string; email?: string; url?: string };
  homepage?: string;
  ormiPlugin?: boolean; // Custom field to explicitly mark a package as an ORMI plugin
}

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

export class PluginDetector {
  private static readonly PLUGIN_PREFIX = 'ormi-plugin-';
  
  /**
   * Scans node_modules for ORMI plugins
   * @param rootDir The root directory of the project (where node_modules is located)
   * @returns An array of detected plugins with their metadata
   */
  public static detectPlugins(rootDir: string = process.cwd()): DetectedPlugin[] {
    const nodeModulesPath = path.join(rootDir, 'node_modules');
    const detectedPlugins: DetectedPlugin[] = [];
    
    if (!fs.existsSync(nodeModulesPath)) {
      console.warn(`Node modules path not found: ${nodeModulesPath}`);
      return [];
    }
    
    // Read all directories in node_modules
    const directories = fs.readdirSync(nodeModulesPath)
      .filter(item => {
        const itemPath = path.join(nodeModulesPath, item);
        return fs.statSync(itemPath).isDirectory() && 
          (item.startsWith(this.PLUGIN_PREFIX) || this.isOrmiFlaggedPlugin(itemPath));
      });
    
    // Process each potential plugin
    for (const dir of directories) {
      try {
        const pluginDir = path.join(nodeModulesPath, dir);
        const plugin = this.processPluginDirectory(pluginDir, dir);
        if (plugin) {
          detectedPlugins.push(plugin);
        }
      } catch (error) {
        console.error(`Error processing plugin directory ${dir}:`, error);
      }
    }
    
    return detectedPlugins;
  }
  
  /**
   * Checks if a package explicitly marks itself as an ORMI plugin via the package.json
   */
  private static isOrmiFlaggedPlugin(dirPath: string): boolean {
    const packageJsonPath = path.join(dirPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
      return !!packageJson.ormiPlugin;
    } catch {
      return false;
    }
  }
  
  /**
   * Process a plugin directory to extract metadata
   */
  private static processPluginDirectory(dirPath: string, packageName: string): DetectedPlugin | null {
    const packageJsonPath = path.join(dirPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      console.warn(`No package.json found for potential plugin: ${packageName}`);
      return null;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
      const pluginName = packageName.startsWith(this.PLUGIN_PREFIX) 
        ? packageName.substring(this.PLUGIN_PREFIX.length)
        : packageName;
      
      let author = '';
      let email = '';
      let url = '';
      
      if (typeof packageJson.author === 'string') {
        author = packageJson.author;
      } else if (packageJson.author) {
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
        author,
        email,
        url
      };
    } catch (error) {
      console.error(`Error parsing package.json for ${packageName}:`, error);
      return null;
    }
  }
}
