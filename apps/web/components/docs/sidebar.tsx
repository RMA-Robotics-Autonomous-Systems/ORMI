'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavigationItem } from '@/lib/mdx'

interface DocsSidebarProps {
    navigation: NavigationItem[]
    currentVersion: string
}

export function DocsSidebar({ navigation, currentVersion }: DocsSidebarProps) {
    const pathname = usePathname()

    const renderNavItem = (item: NavigationItem, level = 0) => {
        const isActive = pathname === item.href
        const hasChildren = item.children && item.children.length > 0

        return (
            <div key={item.href} className={`${level > 0 ? 'ml-4' : ''}`}>
                <Link
                    href={item.href}
                    className={`
            block py-2 px-3 rounded-md text-sm transition-colors
            ${isActive
                            ? 'bg-slate-200 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }
          `}
                >
                    {item.title}
                </Link>
                {hasChildren && (
                    <div className="mt-1">
                        {item.children!.map(child => renderNavItem(child, level + 1))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <nav className="space-y-1">
            {navigation.map(item => renderNavItem(item))}
        </nav>
    )
}
