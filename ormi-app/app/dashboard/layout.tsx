import type { Metadata } from "next";
// import localFont from "next/font/local";
import "@/styles/globals.css";


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

interface DashboardLayoutProps {
    children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {

    return (
        <div>
            {children}
        </div>
    );
}
