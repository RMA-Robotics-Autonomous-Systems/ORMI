"use client";
import { jsx as _jsx } from "react/jsx-runtime";
/*
    The goal of this component is to provide a context for the navbar, so that the navbar can be controlled from anywhere in the app.
    It allows components to register themselves as a navbar item, and to update the navbar title and actions.


    there is 3 zones in the navbar:
        - left zone
        - center zone
        - right zone

    The left zone is for the logo and the title,
    The center zone is for the main actions,
    The right zone is for the secondary actions.

    The component takes a title, a zone, and a react components as children.
*/
import { createContext, useContext, useState } from 'react';
var NavbarContext = createContext({
    items: new Map(),
    setButtonItem: function () { },
    removeButtonItem: function () { }
});
export var ButtonHolderProvider = function (_a) {
    var children = _a.children;
    var _b = useState(new Map()), items = _b[0], setItems = _b[1];
    var setButtonItem = function (key, component, priority) {
        /*
            This function is used to register a component in the navbar.
            It takes a zone, a key, and a component.
            The zone is the zone where the component will be displayed.
            The key is the unique identifier of the component.
            The component is the react component to display.

            if the key is already used, the component will be replaced.
            
            the priority is used to sort the components in the zone.
            lower priority means the component will be displayed first.
        */
        if (priority === void 0) { priority = 5; }
        var item = { component: component, priority: priority };
        setItems(function (prev) {
            var newMap = new Map(prev);
            newMap.set(key, item);
            return newMap;
        });
    };
    var removeButtonItem = function (key) {
        setItems(function (prev) {
            var newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });
    };
    return (_jsx(NavbarContext.Provider, { value: { items: items, setButtonItem: setButtonItem, removeButtonItem: removeButtonItem }, children: children }));
};
export var useButtonHolder = function () {
    var context = useContext(NavbarContext);
    if (!context) {
        throw new Error("useButtonHolder must be used within a ButtonHolderProvider");
    }
    return context;
};
