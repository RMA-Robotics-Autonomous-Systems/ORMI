"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { SunMedium, Moon } from "lucide-react"

export function ThemeSwitcher() {
  const { setTheme, theme } = useTheme()

  return (
    <Button
      variant="ghost"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="h-8 w-8 rounded-full"
    >
      <SunMedium className="h-10 w-10 dark:hidden" />
      <Moon className="h-10 w-10 hidden dark:block" />
    </Button>
  )
}
