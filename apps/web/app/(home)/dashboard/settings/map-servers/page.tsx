"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { PlusIcon, ServerIcon } from "lucide-react";

import { appStore } from "@workspace/ormi-core";
import {
	mapServersAtom,
	useMapLayerProviders,
	useMapServersRegistry,
} from "@workspace/ormi-core/map-layers";
import type { MapServerRecord } from "@workspace/ormi-core/map-layers/model";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";

import { DashboardHeader } from "@/components/advanced/misc/dashboard-header";
import { DashboardShell } from "@/components/advanced/misc/dashboard-shell";
import {
	MapServerDialog,
	type MapServerDialogTarget,
} from "@/components/map-servers/map-server-dialog";
import { MapServerRow } from "@/components/map-servers/map-server-row";
import { mapServerApi } from "@/lib/api/map-server-api";
import { attemptAsync } from "@workspace/utils/attempt";
import { discoverMapServer } from "@/lib/map-servers/connection-test";
import { describeDiscoveryFailure } from "@/lib/map-servers/map-server-settings";
import { MAP_SERVER_LIMITS } from "@/lib/validations/map-server";

/** How often the catalogue ages on screen move on. */
const AGE_TICK_MS = 30_000;

/** The current time, advanced every {@link AGE_TICK_MS}. */
function useNow(): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/**
 * Settings > Map servers: the signed-in operator's map-server registry.
 * Reads the registry the `(home)` layout's provider loaded, and reloads it
 * after every change, so open maps and configuration dialogs update too.
 */
export default function MapServersSettingsPage() {
	const { data: session, status } = useSession();
	const router = useRouter();
	const registry = useMapServersRegistry();
	const state = useAtomValue(mapServersAtom, { store: appStore });
	const providers = useMapLayerProviders();
	const now = useNow();

	const [dialog, setDialog] = useState<{
		target: MapServerDialogTarget;
		open: boolean;
		/** Bumped per open, so each open mounts a fresh form. */
		session: number;
	}>({ target: { kind: "add" }, open: false, session: 0 });
	const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [failures, setFailures] = useState<ReadonlyMap<string, string[]>>(
		() => new Map(),
	);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => () => abortRef.current?.abort(), []);

	useEffect(() => {
		if (status === "loading") return;
		if (!session?.user) router.push("/signin");
	}, [session, status, router]);

	const openDialog = (target: MapServerDialogTarget) =>
		setDialog((current) => ({
			target,
			open: true,
			session: current.session + 1,
		}));

	const providerOf = (record: MapServerRecord) =>
		providers.find((provider) => provider.id === record.adapterId);

	const setFailure = (id: string, lines: string[] | undefined) =>
		setFailures((current) => {
			if (!lines && !current.has(id)) return current;
			const next = new Map(current);
			if (lines) next.set(id, lines);
			else next.delete(id);
			return next;
		});

	const setRefreshingFor = (id: string, on: boolean) =>
		setRefreshing((current) => {
			if (current.has(id) === on) return current;
			const next = new Set(current);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});

	const refreshServer = async (record: MapServerRecord) => {
		const provider = providerOf(record);
		if (!provider) return;
		if (abortRef.current == null) abortRef.current = new AbortController();
		const { signal } = abortRef.current;
		setRefreshingFor(record.id, true);
		await attemptAsync(
			async () => {
				const result = await discoverMapServer(
					provider,
					record.settings,
					signal,
				);
				if (result.status === "error") {
					// The stored snapshot stays; the row shows its age and why.
					setFailure(
						record.id,
						describeDiscoveryFailure(result.reason, result.detail),
					);
					return;
				}
				const put = await mapServerApi.putCatalog(
					record.id,
					result.layers,
				);
				if (!put.ok) {
					setFailure(record.id, [
						"The layer list could not be stored.",
					]);
					return;
				}
				setFailure(record.id, undefined);
				await registry.refresh();
			},
			() => {
				// Aborted: the page is going away.
			},
			() => setRefreshingFor(record.id, false),
		);
	};

	const removeServer = async (record: MapServerRecord) => {
		const result = await mapServerApi.remove(record.id);
		if (!result.ok) {
			toast.error(`Could not remove ${record.title}.`);
			return;
		}
		setFailure(record.id, undefined);
		await registry.refresh();
	};

	// The API refuses a create past the limit; the button says so first.
	const atLimit =
		state.status === "settled" &&
		state.servers.length >= MAP_SERVER_LIMITS.serversPerUser;

	const header = (
		<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
			<DashboardHeader
				heading="Map servers"
				text="Raster layers for every map"
			/>
			<div className="flex items-center gap-3">
				{atLimit ? (
					<span className="text-muted-foreground text-xs">
						Limit reached: {MAP_SERVER_LIMITS.serversPerUser} map
						servers.
					</span>
				) : null}
				<Button
					disabled={state.status !== "settled" || atLimit}
					onClick={() => openDialog({ kind: "add" })}
				>
					<PlusIcon aria-hidden />
					Add map server
				</Button>
			</div>
		</div>
	);

	if (status !== "authenticated") {
		return (
			<DashboardShell className="motion-page-in container mx-auto mt-8">
				{header}
			</DashboardShell>
		);
	}

	return (
		<DashboardShell className="motion-page-in container mx-auto mt-8 px-4 sm:px-0">
			{header}

			{state.status === "settled" ? (
				state.servers.length === 0 ? (
					<div className="text-muted-foreground flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center text-sm">
						<ServerIcon className="size-6" aria-hidden />
						<p>No map servers.</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{state.servers.map((record) => {
							const provider = providerOf(record);
							return (
								<MapServerRow
									key={record.id}
									record={record}
									provider={provider}
									now={now}
									refreshing={refreshing.has(record.id)}
									refreshFailure={failures.get(record.id)}
									onRefresh={() => void refreshServer(record)}
									onEdit={() => {
										if (provider)
											openDialog({
												kind: "edit",
												record,
												provider,
											});
									}}
									onRemove={() => void removeServer(record)}
								/>
							);
						})}
					</div>
				)
			) : state.status === "waiting" ? (
				<div className="flex flex-col gap-2">
					{Array.from({ length: 3 }).map((_, i) => (
						<Skeleton key={i} className="h-16 w-full" />
					))}
				</div>
			) : (
				<div className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
					<p className="text-foreground">
						Map servers could not be loaded.
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void registry.refresh()}
					>
						Retry
					</Button>
				</div>
			)}

			<MapServerDialog
				key={dialog.session}
				target={dialog.target}
				open={dialog.open}
				onOpenChange={(open) =>
					setDialog((current) => ({ ...current, open }))
				}
				providers={providers}
				onSaved={async () => {
					if (dialog.target.kind === "edit")
						setFailure(dialog.target.record.id, undefined);
					await registry.refresh();
				}}
			/>
		</DashboardShell>
	);
}
