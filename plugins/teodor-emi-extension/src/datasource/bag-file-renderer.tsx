"use client";

/**
 * A JSON Forms control for picking the `.db3` a replay datasource reads.
 *
 * The recording never leaves the browser and never enters the datasource's
 * persisted settings: this control writes only the **name** into the form, and
 * parks the bytes in the bag store for the provider to collect. That keeps a
 * multi-megabyte buffer out of the dashboard document, which is serialised on
 * every save.
 */

import React, { useCallback, useRef, useState } from "react";
import { withJsonFormsControlProps } from "@jsonforms/react";
import {
	and,
	isControl,
	optionIs,
	rankWith,
	type ControlProps,
} from "@jsonforms/core";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { AlertTriangleIcon, FolderOpenIcon, XIcon } from "lucide-react";
import { putBag, removeBag, useBags } from "./bag-store";
import {
	SQLITE_MAGIC_BYTES,
	checkBagSize,
	explainReadFailure,
	formatBytes,
	looksLikeSqlite,
} from "./bag-limits";

/** What the control is telling the operator about the last pick. */
interface PickNotice {
	tone: "error" | "warn";
	message: string;
	advice: string;
}

/**
 * The control itself.
 *
 * @param props - JSON Forms control props.
 * @returns React element.
 */
const BagFileControl = (props: ControlProps) => {
	const { data, handleChange, path, label } = props;
	const inputRef = useRef<HTMLInputElement | null>(null);
	const bags = useBags();
	const selectedKey = typeof data === "string" ? data : "";
	const selected = bags.find((b) => b.key === selectedKey);
	const [notice, setNotice] = useState<PickNotice | null>(null);
	const [reading, setReading] = useState(false);

	const onPick = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			// Reset immediately so re-picking the same file fires a change.
			event.target.value = "";
			if (!file) return;
			setNotice(null);

			// ── Refuse before reading ────────────────────────────────────
			// The size check costs nothing and is the one that matters: a
			// recording past the engine's ceiling fails several seconds later,
			// inside the worker, with nothing on screen to explain it.
			const size = checkBagSize(file.size);
			if (size.verdict === "refuse") {
				setNotice({
					tone: "error",
					message: size.message,
					advice: size.advice,
				});
				return;
			}

			setReading(true);
			try {
				// A sixteen-byte range read, before the whole file. It proves
				// the file is readable at all — which is where a stale picker
				// snapshot or a sandboxed browser fails — and it catches the
				// two easy mistakes (an `.mcap`, or the metadata `.yaml`) for
				// the price of one small read instead of a gigabyte.
				const head = new Uint8Array(
					await file.slice(0, SQLITE_MAGIC_BYTES).arrayBuffer(),
				);
				if (!looksLikeSqlite(head)) {
					setNotice({
						tone: "error",
						message: `"${file.name}" is not a SQLite database.`,
						advice: "A rosbag2 recording is the `.db3` inside the bag directory — not the `metadata.yaml` beside it, and not an `.mcap`.",
					});
					return;
				}

				const buffer = await file.arrayBuffer();
				// Keyed on name+size+lastModified, not the bare name:
				// `rosbag2_0.db3` is the ROS 2 default, so two surveys
				// routinely share one.
				const stored = putBag(file, buffer);
				handleChange(path, stored.key);
				// A recording that opened but is large enough to be slow: said
				// after the fact, because it is information, not a refusal.
				if (size.verdict === "warn") {
					setNotice({
						tone: "warn",
						message: size.message,
						advice: size.advice,
					});
				}
			} catch (err) {
				// The read is the failure this control exists to catch. It used
				// to be an unhandled rejection: the console got a
				// `NotReadableError`, the form kept its old value, and every
				// panel showed a bare "offline" card with no way to connect the
				// two.
				console.error(
					"[EMI replay] could not read the recording:",
					err,
				);
				setNotice({
					tone: "error",
					...explainReadFailure(err, file.name),
				});
			} finally {
				setReading(false);
			}
		},
		[handleChange, path],
	);

	return (
		<div className="flex flex-col gap-2">
			<Label>{label || "Recording"}</Label>

			{bags.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{bags.map((bag) => (
						<Badge
							key={bag.key}
							variant={
								bag.key === selectedKey ? "default" : "outline"
							}
							className="cursor-pointer gap-1"
							onClick={() => handleChange(path, bag.key)}
						>
							{bag.name}
							<span className="opacity-70">
								{formatBytes(bag.size)}
							</span>
							<XIcon
								className="h-3 w-3"
								onClick={(e) => {
									e.stopPropagation();
									removeBag(bag.key);
									if (bag.key === selectedKey)
										handleChange(path, "");
								}}
							/>
						</Badge>
					))}
				</div>
			)}

			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={reading}
					onClick={() => inputRef.current?.click()}
				>
					<FolderOpenIcon className="mr-1 h-4 w-4" />
					{reading ? "Reading…" : "Open .db3…"}
				</Button>
				{selectedKey && !selected && !reading && (
					<span className="text-destructive text-xs">
						The selected recording is not loaded in this session
					</span>
				)}
			</div>

			{/* Whatever went wrong with the last pick, where the operator did
			    it. Both halves matter: the message says what happened, the
			    advice says what to do — a refusal without a next step just
			    relocates the dead end. */}
			{notice && (
				<div
					className={
						notice.tone === "error"
							? "flex gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
							: "flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400"
					}
					role={notice.tone === "error" ? "alert" : "status"}
				>
					<AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
					<div className="flex flex-col gap-1">
						<span>{notice.message}</span>
						{notice.advice && (
							<span className="opacity-90">{notice.advice}</span>
						)}
					</div>
				</div>
			)}

			<input
				ref={inputRef}
				type="file"
				accept=".db3,.sqlite3,application/octet-stream"
				className="hidden"
				onChange={onPick}
			/>

			<p className="text-muted-foreground text-xs">
				Held in this page&apos;s memory only — nothing is uploaded, and
				the recording is not saved with the dashboard.
			</p>
		</div>
	);
};

/** The renderer, ready for the `JSON_FORMS_RENDERER` hook. */
export const BagFileRenderer = withJsonFormsControlProps(BagFileControl);

/**
 * Tester: claims any control marked `format: "emi-bag-file"`.
 *
 * Ranked above the default string control but not so high that it would
 * out-rank a more specific renderer a host application registers.
 */
export const bagFileTester = rankWith(
	20,
	and(isControl, optionIs("format", "emi-bag-file")),
);

/** The pair the renderer hook expects. */
export const bagFileRendererDefinition = {
	tester: bagFileTester,
	renderer: BagFileRenderer,
};
