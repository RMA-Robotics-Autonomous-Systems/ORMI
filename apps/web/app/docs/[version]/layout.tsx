import { ReactNode } from 'react'
import { buildNavigation, getVersions, getLatestVersion } from '@/lib/mdx'
import { DocsSidebar } from '@/components/docs/sidebar'
import { DocsVersionSwitcher } from '@/components/docs/version-switcher'

interface DocsLayoutProps {
    children: ReactNode
    params: Promise<{
        version: string
    }>
}

export default async function DocsLayout({ children, params }: DocsLayoutProps) {
    const { version } = await params
    const versions = getVersions()
    const navigation = await buildNavigation(version)

    return (
        <div className="flex min-h-screen">
            <aside className="w-64 border-r bg-slate-50 dark:bg-slate-900 p-4 sticky top-0 h-screen overflow-y-auto">
                <div className="mb-6">
                    <h2 className="text-lg font-semibold mb-2">Documentation</h2>
                    <DocsVersionSwitcher currentVersion={version} versions={versions} />
                </div>
                <DocsSidebar navigation={navigation} currentVersion={version} />
            </aside>
            <main className="flex-1 p-8">
                <div className="max-w-4xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    )
}
