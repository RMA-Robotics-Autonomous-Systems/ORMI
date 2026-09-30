"use client";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { useDevlogContext } from "@/components/devlogs/devlog-provider";

export function DevlogDialog() {
	const { devlogs, mode, close, markAsSeen } = useDevlogContext();

	const open = mode !== "hidden" && devlogs.length > 0;
	// Opened deliberately from the version badge: behave like a normal dialog.
	// Opened by itself because there is unread news: acknowledge to close, so
	// the entry is not silently marked read by an errant Escape.
	const dismissible = mode === "all";

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && dismissible) close();
			}}
		>
			{/* Header and footer stay pinned; only the entries scroll, so the
			    acknowledge button is always in view however long the log is. */}
			<DialogContent
				size="medium"
				showCloseButton={dismissible}
				className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
			>
				<DialogHeader>
					<DialogTitle>What&apos;s new</DialogTitle>
				</DialogHeader>

				<div className="-mx-6 flex min-h-0 flex-col gap-6 overflow-y-auto px-6">
					{devlogs.map((log, index) => (
						<div key={log.id}>
							<article
								className="max-w-none text-sm"
								dangerouslySetInnerHTML={{ __html: log.html }}
							/>
							{index < devlogs.length - 1 && (
								<Separator className="mt-6" />
							)}
						</div>
					))}
				</div>

				<DialogFooter>
					<Button onClick={dismissible ? close : markAsSeen}>
						{dismissible ? "Close" : "Got it"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
