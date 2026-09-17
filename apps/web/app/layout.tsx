import "@workspace/ui/globals.css";

import { Inter as FontSans } from "next/font/google";
import localFont from "next/font/local";

import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { env } from "@/config/env.js";
import { Button } from "@workspace/ui/components/button";
import { ModeToggle } from "@workspace/ui/combined/themes/darkmode-toggle";
import { ThemeConfigurator } from "@workspace/ui/combined/themes/theme-configurator";
import { Toaster } from "@workspace/ui/components/sonner";
import { NavbarItem, NavBar } from "@workspace/ui/combined/navbar";
import { cn } from "@workspace/ui/lib/utils";
import { ClientProviders } from "@/components/client-providers";
import { VersionBadge } from "@/components/version-badge";
import { getThemePresets } from "@/server/theme-presets";

const fontSans = FontSans({
	subsets: ["latin"],
	variable: "--font-sans",
});

const fontHeading = localFont({
	src: "../assets/fonts/CalSans-SemiBold.woff2",
	variable: "--font-heading",
});

export const metadata: Metadata = {
	metadataBase: env.APP_URL ? new URL(env.APP_URL) : undefined,
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
		url: env.APP_URL,
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

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const themes = await getThemePresets();

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
						<ThemeConfigurator
							themes={themes}
							defaultThemeId="amber"
						/>
					</NavbarItem>
					{/* Build stamp, last in the right zone so it sits at the
					    far edge of the bar. `flex items-center` on the item
					    itself because NavbarItem portals into a height:100%
					    wrapper that does not centre its content — a full-height
					    Button fills it, a one-line label would sit at the top. */}
					<NavbarItem
						id="version"
						zone="right"
						priority={100}
						className="flex items-center"
					>
						<VersionBadge />
					</NavbarItem>
					<NavBar />
					{children}
					{/* Bottom-centre, and it is the only corner left. Sonner
					    defaults to bottom-right, which is where the dashboard's
					    add button lives — so every "… added to …" toast landed
					    on top of the one control an operator adding several
					    topics in a row is about to click again. Moving the
					    button is not the fix: its corner is what clears the
					    grid engine's resize handle and the map attribution
					    strip.

					    Of the other five: both `top-*` cover the navbar, and
					    the centre zone there is the datasource status badges
					    and the Datasources button — the thing a routing toast
					    most often needs the operator to see next. `bottom-left`
					    is under FlexLayout's left border drawer, as
					    `bottom-right` is under its right one. Bottom-centre sits
					    over dashboard content only, clear of every piece of
					    chrome, and stays in the half of the screen the operator
					    is already looking at while they add things — which
					    matters because these toasts carry the Undo for a
					    mis-clicked topic and must be easy to reach, not merely
					    out of the way.

					    Below 600px sonner goes full-width and would sit on the
					    button again, so `mobileOffset` lifts it over the whole
					    button: 1.5rem inset + 3.5rem button + a 1rem gap. */}
					<Toaster
						position="bottom-center"
						mobileOffset={{ bottom: "6rem" }}
					/>
				</ClientProviders>
			</body>
		</html>
	);
}
