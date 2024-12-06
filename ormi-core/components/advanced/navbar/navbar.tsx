"use client";
import Link from "next/link";
import { useState } from "react";
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink, navigationMenuTriggerStyle } from "../../ui/navigation-menu";
import { useNavbar } from "./navbar-provider";
import { Cross1Icon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const NavBar = () => {
    const { left, center, right } = useNavbar();
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <NavigationMenu className="shadow-md w-full">
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
                            <div className="flex flex-wrap gap-3">
                                <Link href="/" className={navigationMenuTriggerStyle()}>
                                    Home
                                </Link>
                                <Link href="/plugins" className={navigationMenuTriggerStyle()}>
                                    Plugins
                                </Link>
                                {Array.from(left).map(([key, value]) => (
                                    <div key={key}>{value}</div>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {Array.from(center).map(([key, value]) => (
                                    <div key={key}>{value}</div>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {Array.from(right).map(([key, value]) => (
                                    <div key={key}>{value}</div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>


                {/* Desktop Navigation */}
                <div className="hidden md:flex w-full justify-between">
                    <NavigationMenuList key="left">
                        <NavigationMenuItem>
                            <Link href="/" legacyBehavior passHref>
                                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                                    Home
                                </NavigationMenuLink>
                            </Link>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <Link href="/plugins" legacyBehavior passHref>
                                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                                    Plugins
                                </NavigationMenuLink>
                            </Link>
                        </NavigationMenuItem>
                        {Array.from(left).map(([key, value]) => (
                            <NavigationMenuItem key={key}>{value}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>

                    <NavigationMenuList key="center">
                        {Array.from(center).map(([key, value]) => (
                            <NavigationMenuItem key={key}>{value}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>

                    <NavigationMenuList key="right">
                        {Array.from(right).map(([key, value]) => (
                            <NavigationMenuItem key={key}>{value}</NavigationMenuItem>
                        ))}
                    </NavigationMenuList>
                </div>
            </NavigationMenu>
        </div >
    );
}

export default NavBar;

