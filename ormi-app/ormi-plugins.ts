"use client"

import { PluginRegistry } from "ormi-core/plugins";


const registry : PluginRegistry = {
    "ormi-standard-widgets": import("ormi-standart-widgets"),
}

export default registry;