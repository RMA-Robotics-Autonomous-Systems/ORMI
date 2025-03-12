/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { PluginRegistry } from "ormi-core/plugins";


const registry : PluginRegistry = {
    "ormi-standard-widgets": import("ormi-standart-widgets") as any,
    "ormi-ros-2": import("ormi-ros-2") as any,
    "ormi-random": import("ormi-random") as any,
    "ormi-fligth-indicator" : import("ormi-fligth-indicator") as any,
}

export default registry;