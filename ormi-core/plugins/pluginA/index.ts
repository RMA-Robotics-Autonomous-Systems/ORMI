import PluginCore from "@/core/plugins/plugin-core";


class PluginA extends PluginCore{

    constructor(){
        super();
    }

    init(): void{
        console.log("PluginA init");
    }

}



export default PluginA;