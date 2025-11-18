'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select'

interface DocsVersionSwitcherProps {
    currentVersion: string
    versions: string[]
}

export function DocsVersionSwitcher({ currentVersion, versions }: DocsVersionSwitcherProps) {
    const router = useRouter()
    const pathname = usePathname()

    const handleVersionChange = (newVersion: string) => {
        // Replace the version in the current path
        const newPath = pathname.replace(`/docs/${currentVersion}`, `/docs/${newVersion}`)
        router.push(newPath)
    }

    return (
        <Select value={currentVersion} onValueChange={handleVersionChange}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
                {versions.map((version) => (
                    <SelectItem key={version} value={version}>
                        {version}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
