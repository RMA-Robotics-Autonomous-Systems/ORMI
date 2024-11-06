/*
    Class that implement the core of a plugin.
*/

abstract class PluginCore{

    private name: string;
    private description: string;
    private version: string;

    constructor(){
        this.name = "core";
        this.description = "Core plugin";
        this.version = "1.0.0";
    }

    abstract init(): void;

    getName(): string{
        return this.name;
    }

    getDescription(): string{
        return this.description;
    }

    getVersion(): string{
        return this.version;
    }
}

export default PluginCore;