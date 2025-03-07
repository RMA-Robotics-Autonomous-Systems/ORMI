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
    left: new Map(),
    center: new Map(),
    right: new Map(),
    setNavbarItem: function () { },
    removeNavbarItem: function () { }
});
export var NavbarProvider = function (_a) {
    var children = _a.children;
    var _b = useState(new Map()), left = _b[0], setLeft = _b[1];
    var _c = useState(new Map()), center = _c[0], setCenter = _c[1];
    var _d = useState(new Map()), right = _d[0], setRight = _d[1];
    var setNavbarItem = function (zone, key, component, priority) {
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
        switch (zone) {
            case "left":
                setLeft(function (prev) {
                    var newMap = new Map(prev);
                    newMap.set(key, item);
                    return newMap;
                });
                break;
            case "center":
                setCenter(function (prev) {
                    var newMap = new Map(prev);
                    newMap.set(key, item);
                    return newMap;
                });
                break;
            case "right":
                setRight(function (prev) {
                    var newMap = new Map(prev);
                    newMap.set(key, item);
                    return newMap;
                });
                break;
        }
    };
    var removeNavbarItem = function (zone, key) {
        switch (zone) {
            case "left":
                setLeft(function (prev) {
                    var newMap = new Map(prev);
                    newMap.delete(key);
                    return newMap;
                });
                break;
            case "center":
                setCenter(function (prev) {
                    var newMap = new Map(prev);
                    newMap.delete(key);
                    return newMap;
                });
                break;
            case "right":
                setRight(function (prev) {
                    var newMap = new Map(prev);
                    newMap.delete(key);
                    return newMap;
                });
                break;
        }
    };
    return (_jsx(NavbarContext.Provider, { value: { left: left, center: center, right: right, setNavbarItem: setNavbarItem, removeNavbarItem: removeNavbarItem }, children: children }));
};
export var useNavbar = function () {
    var context = useContext(NavbarContext);
    if (!context) {
        throw new Error("useNavbar must be used within a NavbarProvider");
    }
    return context;
};
