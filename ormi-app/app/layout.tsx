import type { Metadata, Viewport } from "next";
// import localFont from "next/font/local";
import "@/styles/globals.css"

import { NavbarProvider, NavBar, ThemeProvider, NavbarItem, ModeToggle } from "ormi-core/components";


import { Inter as FontSans } from "next/font/google"
import localFont from "next/font/local"

import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/toaster"

import { siteConfig } from "@/config/site"
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthProvider } from "@/components/providers/session-provider";

import registry from "@/ormi-plugins";
import { PluginsProvider } from "ormi-core/plugins";


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


export const viewport: Viewport = {
    colorScheme: "dark light",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "white" },
        { media: "(prefers-color-scheme: dark)", color: "black" },
    ],
}

interface RootLayoutProps {
    children: React.ReactNode
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
    ]
]);

export default function RootLayout({ children }: RootLayoutProps) {
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
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
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
