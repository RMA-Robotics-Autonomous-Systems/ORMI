"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	materialCells,
	materialRenderers,
} from "@jsonforms/material-renderers";
import { JsonForms } from "@jsonforms/react";
import type { JsonFormsRendererRegistryEntry } from "@jsonforms/core";
import {
	AlertCircleIcon,
	ArrowLeftIcon,
	CheckCircle2Icon,
	LayersIcon,
	Loader2Icon,
	PlugZapIcon,
	ServerIcon,
	TriangleAlertIcon,
} from "lucide-react";

import {
	mergeMapServerAuthSecrets,
	type MapLayerEntry,
	type MapLayerProviderDefinition,
	type MapServerPreset,
	type MapServerRecord,
	type MapServerSettings,
} from "@workspace/ormi-core/map-layers/model";
import { coreRenderer } from "@workspace/ormi-core/renderers";
import { shadcnCells, shadcnRenderer } from "@workspace/ormi-jsonforms";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";

import {
	mapServerApi,
	type MapServerCreateInput,
	type MapServerUpdateInput,
} from "@/lib/api/map-server-api";
import {
	testMapServerConnection,
	type ConnectionTestOutcome,
} from "@/lib/map-servers/connection-test";
import {
	ALREADY_REGISTERED_MESSAGE,
	blankSecrets,
	changesServerIdentity,
	copySettings,
	describeConnectionTest,
	describeCredentialInUrls,
	describeServerUrlProblem,
	isConflict,
	missingSecretFields,
	SERVER_IDENTITY_CHANGE_MESSAGE,
	settingsForSave,
} from "@/lib/map-servers/map-server-settings";

/** What the dialog is opened for. */
export type MapServerDialogTarget =
	| { kind: "add" }
	| {
			kind: "edit";
			record: MapServerRecord;
			provider: MapLayerProviderDefinition;
	  };

/** Props for {@link MapServerDialog}. */
export interface MapServerDialogProps {
	target: MapServerDialogTarget;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Registered adapters, for the add step. */
	providers: readonly MapLayerProviderDefinition[];
	/** Called after a save, with the catalogue outcome. */
	onSaved: () => Promise<void> | void;
}

/** The form being filled: one adapter, its settings and the record's title. */
interface Draft {
	provider: MapLayerProviderDefinition;
	settings: MapServerSettings;
	title: string;
	/** Used when the title is left blank. */
	defaultTitle: string;
}

/** A validation error as JSON Forms reports it. */
type FormErrors = { length: number } | null | undefined;

function draftFromTarget(target: MapServerDialogTarget): Draft | null {
	if (target.kind === "add") return null;
	return {
		provider: target.provider,
		settings: blankSecrets(target.record.settings),
		title: target.record.title,
		defaultTitle: target.provider.name,
	};
}

/**
 * The JSON Forms renderers the datasource configuration dialog uses, with
 * the `JSON_FORMS_RENDERER` hook applied.
 */
function useFormRenderers(): JsonFormsRendererRegistryEntry[] {
	const pluginsManager = usePluginsManager();
	return pluginsManager.applyFilter<JsonFormsRendererRegistryEntry[]>(
		PluginsHooks.JSON_FORMS_RENDERER,
		[...materialRenderers, ...shadcnRenderer, ...coreRenderer],
	);
}

const FORM_CELLS = [...materialCells, ...shadcnCells];

/**
 * Add or edit one map server. Mount it with a fresh `key` per open, so every
 * open starts from the stored record (or from the type list) and an
 * abandoned edit never survives.
 *
 * Save is the only commit and stays disabled while the form reports errors;
 * Cancel and the close button discard.
 *
 * @param props - Component props.
 * @returns The dialog.
 */
