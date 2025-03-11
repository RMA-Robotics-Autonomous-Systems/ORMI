import type { Metadata } from "next";
// import localFont from "next/font/local";
import "./globals.css";
import { PluginsLoader, PluginsProvider } from "ormi-core/plugins";
import { NavbarProvider, NavBar } from "ormi-core/components";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/advanced/theme/theme-provider";

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

    const pl = new PluginsLoader();

    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <main>
                        <PluginsProvider pluginsLoader={pl.getClientSide()}>
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
