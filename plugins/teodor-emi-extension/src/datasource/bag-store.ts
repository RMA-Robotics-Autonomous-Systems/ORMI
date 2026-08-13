"use client";

/**
 * Where a selected recording's bytes live between the file picker and the
 * worker.
 *
 * A `.db3` is an `ArrayBuffer` of tens or hundreds of megabytes. It must not
 * travel through the datasource's persisted settings: those are serialised into
 * the dashboard document, so a buffer there would be written to the database on
 * every save. Settings therefore carry only a **key**, and the bytes sit here —
 * in memory, for the lifetime of the page.
 *
 * Pinned on `globalThis` because Next builds separate client and server module
 * graphs and replaces modules on hot reload; a plain module-level `Map` would
 * quietly become two, with the picker writing to one and the provider reading
 * the other.
 */

import { useSyncExternalStore } from "react";

/** A recording held in memory, ready to be replayed. */
export interface StoredBag {
	/** Stable identity — see {@link bagKey}. */
	key: string;
	/** File name, for display. */
	name: string;
	buffer: ArrayBuffer;
	/** Bytes, for display. */
	size: number;
	/** When it was loaded, for ordering the picker. */
	loadedAt: number;
}

interface BagStore {
	bags: Map<string, StoredBag>;
	listeners: Set<() => void>;
	/**
	 * The sorted list handed to `useSyncExternalStore`.
	 *
	 * Rebuilt only when the set changes, because `getSnapshot` must return an
	 * identity-stable value: React re-reads it after every commit and a fresh
	 * array each time is an infinite render loop.
	 */
	snapshot: StoredBag[];
}

const g = globalThis as typeof globalThis & { __ormiEmiBags__?: BagStore };

/** The one store, however this module was resolved. */
function store(): BagStore {
	g.__ormiEmiBags__ ??= {
		bags: new Map<string, StoredBag>(),
		listeners: new Set<() => void>(),
		snapshot: [],
	};
	return g.__ormiEmiBags__;
}

/** Rebuild the cached snapshot and tell React about it. */
function commit(): void {
	const s = store();
	s.snapshot = [...s.bags.values()].sort((a, b) => b.loadedAt - a.loadedAt);
	for (const fn of s.listeners) fn();
}

/**
 * Stable identity for a picked file.
 *
 * Not the bare file name: `rosbag2_0.db3` is the ROS 2 default, so two
 * recordings from different surveys routinely share one — and a datasource
 * saved against that name would silently replay the wrong survey.
 *
 * @param file - The picked file.
 * @returns A key that distinguishes same-named recordings.
 */
export function bagKey(file: {
	name: string;
	size: number;
	lastModified: number;
}): string {
	return `${file.name}#${file.size}#${file.lastModified}`;
}

/**
 * Hold a recording's bytes.
 *
 * @param file - The picked file, for its name and identity.
 * @param buffer - The `.db3` contents.
 * @returns The stored entry.
 */
export function putBag(
	file: { name: string; size: number; lastModified: number },
	buffer: ArrayBuffer,
): StoredBag {
	const entry: StoredBag = {
		key: bagKey(file),
		name: file.name,
		buffer,
		size: buffer.byteLength,
		loadedAt: Date.now(),
	};
	store().bags.set(entry.key, entry);
	commit();
	return entry;
}

/** The bytes held under a key, if any. */
export function getBag(key: string): StoredBag | undefined {
	return store().bags.get(key);
}

/** Forget a recording, releasing its bytes. */
export function removeBag(key: string): void {
	if (store().bags.delete(key)) commit();
}

/** Every loaded recording, newest first. Identity-stable between changes. */
export function listBags(): StoredBag[] {
	return store().snapshot;
}

/**
 * Subscribe to changes in the set of loaded recordings.
 *
 * @param onChange - Called after any add or remove.
 * @returns Unsubscribe.
 */
export function subscribeBags(onChange: () => void): () => void {
	store().listeners.add(onChange);
	return () => {
		store().listeners.delete(onChange);
	};
}

/** Server snapshot: nothing is ever loaded there. */
const NO_BAGS: StoredBag[] = [];
const serverSnapshot = () => NO_BAGS;

/**
 * The loaded recordings, as React state.
 *
 * One binding shared by the picker and the provider — two hand-rolled copies
 * would each have to get the snapshot-identity rule right.
 *
 * @returns Every loaded recording, newest first.
 */
export function useBags(): StoredBag[] {
	return useSyncExternalStore(subscribeBags, listBags, serverSnapshot);
}

/**
 * One recording, as React state — re-renders when it is loaded or dropped.
 *
 * @param key - The key to watch.
 * @returns The entry, or undefined.
 */
export function useBag(key: string): StoredBag | undefined {
	const bags = useBags();
	return bags.find((b) => b.key === key);
}
