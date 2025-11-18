'use client'

import { SidebarTrigger } from '@workspace/ui/components/sidebar'
import { Separator } from '@workspace/ui/components/separator'

export function DocsHeader() {
    return (
        <header className="sticky top-0 z-[5] flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex-1">
                <h1 className="text-lg font-semibold">ORMI Documentation</h1>
            </div>
        </header>
    )
}
