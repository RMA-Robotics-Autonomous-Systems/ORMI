import { cn } from '@workspace/ui/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Separator } from '@workspace/ui/components/separator'
import { AlertCircle, Info, CheckCircle2, AlertTriangle } from 'lucide-react'
import { DocsLink } from './docs-link'
import { Mermaid } from './mermaid'

// Custom styled components for MDX
const components = {
    // Headings with better styling
    h1: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1
            className={cn(
                'scroll-m-20 text-4xl font-bold tracking-tight lg:text-5xl mt-8 mb-4 border-b pb-2',
                className
            )}
            {...props}
        />
    ),
    h2: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2
            className={cn(
                'scroll-m-20 text-3xl font-semibold tracking-tight mt-10 mb-4 border-b pb-2',
                className
            )}
            {...props}
        />
    ),
    h3: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h3
            className={cn(
                'scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4',
                className
            )}
            {...props}
        />
    ),
    h4: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h4
            className={cn(
                'scroll-m-20 text-xl font-semibold tracking-tight mt-6 mb-3',
                className
            )}
            {...props}
        />
    ),
    h5: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h5
            className={cn(
                'scroll-m-20 text-lg font-semibold tracking-tight mt-6 mb-3',
                className
            )}
            {...props}
        />
    ),
    h6: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h6
            className={cn(
                'scroll-m-20 text-base font-semibold tracking-tight mt-6 mb-3',
                className
            )}
            {...props}
        />
    ),

    // Links with hover effects
    a: ({ className, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <DocsLink href={href} className={className} {...props} />
    ),

    // Paragraphs
    p: ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p
            className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}
            {...props}
        />
    ),

    // Lists
    ul: ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul className={cn('my-6 ml-6 list-disc [&>li]:mt-2', className)} {...props} />
    ),
    ol: ({ className, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
        <ol className={cn('my-6 ml-6 list-decimal [&>li]:mt-2', className)} {...props} />
    ),
    li: ({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
        <li className={cn('mt-2', className)} {...props} />
    ),

    // Blockquotes
    blockquote: ({ className, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
        <blockquote
            className={cn(
                'mt-6 border-l-2 border-primary pl-6 italic text-muted-foreground [&>*]:text-muted-foreground',
                className
            )}
            {...props}
        />
    ),

    // Inline code
    code: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <code
            className={cn(
                'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
                className
            )}
            {...props}
        />
    ),

    // Code blocks - let CSS handle the styling, but check for mermaid
    pre: ({ className, children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
        // Check if this is a mermaid diagram
        const childElement = children as any
        const language = childElement?.props?.className?.replace('language-', '') || ''
        const code = childElement?.props?.children || ''

        const affectiveLanguage = language.toLowerCase().trim().replace('hljs ', '');
        if (affectiveLanguage.startsWith('mermaid') && typeof code === 'string') {
            // Parse size from language (e.g., "mermaid-large", "mermaid-small")
            let size: 'small' | 'medium' | 'large' = 'medium'
            if (affectiveLanguage.includes('-large')) {
                size = 'large'
            } else if (affectiveLanguage.includes('-small')) {
                size = 'small'
            }
            return <Mermaid chart={code.trim()} size={size} />
        }

        return (
            <pre
                className={className}
                {...props}
            >
                {children}
            </pre>
        )
    },

    // Tables
    table: ({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
        <div className="my-6 w-full overflow-y-auto">
            <table className={cn('w-full border-collapse', className)} {...props} />
        </div>
    ),
    thead: ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
        <thead className={cn('border-b', className)} {...props} />
    ),
    tbody: ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
        <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
    ),
    tr: ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
        <tr
            className={cn('border-b transition-colors hover:bg-muted/50', className)}
            {...props}
        />
    ),
    th: ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
        <th
            className={cn(
                'h-12 px-4 text-left align-middle font-bold [&:has([role=checkbox])]:pr-0',
                className
            )}
            {...props}
        />
    ),
    td: ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
        <td
            className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)}
            {...props}
        />
    ),

    // Horizontal rule
    hr: ({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) => (
        <Separator className={cn('my-8', className)} {...props} />
    ),

    // Custom callout components
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Alert,
    AlertTitle,
    AlertDescription,
    Badge,
    Button,

    // Custom callout boxes
    Callout: ({ type = 'info', title, children, ...props }: {
        type?: 'info' | 'warning' | 'success' | 'error'
        title?: string
        children: React.ReactNode
    }) => {
        const icons = {
            info: <Info className="h-4 w-4" />,
            warning: <AlertTriangle className="h-4 w-4" />,
            success: <CheckCircle2 className="h-4 w-4" />,
            error: <AlertCircle className="h-4 w-4" />,
        }

        const variants = {
            info: 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/20',
            warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20',
            success: 'border-green-500/50 bg-green-50 dark:bg-green-950/20',
            error: 'border-red-500/50 bg-red-50 dark:bg-red-950/20',
        }

        return (
            <Alert className={cn('my-6 border-l-4', variants[type])} {...props}>
                <div className="flex gap-2">
                    {icons[type]}
                    <div className="flex-1">
                        {title && <AlertTitle>{title}</AlertTitle>}
                        <AlertDescription className="[&>p]:mt-0">{children}</AlertDescription>
                    </div>
                </div>
            </Alert>
        )
    },
}

export default components
