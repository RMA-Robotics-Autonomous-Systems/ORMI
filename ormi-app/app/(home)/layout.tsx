import Link from "next/link"

import { homeNavConfig } from "@/config/home"
import { cn } from "@/lib/utils"
import { getCurrentUser } from "@/server/session"
import { buttonVariants } from "@/components/ui/button"
import { HomeNav } from "@/components/advanced/navbar/home-nav"
import { SiteFooter } from "@/components/advanced/navbar/site-footer"
import { ThemeSwitcher } from "@/components/advanced/theme/theme-switcher"
import { UserAccountNav } from "@/components/advanced/user/user-home-nav"

interface HomeLayoutProps {
  children: React.ReactNode
}

export default async function HomeLayout({
  children,
}: HomeLayoutProps) {
  const user = await getCurrentUser()

  return (
    <div className="flex flex-col">
      <header className="container mx-auto sticky top-1 bg-background/95 backdrop-blur rounded-2xl border z-50">
        <div className="px-2 flex h-20 items-center justify-between py-6">
          <HomeNav items={homeNavConfig.homeNav} />
          {user ? (
            <div className="flex items-center space-x-1">
            <UserAccountNav
              user={{
                name: user.name,
                email: user.email,
                image: user.image
                //role: user.role
              }}
            />
            <ThemeSwitcher/> 
            </div>
          ) : (
          <div className="flex items-center space-x-1">
            <Link
              href="/signin"
              className={cn(
                buttonVariants({ size: "lg", className:"bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground px-4" })
              )}
            >
              Sign In
            </Link>
            <ThemeSwitcher/> 
            </div> 
            )}
            
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <SiteFooter className="container mx-auto px-2 mb-1 bg-background/95 backdrop-blur rounded-2xl border z-50"/>
      {/* <footer className="mb-1 container mx-auto bg-background/95 backdrop-blur rounded-2xl border z-50"><SiteFooter/></footer> */}
    </div>
  )
}
