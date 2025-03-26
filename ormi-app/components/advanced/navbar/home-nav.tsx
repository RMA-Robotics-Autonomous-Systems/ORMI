"use client"

import * as React from "react"
import Link from "next/link"
import { useSelectedLayoutSegment } from "next/navigation"

import { HomeNavItem } from "@/types/index"
import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { MobileNav } from "@/components/advanced/navbar/mobile-nav"
import { useShowMobileMenu } from "@/hooks/use-show-mobile-menu"

import Image from "next/image"


interface HomeNavProps {
  items?: HomeNavItem[]
  children?: React.ReactNode
}

export function HomeNav({ items, children }: HomeNavProps) {
  const segment = useSelectedLayoutSegment()
  //const [showMobileMenu, setShowMobileMenu] = React.useState<boolean>(false)
  const [showMobileMenu, setShowMobileMenu] = useShowMobileMenu()

  return (
    <div className="flex gap-6 md:gap-10">
      <Link href="/" className="hidden items-center space-x-1 lg:flex">
         <Image
        src="/icon/ras-app-icon-light.svg"
        width={64}
        height={64}
        alt="RAS-APP Icon"
        className="block dark:hidden"
        />
        <Image
        src="/icon/ras-app-icon-dark.svg"
        width={64}
        height={64}
        alt="RAS-APP Icon"
        className="hidden dark:block"
        /> 
        <span className="font-bold sm:inline-block">
          {siteConfig.name}
        </span>
      </Link>
      {items?.length ? (
        <nav className="hidden gap-6 lg:flex">
          {items?.map((item, index) => (
            <Link
              key={index}
              href={item.disabled ? "#" : item.href}
              className={cn(
                "flex items-center text-lg font-medium transition-colors hover:text-foreground/80 sm:text-sm",
                item.href.startsWith(`/${segment}`)
                  ? "text-foreground"
                  : "text-foreground/60",
                item.disabled && "cursor-not-allowed opacity-80"
              )}
             // onClick={()=> setShowMobileMenu(false)} 
            >
              {item.title}
            </Link>
          ))}
        </nav>
      ) : null}
      <button
        className="flex items-center space-x-2 lg:hidden"
        onClick={() => setShowMobileMenu(!showMobileMenu)}
      >
        {showMobileMenu ? <X className="h-16 w-16"/> :
        <Image
        src="/icon/ras-app-icon-default.svg"
        width={64}
        height={64}
        alt="RAS-APP Icon"
        />
        }
        <span className="font-bold">Menu</span>
      </button>
      {showMobileMenu && items && (
        <MobileNav items={items}>{children}</MobileNav>
      )}
    </div>
  )
}
