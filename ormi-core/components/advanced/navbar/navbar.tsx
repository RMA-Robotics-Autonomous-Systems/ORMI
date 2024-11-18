"use client";
import Link from "next/link";
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuLink, navigationMenuTriggerStyle } from "../../ui/navigation-menu";

import { WidgetsCombo } from "@/core/widgets/components/widget-combo/widget-combo";
import { Button } from "../../ui/button";
import { LockClosedIcon, LockOpen1Icon } from "@radix-ui/react-icons";
import { useDashboardManager } from "@/core/dashboard/dashboard-provider";
import { useNavbar } from "./navbar-provider";


const NavBar = () => {

    const { left, center, right } = useNavbar();

    console.log(left, center, right);

    return (
        <NavigationMenu className="shadow-md">
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
                {Array.from(left).map(([key, value]: [string, JSX.Element]) => (
                    <NavigationMenuItem key={key}>
                        {value}
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>

            <NavigationMenuList key="center">
                {Array.from(center).map(([key, value]: [string, JSX.Element]) => (
                    <NavigationMenuItem key={key}>
                        {value}
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>
            <NavigationMenuList key="right">
                {Array.from(right).map(([key, value]: [string, JSX.Element]) => (
                    <NavigationMenuItem key={key}>
                        {value}
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>
        </NavigationMenu>
    );
}

export default NavBar;

