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
import { useDevlogs } from "@/hooks/use-devlogs";

export function DevlogDialog() {
	const { devlogs, markAsSeen } = useDevlogs();

	const open = devlogs.length > 0;

	return (
		<Dialog open={open}>
			<DialogContent size="medium" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>What&apos;s new</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-6">
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
					<Button onClick={markAsSeen}>Got it</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
