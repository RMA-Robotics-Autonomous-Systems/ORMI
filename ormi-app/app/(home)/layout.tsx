/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client"
import Link from "next/link"

import { Button } from "ormi-components"
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
            setNavbarItem(
                "left",
                "dashboard",
                <Link href="/dashboard">
                    <Button variant="ghost">Dashboard</Button>
                </Link>,
                1
            )
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
            removeNavbarItem("left", "dashboard");
        }

    }, [status])

    return (
        <div className="flex flex-col">

            <div className="flex-1">{children}</div>
            {/* <SiteFooter className="container mx-auto px-2 mb-1 bg-background/95 backdrop-blur rounded-2xl border z-50" /> */}
        </div>
    )
}