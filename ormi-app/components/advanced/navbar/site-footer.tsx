import * as React from "react"

import { cn } from "@/lib/utils"
import Image from "next/image"

export function SiteFooter({ className }: React.HTMLAttributes<HTMLElement>) {
  return (
    <footer className={cn(className)}>
      <div className="flex flex-col items-center justify-between gap-4 py-10 md:h-20 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 md:flex-row md:gap-2 md:px-0">
        <Image
        src="/icon/ras-app-icon-light.svg"
        width={64}
        height={64}
        alt="RAS-APP Icon"
        className="dark:hidden"
        />
        <Image
        src="/icon/ras-app-icon-dark.svg"
        width={64}
        height={64}
        alt="RAS-APP Icon"
        className="hidden dark:block"
        />
          <p className="text-center text-sm leading-loose md:text-left">
          Copyright&#169; 2025 - Royal Military Academy Belgium - Mechanics Department - Robotics & Autonomous Systems Unit
          </p>
        </div>
      </div>
    </footer>
  )
}
 