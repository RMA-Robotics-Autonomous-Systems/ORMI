"use client"
import "@/styles/globals.css";
import { useSession } from "next-auth/react";
import { useNavbar } from "ormi-core/components";
import { useEffect } from "react";
import { UserAccountNav } from "@/components/advanced/user/user-home-nav";
import { User } from "next-auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";


// const geistSans = localFont({
//     src: "./fonts/GeistVF.woff",
//     variable: "--font-geist-sans",
//     weight: "100 900",
// });
// const geistMono = localFont({
//     src: "./fonts/GeistMonoVF.woff",
//     variable: "--font-geist-mono",
//     weight: "100 900",
// });


interface DashboardLayoutProps {
    children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {

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
        </div>
    )
}
