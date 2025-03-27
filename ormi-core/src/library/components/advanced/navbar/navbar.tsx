"use client"

import Link from "next/link";
import { useState } from "react";
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink, navigationMenuTriggerStyle } from "../../ui/navigation-menu";
import { useNavbar } from "./navbar-provider";
import { Cross1Icon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ModeToggle } from "../theme/theme-toggle";
import React from "react";

export const NavBar = () => {
    const { left, center, right } = useNavbar();
    const [open, setOpen] = useState(false);

    // Helper function to sort nav items
    const sortNavItems = (items: Map<string, { component: React.ReactNode, priority: number }>) => {
        return Array.from(items).sort((a, b) => a[1].priority - b[1].priority);
    };

    const sortedLeft = sortNavItems(left);
    const sortedCenter = sortNavItems(center);
    const sortedRight = sortNavItems(right);

    return (
        <div className="relative">
            <NavigationMenu className="shadow-md w-full p-1">
                {/* Mobile Button */}
                <div className="md:hidden p-2">
                    <Popover onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                className="p-2"
                                aria-label="Toggle menu"
                                variant={"ghost"}
                            >
                                {open ? (
                                    <>
                                        <Cross1Icon className="h-4 w-4 mr-2" />
                                        Close
                                    </>
                                ) : (
                                    <>
                                        <HamburgerMenuIcon className="h-4 w-4 mr-2" />
                                        Menu
                                    </>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent style={{ width: "100dvw" }}>
                            <div className="flex flex-wrap gap-1" style={{ justifyContent: "space-evenly" }}>
                                <Link href="/" className={navigationMenuTriggerStyle()}>
                                    Home
                                </Link>
                                <Link href="/plugins" className={navigationMenuTriggerStyle()}>
                                    Plugins
                                </Link>
                                {sortedLeft.map(([key, value]) => (
                                    <div key={key}>{value.component}</div>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-1" style={{ justifyContent: "space-evenly" }}>
                                {sortedCenter.map(([key, value]) => (
                                    <div key={key}>{value.component}</div>
                                ))}
                            </div>
                            <div className="flex items-end flex-wrap gap-1" style={{ justifyContent: "space-evenly" }}>
                                {sortedRight.map(([key, value]) => (
                                    <div key={key}>{value.component}</div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden md:flex w-full justify-between">
                    <NavigationMenuList key="left">
                        {sortedLeft.map(([key, value]) => (
                            <NavigationMenuItem key={key}>{value.component}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>

                    <NavigationMenuList key="center">
                        {sortedCenter.map(([key, value]) => (
                            <NavigationMenuItem key={key}>{value.component}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>

                    <NavigationMenuList key="right">
                        {sortedRight.map(([key, value]) => (
                            <NavigationMenuItem key={key}>{value.component}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>
                </div>
            </NavigationMenu>
        </div >
    );
};