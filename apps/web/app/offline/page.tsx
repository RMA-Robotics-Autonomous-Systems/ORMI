"use client"

import { WifiOffIcon, RefreshCcwIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import Image from "next/image"

export default function OfflinePage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center px-4">
            <div className="relative">
                <Image
                    src="/icon/ormi.svg"
                    width={120}
                    height={120}
                    alt="ORMI Logo"
                    className="dark:invert opacity-50"
                />
                <div className="absolute -bottom-1 -right-1">
                    <WifiOffIcon className="h-6 w-6 text-muted-foreground bg-background rounded-full p-1 border-2" />
                </div>
            </div>

            <div className="space-y-2">
                <h1 className="text-2xl font-heading">You&apos;re Offline</h1>
                <p className="text-muted-foreground">
                    Please check your internet connection and try again.
                </p>
            </div>

            <Button onClick={() => window.location.reload()} className="flex items-center gap-2">
                <RefreshCcwIcon className="h-4 w-4" />
                Try Again
            </Button>
        </div>
    )
}
