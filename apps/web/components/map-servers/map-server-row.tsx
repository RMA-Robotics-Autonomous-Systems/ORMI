"use client";

import {
	AlertCircleIcon,
	Loader2Icon,
	PencilIcon,
	PuzzleIcon,
	RefreshCwIcon,
	ServerIcon,
	Trash2Icon,
} from "lucide-react";

import {
	formatCatalogueAge,
	type MapLayerProviderDefinition,
	type MapServerRecord,
} from "@workspace/ormi-core/map-layers/model";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";

import {
	formatLayerCount,
	resolveMapServerSummary,
} from "@/lib/map-servers/map-server-settings";

/** Props for {@link MapServerRow}. */
export interface MapServerRowProps {
	record: MapServerRecord;
	/** The adapter that owns the record, `undefined` when this build has none. */
	provider: MapLayerProviderDefinition | undefined;
	/** Current time in ms, for the catalogue age. */
	now: number;
	/** A refresh of this server is running. */
	refreshing: boolean;
	/** Why the last refresh failed, in words, if it did. */
	refreshFailure?: string[];
	onRefresh: () => void;
	onEdit: () => void;
	onRemove: () => void;
}

/** Remove, behind a confirmation that says what is lost. */
function RemoveButton({
	title,
	onRemove,
}: {
	title: string;
	onRemove: () => void;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					aria-label={`Remove map server ${title}`}
					className="text-muted-foreground hover:text-destructive"
				>
					<Trash2Icon aria-hidden />
					Remove
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove {title}?</AlertDialogTitle>
					<AlertDialogDescription>
						Maps using its layers show them as missing.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-white hover:bg-destructive/90"
						onClick={onRemove}
					>
						Remove
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * One stored map server: title, type, its declared summary (the URL), layer
 * count, catalogue age, and Refresh / Edit / Remove. A server whose adapter
 * this build lacks is named unsupported and can only be removed; its
 * settings are kept as saved.
 *
 * Only the adapter's `summaryProps` reach the screen: settings carry
 * credentials, and an allowlist is the only shape that cannot leak one.
 *
 * @param props - Component props.
 * @returns The row.
 */
export function MapServerRow(props: MapServerRowProps) {
	const { record, provider, now, refreshing, refreshFailure } = props;

	if (!provider) {
		return (
			<Card className="flex flex-row items-start gap-3 border-dashed p-4">
				<PuzzleIcon
					className="text-muted-foreground mt-0.5 size-5 shrink-0"
					aria-hidden
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="truncate text-sm font-medium">
						{record.title}
					</span>
					<p className="text-muted-foreground text-xs">
						Unsupported configuration: no plugin in this build
						provides the map server type{" "}
						<code className="font-mono">{record.adapterId}</code>.
						Its settings are kept as saved.
					</p>
				</div>
				<RemoveButton title={record.title} onRemove={props.onRemove} />
			</Card>
		);
	}

	const summary = resolveMapServerSummary(record.settings, provider).join(
		" · ",
	);

	return (
		<Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
					<ServerIcon className="size-5" aria-hidden />
				</span>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="flex min-w-0 items-baseline gap-2">
						<span
							className="truncate text-sm font-medium"
							title={record.title}
						>
							{record.title}
						</span>
						<span className="text-muted-foreground shrink-0 text-xs">
							{provider.name}
						</span>
					</span>
					{summary ? (
						<span
							className="text-muted-foreground truncate font-mono text-xs"
							title={summary}
						>
							{summary}
						</span>
					) : null}
					<span className="text-muted-foreground text-xs">
						{formatLayerCount(record.catalog)}
						<span aria-hidden> · </span>
						{formatCatalogueAge(
							record.catalogFetchedAt,
							new Date(now),
						)}
					</span>
					{refreshFailure && refreshFailure.length > 0 ? (
						<span className="text-foreground flex items-start gap-1.5 text-xs">
							<AlertCircleIcon
								className="text-destructive mt-px size-3.5 shrink-0"
								aria-hidden
							/>
							<span>
								Refresh failed: {refreshFailure.join(" ")}
							</span>
						</span>
					) : null}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
				<Button
					variant="ghost"
					size="sm"
					aria-label={`Refresh ${record.title}`}
					disabled={refreshing}
					onClick={props.onRefresh}
				>
					{refreshing ? (
						<Loader2Icon
							aria-hidden
							className="motion-safe:animate-spin"
						/>
					) : (
						<RefreshCwIcon aria-hidden />
					)}
					Refresh
				</Button>
				<Button
					variant="ghost"
					size="sm"
					aria-label={`Edit ${record.title}`}
					onClick={props.onEdit}
				>
					<PencilIcon aria-hidden />
					Edit
				</Button>
				<RemoveButton title={record.title} onRemove={props.onRemove} />
			</div>
		</Card>
	);
}
