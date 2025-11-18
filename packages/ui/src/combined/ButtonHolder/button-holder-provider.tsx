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

import React, { createContext, JSX, useCallback, useContext, useState } from 'react';


// each zone iz an array of react components
interface ButtonItem {
    component: JSX.Element;
    priority: number;
}

interface ButtonHolderContextType {
    items: Map<string, ButtonItem>;
    setButtonItem: (key: string, component: JSX.Element, priority?: number) => void;
    removeButtonItem: (key: string) => void;
}

const ButtonHolderContext = createContext<ButtonHolderContextType>({
    items: new Map(),
    setButtonItem: () => { },
    removeButtonItem: () => { }
});

interface ButtonHolderProviderProps {
    children: React.ReactNode;
}

export const ButtonHolderProvider: React.FC<ButtonHolderProviderProps> = ({ children }) => {

    const [items, setItems] = useState<Map<string, ButtonItem>>(new Map());

    const setButtonItem = useCallback((key: string, component: JSX.Element, priority = 5) => {
        setItems(prev => {
            const newMap = new Map(prev);
            newMap.set(key, { component, priority });
            return newMap;
        });
    }, []);

    const removeButtonItem = useCallback((key: string) => {
        setItems(prev => {
            const newMap = new Map(prev);
            newMap.delete(key);
            return newMap;
        });
    }, []);


    return (
        <ButtonHolderContext.Provider value={{ items, setButtonItem, removeButtonItem }}>
            {children}
        </ButtonHolderContext.Provider>
    );
}

export const useButtonHolder = () => {
    const context = useContext(ButtonHolderContext);
    if (!context) {
        throw new Error("useButtonHolder must be used within a ButtonHolderProvider");
    }
    return context;
}
