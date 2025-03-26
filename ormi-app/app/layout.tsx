import type { Metadata, Viewport} from "next";
// import localFont from "next/font/local";
import "@/styles/globals.css"
import { ThemeProvider } from "@/components/advanced/theme/theme-provider"

import { Inter as FontSans} from "next/font/google"
import localFont from "next/font/local"

import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/toaster"

import { siteConfig } from "@/config/site"


const fontSans = FontSans({
    subsets: ["latin"],
    variable: "--font-sans",
  })
  
const fontHeading = localFont({
    src: "../assets/fonts/CalSans-SemiBold.woff2",
    variable: "--font-heading",
  })


export const metadata : Metadata = {

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
              <main>
                  {children}
              </main>
          <Toaster />
          </ThemeProvider>
      </body>
      </html >
    )
  }
