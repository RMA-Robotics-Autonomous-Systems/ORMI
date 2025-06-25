"use client"

import { useState } from "react";
import { NavigationMenu, NavigationMenuList, NavigationMenuItem } from "../../ui/navigation-menu";
import { useNavbar } from "./navbar-provider";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Button } from "../../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../../ui/sheet";
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
                    <Sheet open={open} onOpenChange={setOpen}>
                        <SheetTrigger asChild>
                            <Button
                                className="p-2"
                                aria-label="Toggle menu"
                                variant={"ghost"}
                            >
                                <HamburgerMenuIcon className="h-4 w-4 mr-2" />
                                Menu
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[300px] sm:w-[350px] p-0">
                            <SheetHeader className="p-4 border-b">
                                <SheetTitle>Navigation</SheetTitle>
                            </SheetHeader>
                            <div className="flex flex-col space-y-4 p-4 overflow-y-auto h-full">
                                {sortedLeft.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="font-medium text-sm text-muted-foreground px-2">Main Navigation</h3>
                                        <div className="flex flex-col space-y-1">
                                            {sortedLeft.map(([key, value]) => (
                                                <div key={key} className="rounded-md hover:bg-muted p-2">
                                                    {value.component}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {sortedCenter.length > 0 && (
                                    <div className="space-y-3">
                                        {sortedLeft.length > 0 && <div className="h-px bg-border my-2" />}
                                        <h3 className="font-medium text-sm text-muted-foreground px-2">Features</h3>
                                        <div className="overflow-x-auto pb-2">
                                            <div className="grid grid-flow-col auto-cols-max gap-2 min-w-full">
                                                {sortedCenter.map(([key, value]) => (
                                                    <div key={key} className="rounded-md hover:bg-muted p-2 flex items-center">
                                                        {value.component}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {sortedRight.length > 0 && (
                                    <div className="space-y-3">
                                        {(sortedLeft.length > 0 || sortedCenter.length > 0) && <div className="h-px bg-border my-2" />}
                                        <h3 className="font-medium text-sm text-muted-foreground px-2">Account</h3>
                                        <div className="flex flex-col space-y-1">
                                            {sortedRight.map(([key, value]) => (
                                                <div key={key} className="rounded-md hover:bg-muted p-2">
                                                    {value.component}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden md:flex w-full justify-between">
                    <NavigationMenuList key="left">
                        {sortedLeft.map(([key, value]) => (
                            <NavigationMenuItem style={{ height: "40px" }} key={key}>{value.component}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>

                    <NavigationMenuList key="center">
                        {sortedCenter.map(([key, value]) => (
                            <NavigationMenuItem style={{ height: "40px" }} key={key}>{value.component}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>

                    <NavigationMenuList key="right">
                        {sortedRight.map(([key, value]) => (
                            <NavigationMenuItem style={{ height: "40px" }} key={key}>{value.component}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>
                </div>
            </NavigationMenu>
        </div >
    );
};