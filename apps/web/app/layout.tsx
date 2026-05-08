import "@workspace/ui/globals.css";

import { Inter as FontSans } from "next/font/google";
import localFont from "next/font/local";

import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { Button } from "@workspace/ui/components/button";
import { ModeToggle } from "@workspace/ui/combined/themes/darkmode-toggle";
import { ThemeConfigurator } from "@workspace/ui/combined/themes/theme-configurator";
import { Toaster } from "@workspace/ui/components/sonner";
import { NavbarItem, NavBar } from "@workspace/ui/combined/navbar";
import { cn } from "@workspace/ui/lib/utils";
import { ClientProviders } from "@/components/client-providers";

const fontSans = FontSans({
	subsets: ["latin"],
	variable: "--font-sans",
});

const fontHeading = localFont({
	src: "../assets/fonts/CalSans-SemiBold.woff2",
	variable: "--font-heading",
});

export const metadata: Metadata = {
	metadataBase: new URL(siteConfig.url),
	applicationName: siteConfig.name,
	title: {
		default: siteConfig.name,
		template: `%s | ${siteConfig.name}`,
	},
	description: siteConfig.description,
	keywords: siteConfig.keywords,
	appleWebApp: {
		capable: true,
		statusBarStyle: "default",
		title: siteConfig.name,
	},
	formatDetection: {
		telephone: false,
	},
	openGraph: {
		type: "website",
		url: siteConfig.url,
		title: siteConfig.name,
		description: siteConfig.description,
		siteName: siteConfig.name,
		images: siteConfig.ogImage,
		locale: "en_US",
	},
	twitter: {
		card: "summary",
		title: siteConfig.name,
		description: siteConfig.description,
	},
	icons: siteConfig.icon,
	manifest: siteConfig.manifest,
	robots: "index, follow",
};

export const viewport: Viewport = {
	themeColor: "#ffffff",
};

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
					fontHeading.variable,
				)}
			>
				<ClientProviders>
					<NavbarItem id="home" zone="left" priority={1}>
						<Link href="/" passHref>
							<Button variant="ghost">Home</Button>
						</Link>
					</NavbarItem>
					<NavbarItem id="plugins" zone="left" priority={1}>
						<Link href="/plugins" passHref>
							<Button variant="ghost">Plugins</Button>
						</Link>
					</NavbarItem>
					<NavbarItem id="docs" zone="left" priority={1}>
						<Link href="/docs" passHref>
							<Button variant="ghost">Docs</Button>
						</Link>
					</NavbarItem>
					<NavbarItem id="modetoggle" zone="right" priority={1}>
						<ModeToggle />
					</NavbarItem>
					<NavbarItem id="themeconfig" zone="right" priority={1}>
						<ThemeConfigurator />
					</NavbarItem>
					<NavBar />
					{children}
					<Toaster />
				</ClientProviders>
			</body>
		</html>
	);
}
