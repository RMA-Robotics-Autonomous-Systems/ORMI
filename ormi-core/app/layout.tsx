import type { Metadata } from "next";
// import localFont from "next/font/local";
import "./globals.css";
import PluginsLoader from "@/core/plugins/plugins-loader";
import { PluginsProvider } from "@/core/plugins/components/plugins-provider";
import { NavbarProvider } from "@/components/advanced/navbar/navbar-provider";
import NavBar from "@/components/advanced/navbar/navbar";
import { Toaster } from "@/components/ui/toaster";

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
        <html lang="en">
            <body>
                <main>
                    <PluginsProvider pluginsLoader={pl.getClientSide()}>
                        <Toaster />
                        <NavbarProvider>
                            <NavBar />
                            {children}
                        </NavbarProvider>
                    </PluginsProvider>
                </main>
            </body>
        </html >
    );
}
