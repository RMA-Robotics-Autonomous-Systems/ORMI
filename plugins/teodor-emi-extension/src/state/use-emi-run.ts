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
import { replayFrom, type ReplayResult } from "../detector/replay";
import {
	EmiSampleStream,
	planSampleDomain,
	sampleDomainKey,
	type SampleDomain,
} from "../detector/stream";
import type { EmiParams } from "../detector/params";
import type { EmiRun } from "../detector/run-types";

/** How often topic discovery re-runs, milliseconds. Matches std-widgets. */
const DISCOVERY_MS = 2000;

/**
 * Discovery and the shared derived state, pinned like the store beside them.
 *
 * Same reason, recorded in `AGENTS.md`: a package reached through two
 * specifiers (barrel vs subpath, `src` vs `dist`) is two modules, and two
 * discovery loops means two competing `setEmiSource` callers and two replay
 * caches — which defeats the single cache this file exists to provide.
 *
 * The streamed sample domain lives in this same record rather than in one of
 * its own, deliberately: the sample domain and the replay result computed from
 * it have to be invalidated together, and two independently pinned records over
 * one run is exactly the drift the pin rule exists to prevent.
 */
interface DiscoveryState {
	refs: number;
	timer: ReturnType<typeof setInterval> | null;
	manager: PluginsManager | null;
	/**
	 * The open sample-domain stream, or null.
	 *
	 * Single-entry, and that is a decision rather than a simplification: the
	 * derived arrays cost `16 B × n × ncoil + 8 B × n`, about 3.4 MB at twenty
	 * minutes and ~6.7 MB with the doubling slack, against the run's own
	 * ~8.6 MB. With up to seven runs resident (`LIBRARY_MAX` plus the live one)
	 * a per-run cache would add ~24 MB *and* need an eviction policy — and an
	 * eviction policy that evicts the live run mid-survey is the exact failure
	 * this streaming removes.
	 */
	stream: EmiSampleStream | null;
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
		s = {
			refs: 0,
			timer: null,
			manager: null,
			stream: null,
			replayCache: null,
		};
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

/**
 * Drop the shared derived state — both the replay result and the open sample
 * domain stream.
 *
 * The two are invalidated together by construction: the result is computed from
 * the stream, so keeping one without the other is a cache that answers about a
 * run nobody is looking at. Called from the store's reset seam and whenever the
 * displayed run leaves the screen, which is also what bounds the memory
 * ceiling to one stream rather than one per run ever shown.
 */
export function clearReplayCache(): void {
	const s = shared();
	s.replayCache = null;
	s.stream = null;
}

/**
 * The sample domain for a run prefix at these parameters, streamed.
 *
 * Extends the open stream when the invalidation contract in
 * `detector/stream.ts` holds, and sweeps from scratch when it does not. The
 * decision itself is the pure {@link planSampleDomain}; this function only owns
 * the single-entry slot it is kept in.
 *
 * **Referentially transparent in its result and monotone in its state**: for a
 * given (run object, prefix length, key) it returns the same numbers however
 * many times, in however many chunks, and from however many discarded renders
 * it is called. The only state it accumulates is a prefix of a pure function of
 * an immutable input. That is what makes it safe to call during render — see
 * {@link useEmiReplay}.
 *
 * @param run - The run being displayed.
 * @param n - The committed sample count, from the snapshot.
 * @param params - Parameters the domain is resolved at.
 * @returns Exact-length views over the resolved prefix.
 */
export function resolveSampleDomain(
	run: EmiRun,
	n: number,
	params: EmiParams,
): SampleDomain {
	const s = shared();
	const key = sampleDomainKey(run, params);
	const have = s.stream ? { key: s.stream.key, n: s.stream.n } : null;
	let stream = s.stream;
	if (!stream || planSampleDomain(have, { key, n }) === "rebuild") {
		// `Math.max(1024, n)` up front: a drained bag arrives as one chunk of
		// tens of thousands of samples, and doubling from 1024 to reach it
		// would copy the prefix five times over.
		stream = new EmiSampleStream(key, n);
		s.stream = stream;
	}
	return stream.extend(run, n);
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
		// The *committed* sample count, never `run.n`. `run.n` advances at wire
		// rate between commits, so replaying to it makes the result depend on
		// wall-clock time: two panels rendering at the same `rev`, or one panel
		// rendering twice, could disagree. Committed `n` puts the sample count
		// under the same 100 ms coalescing as everything else and costs at most
		// one commit of lag. Columns below it are final, and the motion
		// series' `min(n - 1, i + k)` clamp at this `n` is exactly what a full
		// sweep at this `n` produces.
		const n = snapshot.n;
		if (!run || n === 0) return null;
		const s = shared();
		const cached = s.replayCache;
		if (
			cached &&
			cached.rev === snapshot.rev &&
			cached.params === deferred
		) {
			return cached.result;
		}
		const sample = resolveSampleDomain(run, n, deferred);
		const computed = replayFrom(run, deferred, sample, snapshot.leverArm);
		// Writing shared state during render, which needs a reason now that a
		// streamed extend mutates retained buffers rather than allocating fresh
		// ones. The reason: `resolveSampleDomain` is referentially transparent
		// in its result and monotone in its state (see its doc), so a render
		// React throws away leaves the stream *advanced*, never *wrong*. The
		// alternative — one full sweep of the recording per mounted panel — is
		// what this exists to avoid.
		//
		// Two caveats worth knowing rather than discovering. (a) A discarded
		// render can double a rebuild: `useDeferredValue` renders twice per
		// parameter change by design, but the first of those renders extends
		// and only the second rebuilds, so the normal case is single;
		// StrictMode double-invokes in dev, where an extend is a no-op the
		// second time and a rebuild is not. The cost is a wasted sweep, never a
		// wrong answer. (b) `speed`/`turn` tear in their provisional tail —
		// bounded to `k` samples, about a quarter second, and only from
		// provisional to final. Benign because every consumer redraws on the
		// next `rev`, but it is a named invariant precisely so nobody memoises
		// off it.
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
