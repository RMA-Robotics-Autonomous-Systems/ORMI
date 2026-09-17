"use client";

import React from "react";
import {
	AlertTriangleIcon,
	ChevronDownIcon,
	RotateCcwIcon,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { cn } from "@workspace/ui/lib/utils";

/** Maximum number of characters of the technical detail rendered. */
const MAX_DETAIL_LENGTH = 500;

/** Props for {@link WidgetCrashCard}. */
export interface WidgetCrashCardProps {
	/** Saved title of the widget instance, when one is known. */
	title?: string;
	/** Stored widget definition id, named so the operator can act on it. */
	widgetTypeId?: string;
	/**
	 * Raw message of the caught error. Kept available but never the headline —
	 * it is a developer artefact, not an instruction to an operator.
	 */
	detail?: string;
	/** Clears the boundary so the widget renders again. */
	onRetry?: () => void;
	/** Optional extra class names for the outer card. */
	className?: string;
}

/**
 * Tile body for a widget that threw while rendering.
 *
 * Distinct from the unsupported-configuration card on purpose: this is not a
 * judgement about the stored settings but a failure of the widget itself, so it
 * keeps error vocabulary (warning icon, destructive accent) and a Retry. What
 * it does not do is lead with the raw JavaScript message — an operator can act
 * on "this panel stopped rendering, your settings are unchanged, try again",
 * and cannot act on a `TypeError`. The message stays one click away for whoever
 * is reading a bug report.
 *
 * @param props - Component props.
 * @returns React element.
 */
export function WidgetCrashCard(props: WidgetCrashCardProps) {
	const { title, widgetTypeId, detail, onRetry, className } = props;

	const name = title?.trim() || widgetTypeId || "This widget";

	const truncated =
		detail && detail.length > MAX_DETAIL_LENGTH
			? `${detail.slice(0, MAX_DETAIL_LENGTH)}…`
			: detail;

	return (
		<Card
			role="alert"
			aria-live="assertive"
			className={cn(
				"flex h-full w-full flex-row items-start gap-3 overflow-auto border-dashed p-4",
				className,
			)}
		>
			<AlertTriangleIcon
				className="text-destructive mt-0.5 size-5 shrink-0"
				aria-hidden
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="text-sm font-medium">
					{name} stopped rendering
				</span>
				<p className="text-muted-foreground text-xs">
					Its settings are unchanged. Retry to render it again; if it
					keeps failing, reconfigure the widget or remove it from this
					dashboard.
				</p>

				{truncated && (
					<Collapsible className="mt-1">
						<CollapsibleTrigger className="text-muted-foreground hover:text-foreground group flex items-center gap-1 text-xs underline-offset-2 hover:underline">
							<ChevronDownIcon
								className="size-3 transition-transform group-data-[state=open]:rotate-180"
								aria-hidden
							/>
							Technical details
						</CollapsibleTrigger>
						<CollapsibleContent>
							<pre className="text-muted-foreground/80 mt-1 max-w-full whitespace-pre-wrap break-words font-mono text-[0.7rem]">
								{truncated}
							</pre>
						</CollapsibleContent>
					</Collapsible>
				)}
			</div>

			{onRetry && (
				<Button
					variant="outline"
					size="sm"
					aria-label={`Retry rendering ${name}`}
					onClick={onRetry}
				>
					<RotateCcwIcon aria-hidden />
					Retry
				</Button>
			)}
		</Card>
	);
}