export function MapServerDialog({
	target,
	open,
	onOpenChange,
	providers,
	onSaved,
}: MapServerDialogProps) {
	const renderers = useFormRenderers();
	const [draft, setDraft] = useState<Draft | null>(() =>
		draftFromTarget(target),
	);
	const [errors, setErrors] = useState<FormErrors>(null);
	const [testing, setTesting] = useState(false);
	const [tested, setTested] = useState<{
		key: string;
		outcome: ConnectionTestOutcome;
	} | null>(null);
	const [saving, setSaving] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	// A test still running when the dialog goes away is cancelled.
	useEffect(() => () => abortRef.current?.abort(), []);

	const stored = target.kind === "edit" ? target.record : undefined;

	const close = () => {
		abortRef.current?.abort();
		onOpenChange(false);
	};

	const choose = (
		provider: MapLayerProviderDefinition,
		preset?: MapServerPreset,
	) => {
		setDraft({
			provider,
			settings: copySettings(preset?.settings ?? provider.data),
			title: preset?.title ?? provider.name,
			defaultTitle: preset?.title ?? provider.name,
		});
		setErrors(null);
		setTested(null);
	};

	// A URL that names another server keeps none of the stored secrets: they
	// were typed for the old server, and the API refuses to keep them.
	const identityChanged =
		stored !== undefined &&
		draft !== null &&
		changesServerIdentity(
			stored.adapterId,
			draft.settings.url,
			stored.serverKey,
		);
	const keptAuth = identityChanged ? undefined : stored?.settings.auth;

	/** Form settings with the stored secrets an edit left blank. */
	const withStoredSecrets = (settings: MapServerSettings) =>
		stored && !identityChanged
			? {
					...settings,
					auth: mergeMapServerAuthSecrets(
						settings.auth,
						stored.settings.auth,
					),
				}
			: settings;

	const settingsKey = draft ? JSON.stringify(draft.settings) : "";
	const urlProblem = draft
		? (describeServerUrlProblem(draft.settings.url) ??
			describeCredentialInUrls(draft.settings))
		: undefined;
	const missingFields = draft
		? [
				...(draft.settings.url?.trim() ? [] : ["URL"]),
				...missingSecretFields(draft.settings.auth, keptAuth),
			]
		: [];
	const hasFormErrors = (errors?.length ?? 0) > 0;
	const blocked =
		!draft ||
		hasFormErrors ||
		urlProblem !== undefined ||
		missingFields.length > 0;
	const currentTest = tested && tested.key === settingsKey ? tested : null;

	const runTest = async () => {
		if (!draft || blocked) return;
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		const key = settingsKey;
		setTesting(true);
		try {
			const outcome = await testMapServerConnection(
				draft.provider,
				withStoredSecrets(draft.settings),
				controller.signal,
			);
			if (!controller.signal.aborted) setTested({ key, outcome });
		} catch {
			// Aborted: the operator closed the dialog or started another test.
		} finally {
			if (abortRef.current === controller) setTesting(false);
		}
	};

	/** Discover with the saved record's own settings, then store the snapshot. */
	const storeCatalog = async (
		record: MapServerRecord,
		provider: MapLayerProviderDefinition,
		reuse: MapLayerEntry[] | undefined,
	) => {
		let layers = reuse;
		if (!layers) {
			const controller = new AbortController();
			abortRef.current = controller;
			const outcome = await testMapServerConnection(
				provider,
				record.settings,
				controller.signal,
			);
			if (outcome.result.status === "error") {
				const message = describeConnectionTest(outcome.result);
				toast.error(`Saved. Layers not listed: ${message.lines[0]}`);
				return;
			}
			layers = outcome.layers ?? [];
		}
		const put = await mapServerApi.putCatalog(record.id, layers);
		if (!put.ok) toast.error("Saved. The layer list could not be stored.");
	};

	const save = async () => {
		if (!draft || blocked || saving) return;
		setSaving(true);
		try {
			const title = draft.title.trim() || draft.defaultTitle;
			// Adapter settings are validated by AJV in the form; the API's own
			// envelope re-checks the shape.
			const settings = settingsForSave(draft.settings);
			const result = stored
				? await mapServerApi.update(stored.id, {
						title,
						settings: settings as NonNullable<
							MapServerUpdateInput["settings"]
						>,
					})
				: await mapServerApi.create({
						adapterId: draft.provider.id,
						title,
						settings: settings as MapServerCreateInput["settings"],
					});
			if (!result.ok) {
				toast.error(
					isConflict(result.details)
						? ALREADY_REGISTERED_MESSAGE
						: "Could not save the map server.",
				);
				return;
			}
			try {
				await storeCatalog(
					result.data,
					draft.provider,
					currentTest?.outcome.layers,
				);
			} catch {
				// Aborted by a close: the record is saved, the list waits for a refresh.
			}
			await onSaved();
			onOpenChange(false);
		} finally {
			setSaving(false);
		}
	};

	const presets = providers.flatMap((provider) =>
		(provider.presets ?? []).map((preset) => ({ provider, preset })),
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => (next ? onOpenChange(true) : close())}
		>
			<DialogContent size="large">
				<DialogHeader>
					<DialogTitle>
						{stored ? "Edit map server" : "Add map server"}
					</DialogTitle>
					<DialogDescription>
						{draft
							? draft.provider.name
							: "Choose a server type or a preset."}
					</DialogDescription>
				</DialogHeader>

				{!draft ? (
					<div className="flex flex-col gap-4">
						{providers.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No map server types are available in this build.
							</p>
						) : (
							<section className="flex flex-col gap-2">
								<h3 className="text-muted-foreground text-xs font-medium">
									Server type
								</h3>
								<div className="grid gap-2 sm:grid-cols-2">
									{providers.map((provider) => (
										<ChoiceButton
											key={provider.id}
											icon={<ServerIcon aria-hidden />}
											title={provider.name}
											onClick={() => choose(provider)}
										/>
									))}
								</div>
							</section>
						)}
						{presets.length > 0 ? (
							<section className="flex flex-col gap-2">
								<h3 className="text-muted-foreground text-xs font-medium">
									Presets
								</h3>
								<div className="grid gap-2 sm:grid-cols-2">
									{presets.map(({ provider, preset }) => (
										<ChoiceButton
											key={`${provider.id}:${preset.id}`}
											icon={<LayersIcon aria-hidden />}
											title={preset.title}
											subtitle={provider.name}
											onClick={() =>
												choose(provider, preset)
											}
										/>
									))}
								</div>
							</section>
						) : null}
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="map-server-title">Name</Label>
							<Input
								id="map-server-title"
								value={draft.title}
								placeholder={draft.defaultTitle}
								onChange={(event) =>
									setDraft({
										...draft,
										title: event.target.value,
									})
								}
							/>
						</div>
						<JsonForms
							schema={draft.provider.schema}
							uischema={draft.provider.uischema}
							data={draft.settings}
							renderers={renderers}
							cells={FORM_CELLS}
							onChange={({ data, errors: next }) => {
								setDraft((current) =>
									current
										? {
												...current,
												settings:
													data as MapServerSettings,
											}
										: current,
								);
								setErrors(next);
							}}
						/>
						{stored && !identityChanged ? (
							<p className="text-muted-foreground text-xs">
								Blank secret fields keep their stored value.
							</p>
						) : null}
						{identityChanged ? (
							<p
								role="status"
								className="border-warning/40 bg-warning/10 text-foreground flex items-start gap-2 rounded-md border p-3 text-sm"
							>
								<TriangleAlertIcon
									aria-hidden
									className="text-warning-text mt-0.5 size-4 shrink-0"
								/>
								{SERVER_IDENTITY_CHANGE_MESSAGE}
							</p>
						) : null}
						{urlProblem ? (
							<p className="text-destructive text-sm">
								{urlProblem}
							</p>
						) : null}
						{missingFields.length > 0 ? (
							<p className="text-muted-foreground text-sm">
								Required: {missingFields.join(", ")}.
							</p>
						) : null}
						<TestResult
							testing={testing}
							outcome={currentTest?.outcome}
						/>
					</div>
				)}

				<DialogFooter className="gap-2 sm:justify-between">
					<div>
						{draft && !stored ? (
							<Button
								variant="ghost"
								onClick={() => {
									abortRef.current?.abort();
									setDraft(null);
									setTested(null);
									setErrors(null);
								}}
							>
								<ArrowLeftIcon aria-hidden />
								Back
							</Button>
						) : null}
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={close}>
							Cancel
						</Button>
						{draft ? (
							<>
								<Button
									variant="outline"
									disabled={blocked || testing || saving}
									onClick={runTest}
								>
									{testing ? (
										<Loader2Icon
											aria-hidden
											className="motion-safe:animate-spin"
										/>
									) : (
										<PlugZapIcon aria-hidden />
									)}
									Test connection
								</Button>
								<Button
									disabled={blocked || saving}
									onClick={save}
								>
									{saving ? (
										<Loader2Icon
											aria-hidden
											className="motion-safe:animate-spin"
										/>
									) : null}
									Save
								</Button>
							</>
						) : null}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** One choice of the add step. */
