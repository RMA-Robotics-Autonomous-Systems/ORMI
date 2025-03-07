interface AddOptions {
    yes: boolean;
    branch: string;
}
export declare function add(pluginName: string, gitUrl: string, options: AddOptions): Promise<void>;
export {};
