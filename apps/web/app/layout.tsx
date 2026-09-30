import "@workspace/ui/globals.css";

import { Inter as FontSans } from "next/font/google";
import localFont from "next/font/local";

import type { Metadata, Viewport } from "next";

import { siteConfig } from "@/config/site";
import { env } from "@/config/env.js";
import { ModeToggle } from "@workspace/ui/combined/themes/darkmode-toggle";
import { ThemeConfigurator } from "@workspace/ui/combined/themes/theme-configurator";
import { Toaster } from "@workspace/ui/components/sonner";
import { NavbarItem, NavBar } from "@workspace/ui/combined/navbar";
import { cn } from "@workspace/ui/lib/utils";
import { ClientProviders } from "@/components/client-providers";
import { VersionBadge } from "@/components/version-badge";
import { NavLink } from "@/components/nav-link";
import { getThemePresets } from "@/server/theme-presets";

// Each font gets its own variable, set on `<html>` (the `:root` element).
// The theme tokens (`--font-body`, `--font-display`, `--font-code`,
// globals.css) read these, so a preset that sets a token on `:root` wins by
// cascade order. Naming them `--font-sans` on `<body>` shadowed every
// preset's font.
//
// Robots run in the field with no internet, so no face is ever fetched from a
// third party at runtime: next/font self-hosts every one under `/_next/`. The
// preset faces are committed files (latin subset, OFL, licences in
// `assets/fonts/licenses`) rather than `next/font/google`, which would fetch
// them at build time and make every image build depend on Google Fonts.
//
// Only Inter, the default body face, is preloaded. The rest are `@font-face`
// rules only: a browser downloads a face the first time text is set in it,
// so a font no preset names costs a few hundred bytes of CSS.
const fontSans = FontSans({
	subsets: ["latin"],
	variable: "--font-inter",
});

const fontHeading = localFont({
	src: "../assets/fonts/CalSans-SemiBold.woff2",
	variable: "--font-calsans",
	preload: false,
});

const fontMono = localFont({
	src: "../assets/fonts/JetBrainsMono-latin-wght.woff2",
	weight: "100 800",
	variable: "--font-jetbrains-mono",
	preload: false,
	// A monospace face must not fall back to Arial's metrics.
	adjustFontFallback: false,
	fallback: ["ui-monospace", "monospace"],
});

const fontGrotesk = localFont({
	src: "../assets/fonts/SpaceGrotesk-latin-wght.woff2",
	weight: "300 700",
	variable: "--font-space-grotesk",
	preload: false,
});

const fontTechno = localFont({
	src: [
		{ path: "../assets/fonts/ChakraPetch-latin-400.woff2", weight: "400" },
		{ path: "../assets/fonts/ChakraPetch-latin-500.woff2", weight: "500" },
		{ path: "../assets/fonts/ChakraPetch-latin-600.woff2", weight: "600" },
		{ path: "../assets/fonts/ChakraPetch-latin-700.woff2", weight: "700" },
	],
	variable: "--font-chakra-petch",
	preload: false,
});

const fontHumanist = localFont({
	src: "../assets/fonts/NunitoSans-latin-wght.woff2",
	weight: "200 1000",
	variable: "--font-nunito-sans",
	preload: false,
});

const fontGeometric = localFont({
	src: "../assets/fonts/Righteous-latin-400.woff2",
	weight: "400",
	variable: "--font-righteous",
	preload: false,
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
		<html
			lang="en"
			suppressHydrationWarning
			className={cn(
				fontSans.variable,
				fontHeading.variable,
				fontMono.variable,
				fontGrotesk.variable,
				fontTechno.variable,
				fontHumanist.variable,
				fontGeometric.variable,
			)}
		>
			<head />
			<body className="min-h-screen bg-background font-sans antialiased">
				<ClientProviders>
					<NavbarItem id="home" zone="left" priority={1}>
						<NavLink href="/">Home</NavLink>
					</NavbarItem>
					<NavbarItem id="plugins" zone="left" priority={1}>
						<NavLink href="/plugins">Plugins</NavLink>
					</NavbarItem>
					<NavbarItem id="docs" zone="left" priority={1}>
						<NavLink href="/docs" section="/docs/">
							Docs
						</NavLink>
					</NavbarItem>
					<NavbarItem id="modetoggle" zone="right" priority={1}>
						<ModeToggle />
					</NavbarItem>
					<NavbarItem id="themeconfig" zone="right" priority={1}>
						<ThemeConfigurator
							themes={themes}
							defaultThemeId="nortern"
						/>
					</NavbarItem>
					{/* Build stamp, last in the right zone so it sits at the
					    far edge of the bar. */}
					<NavbarItem id="version" zone="right" priority={100}>
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
