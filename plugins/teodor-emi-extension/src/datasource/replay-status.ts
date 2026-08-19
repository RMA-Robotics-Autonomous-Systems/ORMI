"use client";

/**
 * Why a recording is not playing.
 *
 * Some failures cannot be caught where the operator acts. A file can be a
 * perfectly readable SQLite database and still not be a rosbag2, or be a
 * rosbag2 that holds no EMI topics at all — and both of those are only knowable
 * once the worker has opened it, seconds after the dialog was dismissed.
 *
 * Without somewhere to put that, the worker's only options are the console and
 * an empty topic list, and the operator sees ten panels reading "offline" with
 * nothing anywhere connecting them to the file they just picked. This is that
 * somewhere: the provider writes what the worker reports, and the panel frame
 * shows it in place of the generic offline card.
 *
 * Pinned on `globalThis` for the reason recorded in `AGENTS.md` — the provider
 * and the widgets can be reached through different module specifiers, and two
 * copies of this would mean the panels read a store nobody writes to.
 */

import { useSyncExternalStore } from "react";

/** What went wrong with a recording. */
export type ReplayProblemKind =
	/** The worker could not open the file at all. */
	| "unopenable"
	/** It opened, but is not a rosbag2 database. */
	| "not-a-bag"
	/** It is a rosbag2, but carries nothing this cockpit can read. */
	| "no-emi-topics";

/** One datasource's standing problem. */
export interface ReplayProblem {
	datasourceId: string;
	/** The datasource's display title, for the message. */
	title: string;
	kind: ReplayProblemKind;
	/** What happened, in one sentence. */
	message: string;
	/** What to do about it. May be empty. */
	advice: string;
}

interface StatusState {
	problems: Map<string, ReplayProblem>;
	listeners: Set<() => void>;
	/**
	 * The array handed to `useSyncExternalStore`.
	 *
	 * Rebuilt only when the set changes: `getSnapshot` must be
	 * identity-stable, and a fresh array per read is an infinite render loop.
	 */
	snapshot: ReplayProblem[];
}

const PIN = "__ormi_teodor_emi_replay_status__" as const;

/** The one status record. */
function store(): StatusState {
	const g = globalThis as unknown as Record<string, StatusState | undefined>;
	let s = g[PIN];
	if (!s) {
		s = { problems: new Map(), listeners: new Set(), snapshot: [] };
		g[PIN] = s;
	}
	return s;
}

/** Rebuild the cached array and notify. */
function commit(): void {
	const s = store();
	s.snapshot = [...s.problems.values()];
	for (const l of s.listeners) l();
}

/**
 * Record that a datasource's recording cannot be played.
 *
 * @param problem - What went wrong.
 */
export function setReplayProblem(problem: ReplayProblem): void {
	const s = store();
	const prev = s.problems.get(problem.datasourceId);
	// Identity matters: the provider re-reports on every worker restart, and a
	// new object each time would re-render every panel on a 2 s discovery poll.
	if (
		prev &&
		prev.kind === problem.kind &&
		prev.message === problem.message &&
		prev.title === problem.title
	) {
		return;
	}
	s.problems.set(problem.datasourceId, problem);
	commit();
}

/**
 * Forget a datasource's problem — it was disposed, or it started working.
 *
 * @param datasourceId - The datasource.
 */
export function clearReplayProblem(datasourceId: string): void {
	if (store().problems.delete(datasourceId)) commit();
}

/** Every standing problem. Identity-stable between changes. */
export function listReplayProblems(): ReplayProblem[] {
	return store().snapshot;
}

/** Subscribe to problem changes. */
export function subscribeReplayStatus(listener: () => void): () => void {
	const s = store();
	s.listeners.add(listener);
	return () => {
		s.listeners.delete(listener);
	};
}

/** Server snapshot: no worker has run there. */
const NONE: ReplayProblem[] = [];
const serverSnapshot = () => NONE;

/**
 * The standing problems, as React state.
 *
 * @returns Every recording that is currently refusing to play.
 */
export function useReplayProblems(): ReplayProblem[] {
	return useSyncExternalStore(
		subscribeReplayStatus,
		listReplayProblems,
		serverSnapshot,
	);
}

/** Test seam. */
export function __resetReplayStatusForTests(): void {
	const s = store();
	s.problems.clear();
	s.listeners.clear();
	s.snapshot = [];
}

// ---------------------------------------------------------------------------
// The worker → provider channel
//
// `DatasourceWorkerContext` has no way to report a failure: it can publish
// topics, remote calls and remote-call results, and nothing else. Core is
// immutable, so the worker posts its own message instead — the RPC client
// ignores any `type` it does not recognise (`rpc/response`, `rpc/event`), so a
// message of our own passes it by harmlessly and the provider, which owns the
// `Worker` object, picks it up.
// ---------------------------------------------------------------------------

/** Message type the worker posts and the provider listens for. */
export const REPLAY_PROBLEM_MESSAGE = "teodor-emi/replay-problem" as const;

/** The payload of that message. */
export interface ReplayProblemMessage {
	type: typeof REPLAY_PROBLEM_MESSAGE;
	kind: ReplayProblemKind;
	message: string;
	advice: string;
}

/**
 * Recognise the worker's problem report.
 *
 * @param data - Whatever arrived on the worker's message port.
 * @returns The payload, or null if this message is not ours.
 */
export function asReplayProblemMessage(
	data: unknown,
): ReplayProblemMessage | null {
	if (typeof data !== "object" || data === null) return null;
	const m = data as Partial<ReplayProblemMessage>;
	return m.type === REPLAY_PROBLEM_MESSAGE &&
		typeof m.message === "string" &&
		typeof m.kind === "string"
		? {
				type: REPLAY_PROBLEM_MESSAGE,
				kind: m.kind,
				message: m.message,
				advice: typeof m.advice === "string" ? m.advice : "",
			}
		: null;
}
