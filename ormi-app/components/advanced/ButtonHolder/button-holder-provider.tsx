


"use client"
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

import React, { createContext, useContext, useState } from 'react';


// each zone iz an array of react components
interface ButtonItem {
    component: JSX.Element;
    priority: number;
}

interface NavbarContextType {
    items: Map<string, ButtonItem>;
    setButtonItem: (key: string, component: JSX.Element, priority?: number) => void;
    removeButtonItem: (key: string) => void;
}

const NavbarContext = createContext<NavbarContextType>({
    items: new Map(),
    setButtonItem: () => { },
    removeButtonItem: () => { }
});

interface ButtonHolderProviderProps {
    children: React.ReactNode;
}

export const ButtonHolderProvider: React.FC<ButtonHolderProviderProps> = ({ children }) => {

    const [items, setItems] = useState<Map<string, ButtonItem>>(new Map());

    const setButtonItem = (key: string, component: JSX.Element, priority: number = 5) => {
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

        const item: ButtonItem = { component, priority };


        setItems((prev) => {
            const newMap = new Map(prev);
            newMap.set(key, item);
            return newMap;
        });


    }

    const removeButtonItem = (key: string) => {

        setItems((prev) => {
            const newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });


    }


    return (
        <NavbarContext.Provider value={{ items, setButtonItem, removeButtonItem }}>
            {children}
        </NavbarContext.Provider>
    );
}

export const useButtonHolder = () => {
    const context = useContext(NavbarContext);
    if (!context) {
        throw new Error("useButtonHolder must be used within a ButtonHolderProvider");
    }
    return context;
}
