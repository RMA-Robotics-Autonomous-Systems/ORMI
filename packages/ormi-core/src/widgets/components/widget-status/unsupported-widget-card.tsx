"use client";

import React from "react";
import { PuzzleIcon, Trash2Icon } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";

import type { SettingsMismatch } from "./unsupported-settings";

/**
 * Why a saved widget cannot be rendered from its stored configuration.
 *
 * - `missing-definition` — no plugin in this build provides the stored
 *   `widget_id`. Recoverable by enabling the plugin; otherwise remove.
 * - `unsatisfied-settings` — the widget type is present, but its schema has
 *   changed under a configuration that was valid when it was saved.
 * - `missing-instance` — the layout holds a slot for a widget that is no
 *   longer part of the workspace. Nothing remains to reconfigure or remove;
 *   only the layout slot can go.
 */
export type UnsupportedWidgetReason =
	"missing-definition" | "unsatisfied-settings" | "missing-instance";

/** Props for {@link UnsupportedWidgetCard}. */
export interface UnsupportedWidgetCardProps {
	/** Why the stored configuration cannot be rendered. */
	reason: UnsupportedWidgetReason;
	/** Saved title of the widget instance, when one is known. */
	title?: string;
	/** Stored widget definition id, named so the operator can act on it. */
	widgetTypeId?: string;
	/** Instance id of the layout slot, used by `missing-instance`. */
	boxId?: string;
	/** Named settings problems. Rendered for `unsatisfied-settings`. */
	mismatches?: readonly SettingsMismatch[];
	/**
	 * Removes this widget from the workspace. When omitted no Remove action is
	 * offered — the card never shows a control that would not do anything.
	 */
	onRemove?: () => void;
	/** Optional extra class names for the outer card. */
	className?: string;
}

/** Headline and guidance per reason, keeping the wording in one place. */
const GUIDANCE: Record<UnsupportedWidgetReason, string> = {
	"missing-definition":
		"Enable the plugin that provides this type, or remove the widget from this dashboard.",
	"unsatisfied-settings":
		"Open this widget's settings to reconfigure it, or remove it from this dashboard.",
	"missing-instance":
		"Remove this slot from the layout; there is nothing left to configure.",
};

/**
 * Tile body for a widget whose stored configuration this build cannot render.
 *
 * One component for all reasons on purpose. The state an operator has to
 * recognise is the same in every case — *this tile is deliberately not showing
 * data, your settings are safe, here is the way out* — and it deliberately
 * reuses the vocabulary of the unsupported-datasource card (dashed border,
 * muted `PuzzleIcon`, named id, "kept as saved", Remove) so the two read as one
 * state rather than two unrelated failures. Only the explanatory sentence and
 * the named detail differ per reason; splitting the component would duplicate
 * the shell and let the two drift apart.
 *
 * This is not error vocabulary: a stale configuration is an expected
 * consequence of a workspace outliving the build that created it, and the card
 * says so instead of blaming the operator or leaking a stack trace.
 *
 * @param props - Component props.
 * @returns React element.
 */
export function UnsupportedWidgetCard(props: UnsupportedWidgetCardProps) {
	const {
		reason,
		title,
		widgetTypeId,
		boxId,
		mismatches,
		onRemove,
		className,
	} = props;

	const name = title?.trim() || widgetTypeId || boxId || "This widget";

	return (
		<Card
			role="status"
			aria-live="polite"
			className={cn(
				"flex h-full w-full flex-row items-start gap-3 overflow-auto border-dashed p-4",
				className,
			)}
		>
			<PuzzleIcon
				className="text-muted-foreground mt-0.5 size-5 shrink-0"
				aria-hidden
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="text-sm font-medium">{name}</span>

				{reason === "missing-definition" && (
					<p className="text-muted-foreground text-xs">
						Unsupported configuration: no plugin in this build
						provides the widget type{" "}
						<code className="font-mono">
							{widgetTypeId ?? "unknown"}
						</code>
						. Its settings are kept as saved and it cannot be
						displayed.
					</p>
				)}

				{reason === "unsatisfied-settings" && (
					<p className="text-muted-foreground text-xs">
						Unsupported configuration: the saved settings no longer
						match what the widget type{" "}
						<code className="font-mono">
							{widgetTypeId ?? "unknown"}
						</code>{" "}
						expects. They are kept as saved and are not applied.
					</p>
				)}

				{reason === "missing-instance" && (
					<p className="text-muted-foreground text-xs">
						Unsupported configuration: the layout holds a slot for
						the widget{" "}
						<code className="font-mono">{boxId ?? "unknown"}</code>,
						which is no longer part of this workspace.
					</p>
				)}

				{reason === "unsatisfied-settings" &&
					mismatches &&
					mismatches.length > 0 && (
						<ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
							{mismatches.map((mismatch) => (
								<li
									key={`${mismatch.property}:${mismatch.reason}`}
								>
									<span className="font-medium">
										{mismatch.label || mismatch.property}
									</span>{" "}
									{mismatch.detail}.
								</li>
							))}
						</ul>
					)}

				<p className="text-muted-foreground text-xs">
					{GUIDANCE[reason]}
				</p>
			</div>

			{onRemove && (
				<Button
					variant="outline"
					size="sm"
					aria-label={`Remove unsupported widget ${name}`}
					onClick={onRemove}
				>
					<Trash2Icon aria-hidden />
					Remove
				</Button>
			)}
		</Card>
	);
}
