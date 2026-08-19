"use client";

/**
 * The hooks every EMI widget starts from.
 *
 * Two responsibilities, both refcounted at module scope so N widgets cost what
 * one widget costs: discovering which topics to read, and holding the
 * subscriptions open while at least one panel is mounted.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useDeferredValue } from "react";
import {
	PluginsHooks,
	usePluginsManager,
	type PluginsManager,
} from "@workspace/ormi-plugins";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";
import { appStore } from "@workspace/ormi-core";
import {
	acquireEmiIngest,
	getEmiServerSnapshot,
	getEmiSnapshot,
	setEmiSource,
	subscribeEmiStore,
	type EmiSnapshot,
} from "./emi-store";
import { pickDatasource, resolveEmiTopics } from "./emi-topics";
import { emiSourceIdAtom, useEmiParams } from "./atoms";
import { replay, type ReplayResult } from "../detector/replay";
import type { EmiParams } from "../detector/params";
import type { EmiRun } from "../detector/run-types";

/** How often topic discovery re-runs, milliseconds. Matches std-widgets. */
const DISCOVERY_MS = 2000;

/**
 * Discovery and the shared replay, pinned like the store beside them.
 *
 * Same reason, recorded in `AGENTS.md`: a package reached through two
 * specifiers (barrel vs subpath, `src` vs `dist`) is two modules, and two
 * discovery loops means two competing `setEmiSource` callers and two replay
 * caches — which defeats the single cache this file exists to provide.
 */
interface DiscoveryState {
	refs: number;
	timer: ReturnType<typeof setInterval> | null;
	manager: PluginsManager | null;
	replayCache: {
		rev: number;
		params: EmiParams;
		result: ReplayResult;
	} | null;
}

const PIN = "__ormi_teodor_emi_discovery__" as const;

/** The single discovery/cache record. */
function shared(): DiscoveryState {
	const g = globalThis as unknown as Record<
		string,
		DiscoveryState | undefined
	>;
	let s = g[PIN];
	if (!s) {
		s = { refs: 0, timer: null, manager: null, replayCache: null };
		g[PIN] = s;
	}
	return s;
}

/**
 * One discovery pass: read `AVAILABLE_TOPICS`, choose a source, wire it.
 *
 * Reads the manager off the shared record rather than closing over it, so the
 * interval can never be left calling a torn-down caller's copy — the failure
 * that stops discovery for every remaining panel while the timer keeps firing.
 */
async function refreshDiscovery(): Promise<void> {
	const s = shared();
	const manager = s.manager;
	if (!manager || s.refs === 0) return;
	const available = await manager.applyFilterAsync<DatasourceTopic[]>(
		PluginsHooks.AVAILABLE_TOPICS,
		[],
	);
	// Re-read: the poll is asynchronous and the last panel may have unmounted
	// while the filter chain was running.
	if (shared().refs === 0) return;
	const preferred = appStore.get(emiSourceIdAtom) ?? undefined;
	const chosen = pickDatasource(available, preferred);
	setEmiSource(manager, chosen ? resolveEmiTopics(available, chosen) : null);
}

/**
 * Start (or join) the shared discovery poll.
 *
 * @param manager - Plugins manager to query `AVAILABLE_TOPICS` on.
 * @returns A release function; the poll stops when the last caller releases.
 */
function acquireDiscovery(manager: PluginsManager): () => void {
	const s = shared();
	s.manager = manager;
	s.refs += 1;
	void refreshDiscovery();
	if (!s.timer) {
		s.timer = setInterval(() => void refreshDiscovery(), DISCOVERY_MS);
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		s.refs -= 1;
		if (s.refs <= 0) {
			s.refs = 0;
			if (s.timer) clearInterval(s.timer);
			s.timer = null;
		}
	};
}

/**
 * The current run, kept fresh.
 *
 * Mounting this hook is what wires the cockpit: it starts discovery and holds
 * the subscriptions. Every EMI widget calls it, directly or through
 * {@link useEmiReplay}.
 *
 * @returns The current snapshot; identity changes exactly when it changed.
 */
export function useEmiRun(): EmiSnapshot {
	const pluginsManager = usePluginsManager();

	useEffect(() => {
		const releaseIngest = acquireEmiIngest();
		const releaseDiscovery = acquireDiscovery(
			pluginsManager as PluginsManager,
		);
		return () => {
			releaseDiscovery();
			releaseIngest();
		};
	}, [pluginsManager]);

	return useSyncExternalStore(
		subscribeEmiStore,
		getEmiSnapshot,
		getEmiServerSnapshot,
	);
}

/** Drop the shared replay. Exposed for tests and for the store's reset seam. */
export function clearReplayCache(): void {
	shared().replayCache = null;
}

/** What a panel needs to draw. */
export interface EmiReplayView {
	/** The run being drawn, or null before the first sample. */
	run: EmiRun | null;
	/** Everything the parameters produce, or null when there is no run. */
	result: ReplayResult | null;
	/** The parameters the result was computed at — deferred, see below. */
	params: EmiParams;
	/** True while the displayed result is behind the rail. */
	stale: boolean;
	/** The underlying run snapshot, for status and diagnostics. */
	snapshot: EmiSnapshot;
}

/**
 * The replay at the current parameters.
 *
 * The parameters are read through `useDeferredValue`, which is the coalescing
 * the tuning loop needs: dragging a slider that invalidates the rolling medians
 * would otherwise recompute the whole baseline per pixel of travel. Deferring
 * lets React keep the rail responsive and run the sweep once the drag settles,
 * while the factor slider — which the cached baseline makes cheap — still
 * answers within a frame.
 *
 * @returns The run, the replay, and whether the replay is behind the rail.
 */
export function useEmiReplay(): EmiReplayView {
	const snapshot = useEmiRun();
	const params = useEmiParams();
	const deferred = useDeferredValue(params);

	const result = useMemo(() => {
		const run = snapshot.run;
		if (!run || run.n === 0) return null;
		const s = shared();
		const cached = s.replayCache;
		if (
			cached &&
			cached.rev === snapshot.rev &&
			cached.params === deferred
		) {
			return cached.result;
		}
		const computed = replay(run, deferred, snapshot.leverArm);
		// Writing a shared memo during render. That is safe here for the reason
		// the rule cares about: `replay` is pure and the entry is keyed on its
		// inputs, so a render that React discards leaves behind a result that is
		// still correct for those inputs. The alternative — one full sweep of
		// the recording per mounted panel — is what this exists to avoid.
		s.replayCache = {
			rev: snapshot.rev,
			params: deferred,
			result: computed,
		};
		return computed;
	}, [snapshot, deferred]);

	return {
		run: snapshot.run,
		result,
		params: deferred,
		stale: deferred !== params,
		snapshot,
	};
}
