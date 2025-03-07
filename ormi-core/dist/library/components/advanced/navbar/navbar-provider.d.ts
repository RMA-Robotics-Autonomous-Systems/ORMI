import React, { JSX } from 'react';
export type NavbarZone = "left" | "center" | "right";
interface NavbarItem {
    component: JSX.Element;
    priority: number;
}
interface NavbarContextType {
    left: Map<string, NavbarItem>;
    center: Map<string, NavbarItem>;
    right: Map<string, NavbarItem>;
    setNavbarItem: (zone: NavbarZone, key: string, component: JSX.Element, priority?: number) => void;
    removeNavbarItem: (zone: NavbarZone, key: string) => void;
}
interface NavbarProviderProps {
    children: React.ReactNode;
}
export declare const NavbarProvider: React.FC<NavbarProviderProps>;
export declare const useNavbar: () => NavbarContextType;
export {};
