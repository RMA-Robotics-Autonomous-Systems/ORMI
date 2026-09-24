"use client";

/**
 * A mission's contacts, as the fog stores them — shared by the mission map
 * (which draws them and opens one on click), the asset tree (which lists them)
 * and anything else that shows a contact.
 *
 * Three things ride on it:
 * - the CONTACTS of each mission, replaced whole by every read of
 *   `c2.missions.contacts` (the fog's record is the truth: a resubmit clears
 *   it, and so does this);
 * - the SELECTION: the contact the operator is reading, one at a time across
 *   missions, like the asset selection;
 * - a FOCUS request (with `seq`): "show me this one" — the map flies to it.
 *
 * And the POLL: one timer per mission however many widgets want it, so the
 * map and the tree open side by side read the route once per interval, not
 * twice. The last widget to let go stops it.
 *
 * Same module-level `useSyncExternalStore` contract as the other plugin
 * stores: every snapshot is rebuilt once, in the mutation that changed it.
 */

import { useCallback, useSyncExternalStore } from "react";

import type { MissionContact } from "../widgets/mission-contacts";

/** What a mission's contacts read as. */
export interface MissionContactsState {
	contacts: MissionContact[];
	/** The last read failed (the last good list is kept). */
	error: string | null;
	/** At least one read answered. */
	loaded: boolean;
}

/** A contact of a mission. */
export interface ContactRef {
	missionId: string;
	uid: string;
}

/** A request to show a contact. */
export interface ContactFocusRequest extends ContactRef {
	seq: number;
}

/** How often a watched mission's contacts are read. */
export const CONTACTS_POLL_MS = 3000;

const EMPTY: MissionContactsState = {
	contacts: [],
	error: null,
	loaded: false,
};

let byMission: Record<string, MissionContactsState> = {};
/** Content signature per mission: an identical read changes nothing. */
let signatures: Record<string, string> = {};
let selected: ContactRef | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const focusListeners = new Set<(request: ContactFocusRequest) => void>();

function emit(): void {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Put a read of a mission's contacts in the store. A no-op (no notify) when
 * it says what the store already holds.
 *
 * @param missionId - The mission.
 * @param contacts - Everything the fog holds for it.
 */
export function setMissionContacts(
	missionId: string,
	contacts: MissionContact[],
): void {
	const signature = JSON.stringify(contacts);
	const prev = byMission[missionId];
	if (prev?.loaded && !prev.error && signatures[missionId] === signature) {
		return;
	}
	signatures = { ...signatures, [missionId]: signature };
	byMission = {
		...byMission,
		[missionId]: { contacts, error: null, loaded: true },
	};
	emit();
}

/**
 * Record a failed read; the contacts already held stay on screen.
 *
 * @param missionId - The mission.
 * @param error - What went wrong.
 */
export function setMissionContactsError(
	missionId: string,
	error: string,
): void {
	const prev = byMission[missionId] ?? EMPTY;
	if (prev.error === error) return;
	byMission = { ...byMission, [missionId]: { ...prev, error } };
	emit();
}

/** A mission's contacts, outside React. */
export function getMissionContacts(
	missionId: string | null | undefined,
): MissionContactsState {
	return (missionId && byMission[missionId]) || EMPTY;
}

/**
 * React hook: a mission's contacts (an empty, not-loaded state when none).
 * @param missionId - The mission.
 */
export function useMissionContacts(
	missionId: string | null | undefined,
): MissionContactsState {
	const get = useCallback(() => getMissionContacts(missionId), [missionId]);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * Select a contact (or none), without asking anyone to move to it.
 * @param ref - The contact, or null.
 */
export function selectContact(ref: ContactRef | null): void {
	if (selected?.missionId === ref?.missionId && selected?.uid === ref?.uid) {
		return;
	}
	selected = ref ? { ...ref } : null;
	emit();
}

/**
 * Select a contact AND ask every widget that shows it to bring it into view.
 * @param ref - The contact.
 */
export function focusContact(ref: ContactRef): void {
	seq += 1;
	const request = { ...ref, seq };
	selected = { ...ref };
	emit();
	for (const listener of focusListeners) listener(request);
}

/** The selected contact, outside React. */
export function getSelectedContact(): ContactRef | null {
	return selected;
}

/**
 * React hook: the uid of the contact selected in `missionId`, or null.
 * @param missionId - The mission shown.
 */
export function useSelectedContact(
	missionId: string | null | undefined,
): string | null {
	const get = useCallback(
		() =>
			missionId && selected?.missionId === missionId
				? selected.uid
				: null,
		[missionId],
	);
	return useSyncExternalStore(subscribe, get, get);
}

/**
 * Be told about every focus request, as it is made.
 * @param listener - Called with each request.
 * @returns Unsubscribe.
 */
export function subscribeContactFocus(
	listener: (request: ContactFocusRequest) => void,
): () => void {
	focusListeners.add(listener);
	return () => {
		focusListeners.delete(listener);
	};
}

// ---- The poll ---------------------------------------------------------------

/** One read: the contacts, or an error to show. */
export type ContactsRead = () => Promise<
	{ ok: true; contacts: MissionContact[] } | { ok: false; error: string }
>;

interface Poll {
	/** Widgets watching this mission, each with its own read. */
	readers: Map<number, ContactsRead>;
	timer: ReturnType<typeof setInterval> | null;
	inFlight: boolean;
}

const polls = new Map<string, Poll>();
let nextReader = 0;

async function readOnce(missionId: string): Promise<void> {
	const poll = polls.get(missionId);
	if (!poll || poll.inFlight) return;
	// The newest reader: a widget that re-bound its datasource reads with it.
	const read = [...poll.readers.values()].at(-1);
	if (!read) return;
	poll.inFlight = true;
	try {
		const result = await read();
		// Let go of meanwhile (nobody shows it any more), or watched anew by
		// another poll whose own read is the newer one.
		if (polls.get(missionId) !== poll) return;
		if (result.ok) setMissionContacts(missionId, result.contacts);
		else setMissionContactsError(missionId, result.error);
	} finally {
		poll.inFlight = false;
	}
}

/**
 * Watch a mission's contacts: read now, then every {@link CONTACTS_POLL_MS},
 * shared with every other widget watching the same mission.
 *
 * @param missionId - The mission.
 * @param read - How this widget reads them.
 * @returns Stop watching (the poll stops with its last watcher).
 */
export function watchMissionContacts(
	missionId: string,
	read: ContactsRead,
): () => void {
	const id = nextReader++;
	let poll = polls.get(missionId);
	if (!poll) {
		poll = { readers: new Map(), timer: null, inFlight: false };
		polls.set(missionId, poll);
	}
	poll.readers.set(id, read);
	if (!poll.timer) {
		poll.timer = setInterval(
			() => void readOnce(missionId),
			CONTACTS_POLL_MS,
		);
	}
	void readOnce(missionId);
	return () => {
		const current = polls.get(missionId);
		if (!current) return;
		current.readers.delete(id);
		if (current.readers.size > 0) return;
		if (current.timer) clearInterval(current.timer);
		polls.delete(missionId);
	};
}

/** Test-only: reset all module-level state. */
export function __resetMissionContactsStore(): void {
	for (const poll of polls.values()) {
		if (poll.timer) clearInterval(poll.timer);
	}
	polls.clear();
	byMission = {};
	signatures = {};
	selected = null;
	seq = 0;
	listeners.clear();
	focusListeners.clear();
}