function ChoiceButton({
	icon,
	title,
	subtitle,
	onClick,
}: {
	icon: React.ReactNode;
	title: string;
	subtitle?: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="border-border hover:bg-accent focus-visible:ring-ring/50 flex items-center gap-3 rounded-md border p-3 text-left transition-colors duration-(--motion-fast) outline-none focus-visible:ring-[3px]"
		>
			<span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-5">
				{icon}
			</span>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate text-sm font-medium">{title}</span>
				{subtitle ? (
					<span className="text-muted-foreground truncate text-xs">
						{subtitle}
					</span>
				) : null}
			</span>
		</button>
	);
}

/** The outcome of "Test connection", in words. */
function TestResult({
	testing,
	outcome,
}: {
	testing: boolean;
	outcome: ConnectionTestOutcome | undefined;
}) {
	if (testing) {
		return (
			<p className="text-muted-foreground flex items-center gap-2 text-sm">
				<Loader2Icon aria-hidden className="motion-safe:animate-spin" />
				Testing connection
			</p>
		);
	}
	if (!outcome) return null;
	const message = describeConnectionTest(outcome.result);
	const Icon =
		message.tone === "success"
			? CheckCircle2Icon
			: message.tone === "warning"
				? TriangleAlertIcon
				: AlertCircleIcon;
	return (
		<div
			role="status"
			className={cn(
				"flex items-start gap-2 rounded-md border p-3 text-sm",
				message.tone === "success" && "border-success/40 bg-success/10",
				message.tone === "warning" && "border-warning/40 bg-warning/10",
				message.tone === "error" &&
					"border-destructive/40 bg-destructive/10",
			)}
		>
			<Icon
				aria-hidden
				className={cn(
					"mt-0.5 size-4 shrink-0",
					message.tone === "success" && "text-success",
					message.tone === "warning" && "text-warning-text",
					message.tone === "error" && "text-destructive",
				)}
			/>
			<div className="flex flex-col gap-0.5 text-foreground">
				{message.lines.map((line) => (
					<span key={line}>{line}</span>
				))}
			</div>
		</div>
	);
}
