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

"use client";

import React, { createContext, useContext, useState } from 'react';


export type NavbarZone = "left" | "center" | "right";

// each zone iz an array of react components

interface NavbarContextType {
    left: Map<string, JSX.Element>;
    center: Map<string, JSX.Element>;
    right: Map<string, JSX.Element>;
    setNavbarItem: (zone: NavbarZone, key: string, component: JSX.Element) => void;
    removeNavbarItem: (zone: NavbarZone, key: string) => void;
}

const NavbarContext = createContext<NavbarContextType>({
    left: new Map(),
    center: new Map(),
    right: new Map(),
    setNavbarItem: () => { },
    removeNavbarItem: () => { }
});

interface NavbarProviderProps {
    children: React.ReactNode;
}

export const NavbarProvider: React.FC<NavbarProviderProps> = ({ children }) => {

    const [left, setLeft] = useState<Map<string, JSX.Element>>(new Map());
    const [center, setCenter] = useState<Map<string, JSX.Element>>(new Map());
    const [right, setRight] = useState<Map<string, JSX.Element>>(new Map());

    const setNavbarItem = (zone: NavbarZone, key: string, component: JSX.Element) => {
        /*
            This function is used to register a component in the navbar.
            It takes a zone, a key, and a component.
            The zone is the zone where the component will be displayed.
            The key is the unique identifier of the component.
            The component is the react component to display.

            if the key is already used, the component will be replaced.
        */

        switch (zone) {
            case "left":
                setLeft((prev) => {
                    const newMap = new Map(prev);
                    newMap.set(key, component);
                    return newMap;
                });
                break;
            case "center":
                setCenter((prev) => {
                    const newMap = new Map(prev);
                    newMap.set(key, component);
                    return newMap;
                });
                break;
            case "right":
                setRight((prev) => {
                    const newMap = new Map(prev);
                    newMap.set(key, component);
                    return newMap;
                });
                break;
        }
    }

    const removeNavbarItem = (zone: NavbarZone, key: string) => {

        switch (zone) {
            case "left":
                setLeft((prev) => {
                    const newMap = new Map(prev);
                    newMap.delete(key);
                    return newMap;
                });
                break;
            case "center":
                setCenter((prev) => {
                    const newMap = new Map(prev);
                    newMap.delete(key);
                    return newMap;
                });
                break;
            case "right":
                setRight((prev) => {
                    const newMap = new Map(prev);
                    newMap.delete(key);
                    return newMap;
                });
                break;
        }

    }


    return (
        <NavbarContext.Provider value={{ left, center, right, setNavbarItem, removeNavbarItem }}>
            {children}
        </NavbarContext.Provider>
    );
}

export const useNavbar = () => {
    const context = useContext(NavbarContext);
    if (!context) {
        throw new Error("useNavbar must be used within a NavbarProvider");
    }
    return context;
}
