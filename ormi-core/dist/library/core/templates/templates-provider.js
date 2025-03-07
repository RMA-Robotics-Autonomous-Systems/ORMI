"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from "react";
import { generateUniqueID } from "../utils/Utils";
import { useNavbar } from "../../../library/components/advanced/navbar/navbar-provider";
export var TemplatesProviderContext = createContext(undefined);
var TemplatesProvider = function (props) {
    var _a = useState(new Map()), templates = _a[0], setTemplates = _a[1];
    var _b = useNavbar(), setNavbarItem = _b.setNavbarItem, removeNavbarItem = _b.removeNavbarItem;
    var addTemplate = function (widget, key) {
        if (!key) {
            key = generateUniqueID();
        }
        // check if key already exists
        if (templates.has(key)) {
            throw new Error("Key already exists");
        }
        var newTemplates = new Map(templates.set(key, widget));
        setTemplates(newTemplates);
        props.onSave(newTemplates);
    };
    var removeTemplate = function (id) {
        if (!templates.has(id)) {
            throw new Error("Key does not exist");
        }
        var newTemplates = new Map(templates);
        newTemplates.delete(id);
        setTemplates(newTemplates);
        props.onSave(newTemplates);
    };
    useEffect(function () {
        var loadedTemplates = props.onLoad();
        setTemplates(loadedTemplates);
        return function () {
            // props.onSave(templates);
        };
    }, [props]);
    return (_jsx(TemplatesProviderContext.Provider, { value: { templates: templates, addTemplate: addTemplate, removeTemplate: removeTemplate }, children: props.children }));
};
var useTemplates = function () {
    var context = useContext(TemplatesProviderContext);
    if (context === undefined) {
        throw new Error("useTemplates must be used within a TemplatesProvider");
    }
    return context;
};
export { TemplatesProvider, useTemplates };
