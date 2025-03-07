import React, { JSX } from 'react';
interface ButtonItem {
    component: JSX.Element;
    priority: number;
}
interface NavbarContextType {
    items: Map<string, ButtonItem>;
    setButtonItem: (key: string, component: JSX.Element, priority?: number) => void;
    removeButtonItem: (key: string) => void;
}
interface ButtonHolderProviderProps {
    children: React.ReactNode;
}
export declare const ButtonHolderProvider: React.FC<ButtonHolderProviderProps>;
export declare const useButtonHolder: () => NavbarContextType;
export {};
