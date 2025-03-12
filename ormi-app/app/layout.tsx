import type { Metadata } from "next";
// import localFont from "next/font/local";
import "./globals.css";
import { PluginsProvider, } from "ormi-core/plugins";
import { NavbarProvider, NavBar, ThemeProvider } from "ormi-core/components";
import { Toaster } from "@/components/ui/toaster";

import registry from "@/ormi-plugins";

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

export const metadata: Metadata = {
    title: "Open Robotics Management Interface",
    description: "Web interface for managing multi robots systems",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {

    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem

                >
                    <main>
                        <PluginsProvider PluginsInfo={registry}>
                            <Toaster />
                            <NavbarProvider>
                                <>
                                    <NavBar />
                                    {children}
                                </>
                            </NavbarProvider>
                        </PluginsProvider>
                    </main>
                </ThemeProvider>
            </body>
        </html >
    );
}
