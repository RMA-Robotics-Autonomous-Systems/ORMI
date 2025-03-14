"use client"
import { Widget } from "../widgets/widget-interface";


export const handleLoad = (): Map<string, Widget> => {

    const templates = localStorage.getItem("ormi_templates");

    if (!templates) {
        return new Map<string, Widget>();
    }

    // templates is an object, convert it to Map
    return new Map(Object.entries(JSON.parse(templates)));

}

export const handleSave = (templates: Map<string, Widget>) => {

    // convert to object to save to local storage

    const obj = Object.fromEntries(templates);

    localStorage.setItem("ormi_templates", JSON.stringify(obj));

}