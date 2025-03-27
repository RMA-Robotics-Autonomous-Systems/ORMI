"use client"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { UserAccountNav } from "@/components/advanced/user/user-home-nav"

import { User } from "next-auth"
import { useSession } from "next-auth/react"
import { useEffect } from "react"

import { useNavbar } from "ormi-core/components"

interface HomeLayoutProps {
    children: React.ReactNode
}

export default function HomeLayout({
    children,
}: HomeLayoutProps) {

    const { data: session, status } = useSession();
    const { setNavbarItem, removeNavbarItem } = useNavbar();

    useEffect(() => {

        if (status === "authenticated") {
            setNavbarItem(
                "right",
                "user_account",
                <UserAccountNav user={session?.user as User} />,
                -2
            );
        } else {
            setNavbarItem(
                "right",
                "user_account",
                <Link href="/signin">
                    <Button variant="ghost">Sign In</Button>
                </Link>,
                -2
            );
        }

        return () => {
            removeNavbarItem("right", "user_account");
        }

    }, [status])

    return (
        <div className="flex flex-col">

            <div className="flex-1">{children}</div>
            {/* <SiteFooter className="container mx-auto px-2 mb-1 bg-background/95 backdrop-blur rounded-2xl border z-50" /> */}
        </div>
    )
}

/*
<header className="container mx-auto sticky top-1 bg-background/95 backdrop-blur rounded-2xl border z-50">
    <div className="px-2 flex h-20 items-center justify-between py-6">
        <HomeNav items={homeNavConfig.homeNav} />
        {user ? (
        <div className="flex items-center space-x-1">
        
        <ThemeSwitcher/> 
        </div>
        ) : (
        <div className="flex items-center space-x-1">
        <Link
            href="/signin"
            className={cn(
            buttonVariants({ size: "lg", className:"bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground px-4" })
            )}
        >
            Sign In
        </Link>
        <ThemeSwitcher/> 
        </div> 
        )}
        
    </div>
</header>

*/