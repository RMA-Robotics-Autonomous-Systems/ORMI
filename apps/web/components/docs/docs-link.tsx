'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@workspace/ui/lib/utils'

interface DocsLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href?: string
}

export function DocsLink({ href, className, children, ...props }: DocsLinkProps) {
    const pathname = usePathname()

    // Extract current version from pathname (e.g., /docs/v1/something -> v1)
    const versionMatch = pathname.match(/^\/docs\/([^\/]+)/)
    const currentVersion = versionMatch ? versionMatch[1] : 'v1'

    // Process the href
    let processedHref = href || '#'

    // If it's an internal docs link (starts with / but not /docs/)
    if (processedHref.startsWith('/') && !processedHref.startsWith('/docs/')) {
        // Add version prefix
        processedHref = `/docs/${currentVersion}${processedHref}`
    }
    // If it's a relative link (doesn't start with / or http)
    else if (!processedHref.startsWith('/') && !processedHref.startsWith('http') && processedHref !== '#') {
        // Treat as relative to current docs version
        processedHref = `/docs/${currentVersion}/${processedHref}`
    }

    // External links
    const isExternal = processedHref.startsWith('http')

    return (
        <Link
            href={processedHref}
            className={cn(
                'font-medium text-primary hover:text-primary/80 transition-colors',
                className
            )}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            {...props}
        >
            {children}
        </Link>
    )
}
