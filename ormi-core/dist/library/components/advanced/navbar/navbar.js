"use client";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import Link from "next/link";
import { useState } from "react";
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink, navigationMenuTriggerStyle } from "../../ui/navigation-menu";
import { useNavbar } from "./navbar-provider";
import { Cross1Icon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ModeToggle } from "../theme/theme-toggle";
var NavBar = function () {
    var _a = useNavbar(), left = _a.left, center = _a.center, right = _a.right;
    var _b = useState(false), open = _b[0], setOpen = _b[1];
    // Helper function to sort nav items
    var sortNavItems = function (items) {
        return Array.from(items).sort(function (a, b) { return a[1].priority - b[1].priority; });
    };
    var sortedLeft = sortNavItems(left);
    var sortedCenter = sortNavItems(center);
    var sortedRight = sortNavItems(right);
    return (_jsx("div", { className: "relative", children: _jsxs(NavigationMenu, { className: "shadow-md w-full p-1", children: [_jsx("div", { className: "md:hidden p-2", children: _jsxs(Popover, { onOpenChange: setOpen, children: [_jsx(PopoverTrigger, { asChild: true, children: _jsx(Button, { className: "p-2", "aria-label": "Toggle menu", variant: "ghost", children: open ? (_jsxs(_Fragment, { children: [_jsx(Cross1Icon, { className: "h-4 w-4 mr-2" }), "Close"] })) : (_jsxs(_Fragment, { children: [_jsx(HamburgerMenuIcon, { className: "h-4 w-4 mr-2" }), "Menu"] })) }) }), _jsxs(PopoverContent, { style: { width: "100dvw" }, children: [_jsxs("div", { className: "flex flex-wrap gap-1", children: [_jsx(Link, { href: "/", className: navigationMenuTriggerStyle(), children: "Home" }), _jsx(Link, { href: "/plugins", className: navigationMenuTriggerStyle(), children: "Plugins" }), sortedLeft.map(function (_a) {
                                                var key = _a[0], value = _a[1];
                                                return (_jsx("div", { children: value.component }, key));
                                            })] }), _jsx("div", { className: "flex flex-wrap gap-1", children: sortedCenter.map(function (_a) {
                                            var key = _a[0], value = _a[1];
                                            return (_jsx("div", { children: value.component }, key));
                                        }) }), _jsxs("div", { className: "flex items-end flex-wrap gap-1", children: [sortedRight.map(function (_a) {
                                                var key = _a[0], value = _a[1];
                                                return (_jsx("div", { children: value.component }, key));
                                            }), _jsx("div", { children: _jsx(ModeToggle, {}) })] })] })] }) }), _jsxs("div", { className: "hidden md:flex w-full justify-between", children: [_jsxs(NavigationMenuList, { children: [_jsx(NavigationMenuItem, { children: _jsx(Link, { href: "/", legacyBehavior: true, passHref: true, children: _jsx(NavigationMenuLink, { className: navigationMenuTriggerStyle(), children: "Home" }) }) }), _jsx(NavigationMenuItem, { children: _jsx(Link, { href: "/plugins", legacyBehavior: true, passHref: true, children: _jsx(NavigationMenuLink, { className: navigationMenuTriggerStyle(), children: "Plugins" }) }) }), sortedLeft.map(function (_a) {
                                    var key = _a[0], value = _a[1];
                                    return (_jsx(NavigationMenuItem, { children: value.component }, key));
                                })] }, "left"), _jsx(NavigationMenuList, { children: sortedCenter.map(function (_a) {
                                var key = _a[0], value = _a[1];
                                return (_jsx(NavigationMenuItem, { children: value.component }, key));
                            }) }, "center"), _jsxs(NavigationMenuList, { children: [sortedRight.map(function (_a) {
                                    var key = _a[0], value = _a[1];
                                    return (_jsx(NavigationMenuItem, { children: value.component }, key));
                                }), _jsx(NavigationMenuItem, { children: _jsx(ModeToggle, {}) })] }, "right")] })] }) }));
};
export default NavBar;
