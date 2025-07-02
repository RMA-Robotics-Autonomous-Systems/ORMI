import "@workspace/ui/globals.css";

import { Inter as FontSans } from "next/font/google"
import localFont from "next/font/local"

import type { Metadata } from "next";
import Link from "next/link";

import { ThemeProvider } from "@/components/theme-provider";

import { siteConfig } from "@/config/site"
import { AuthProvider } from "@/components/session-provider";
import { Button } from "@workspace/ui/components/button";
import { ModeToggle } from "@workspace/ui/combined/themes/darkmode-toggle";
import { ThemeConfigurator } from "@workspace/ui/combined/themes/theme-configurator";
import { Toaster } from "@workspace/ui/components/sonner";
import { NavbarItem, NavbarProvider } from "@workspace/ui/combined/navbar/navbar-provider";
import { NavBar } from "@workspace/ui/combined/navbar/navbar";
import { cn } from "@workspace/ui/lib/utils";

import { PluginsProvider } from "@workspace/ormi-plugins";
import registry from "../ormi-plugins";

const fontSans = FontSans({
    subsets: ["latin"],
    variable: "--font-sans",
})

const fontHeading = localFont({
    src: "../assets/fonts/CalSans-SemiBold.woff2",
    variable: "--font-heading",
})

export const metadata: Metadata = {

    metadataBase: new URL(siteConfig.url),
    title: {
        default: siteConfig.name,
        template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.description,
    keywords: siteConfig.keywords,
    openGraph: {
        type: "website",
        url: siteConfig.url,
        title: siteConfig.name,
        description: siteConfig.description,
        siteName: siteConfig.name,
        images: siteConfig.ogImage,
        locale: "en_US"
    },
    icons: siteConfig.icon,
    manifest: siteConfig.manifest,
    robots: "index, follow",
}

const default_left: Map<string, NavbarItem> = new Map([
    [
        "home",
        {
            component: (
                <Link href="/" passHref>
                    <Button variant="ghost">Home</Button>
                </Link>
            ),
            priority: 1
        }
    ],
    [
        "plugins",
        {
            component: (
                <Link href="/plugins" passHref>
                    <Button variant="ghost">Plugins</Button>
                </Link>
            ),
            priority: 1
        }
    ]
]);

const default_right: Map<string, NavbarItem> = new Map([
    [
        "modetoggle",
        {
            component: (
                <ModeToggle />
            ),
            priority: 1
        }
    ],
    [

        "themeconfig",
        {
            component: (
                <ThemeConfigurator />
            ),
            priority: 1
        }
    ]
]);

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head />
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable,
                    fontHeading.variable
                )}
            >
                <ThemeProvider>
                    <AuthProvider>
                        <PluginsProvider PluginsInfo={registry}>
                            <NavbarProvider left={default_left} right={default_right}>
                                <>
                                    <NavBar />
                                    {children}
                                    <Toaster />
                                </>
                            </NavbarProvider>
                        </PluginsProvider>
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html >
    )
}

