"use client";

/**
 * Where a mission survives a reload.
 *
 * IndexedDB rather than anything smaller: a survey is tens of megabytes of
 * typed arrays, which rules out local storage (a few megabytes, and strings
 * only), and it is *the operator's* data, which rules out uploading it — the
 * whole tool has to work on a laptop in a field with no network.
 *
 * The storage is behind an interface for one reason that pays for itself: the
 * mission state machine is where the interesting mistakes live (spill accounting,
 * recovery, stop while a write is in flight), and an interface lets that be
 * tested against an in-memory double instead of against a browser database that
 * does not exist under the test runner.
 */

import type { MissionChunk, MissionHeader } from "./run-codec";

/** Everything the mission store needs from persistence. */
export interface MissionStorage {
	/** Write or overwrite a header. */
	putHeader(header: MissionHeader): Promise<void>;
	/** Append a chunk. */
	putChunk(chunk: MissionChunk): Promise<void>;
	/** Every header, in no particular order. */
	listHeaders(): Promise<MissionHeader[]>;
	/** One header, or undefined. */
	getHeader(id: string): Promise<MissionHeader | undefined>;
	/** Every chunk of one mission, in no particular order. */
	loadChunks(id: string): Promise<MissionChunk[]>;
	/** Remove a mission and all of its chunks. */
	deleteMission(id: string): Promise<void>;
}

/** Database name. Namespaced: a browser holds one origin's worth of everything. */
const DB_NAME = "ormi-teodor-emi";
/** Schema version. */
const DB_VERSION = 1;
/** Header store. */
const HEADERS = "missions";
/** Chunk store, keyed `[missionId, seq]`. */
const CHUNKS = "chunks";
/** Index on {@link CHUNKS} used to fetch and delete a mission's chunks. */
const BY_MISSION = "byMission";

/** Promise wrapper for a request. */
function wrap<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () =>
			reject(req.error ?? new Error("IndexedDB request failed"));
	});
}

/** Promise wrapper for a transaction's completion. */
function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () =>
			reject(tx.error ?? new Error("IndexedDB transaction failed"));
		tx.onabort = () =>
			reject(tx.error ?? new Error("IndexedDB transaction aborted"));
	});
}

/**
 * Open the database, creating the stores on first use.
 *
 * @param onLost - Called if the connection dies, so the caller can drop it.
 */
function open(onLost: () => void): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(HEADERS)) {
				db.createObjectStore(HEADERS, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(CHUNKS)) {
				const store = db.createObjectStore(CHUNKS, {
					keyPath: ["missionId", "seq"],
				});
				store.createIndex(BY_MISSION, "missionId", { unique: false });
			}
		};
		req.onsuccess = () => {
			const db = req.result;
			// Without this, *this* tab is the one holding an older version open
			// and blocking another tab's upgrade forever — the case rejected two
			// lines down. Yielding is the cooperative half of that check.
			db.onversionchange = () => {
				db.close();
				onLost();
			};
			// An abnormal close (eviction, a forced close) leaves every later
			// transaction throwing `InvalidStateError`. Dropping the cached handle
			// costs one reopen; caching a dead connection kills persistence for
			// the life of the page.
			db.onclose = () => onLost();
			resolve(db);
		};
		req.onerror = () =>
			reject(req.error ?? new Error("IndexedDB open failed"));
		// A second tab holding an older version open blocks the upgrade
		// indefinitely; failing beats hanging with no explanation.
		req.onblocked = () =>
			reject(
				new Error(
					"Another tab is holding an older mission database open",
				),
			);
	});
}

/**
 * The browser-backed storage.
 *
 * @returns The storage, or null where IndexedDB does not exist — server
 * rendering, a hardened private mode, or the test runner. A null return is not
 * an error: it means a mission can still be recorded, and only says so.
 */
export function createIndexedDbStorage(): MissionStorage | null {
	if (typeof indexedDB === "undefined") return null;

	// One connection, opened lazily and shared. Opening per call would make
	// every spill pay the handshake, and the upgrade path would run under a
	// dozen concurrent openers on first use.
	let handle: Promise<IDBDatabase> | null = null;
	const drop = () => {
		handle = null;
	};
	const db = (): Promise<IDBDatabase> => {
		handle ??= open(drop).catch((err: unknown) => {
			// Do not cache the failure: a transient block clears, and a permanent
			// refusal costs one retry per call rather than disabling persistence
			// for the lifetime of the page.
			handle = null;
			throw err;
		});
		return handle;
	};

	const put = async (store: string, value: unknown): Promise<void> => {
		const conn = await db();
		const tx = conn.transaction(store, "readwrite");
		tx.objectStore(store).put(value);
		await done(tx);
	};

	return {
		putHeader: (header) => put(HEADERS, header),
		putChunk: (chunk) => put(CHUNKS, chunk),

		async listHeaders() {
			const conn = await db();
			const tx = conn.transaction(HEADERS, "readonly");
			const all = await wrap(
				tx.objectStore(HEADERS).getAll() as IDBRequest<MissionHeader[]>,
			);
			await done(tx);
			return all;
		},

		async getHeader(id) {
			const conn = await db();
			const tx = conn.transaction(HEADERS, "readonly");
			const one = await wrap(
				tx.objectStore(HEADERS).get(id) as IDBRequest<
					MissionHeader | undefined
				>,
			);
			await done(tx);
			return one;
		},

		async loadChunks(id) {
			const conn = await db();
			const tx = conn.transaction(CHUNKS, "readonly");
			const all = await wrap(
				tx
					.objectStore(CHUNKS)
					.index(BY_MISSION)
					.getAll(IDBKeyRange.only(id)) as IDBRequest<MissionChunk[]>,
			);
			await done(tx);
			return all;
		},

		async deleteMission(id) {
			const conn = await db();
			// Both stores in one transaction: a header deleted without its chunks
			// leaves tens of megabytes unreachable and invisible.
			const tx = conn.transaction([HEADERS, CHUNKS], "readwrite");
			tx.objectStore(HEADERS).delete(id);
			const index = tx.objectStore(CHUNKS).index(BY_MISSION);
			const cursorReq = index.openKeyCursor(IDBKeyRange.only(id));
			cursorReq.onsuccess = () => {
				const cursor = cursorReq.result;
				if (!cursor) return;
				tx.objectStore(CHUNKS).delete(cursor.primaryKey);
				cursor.continue();
			};
			await done(tx);
		},
	};
}

/**
 * An in-memory storage with the same contract.
 *
 * Exported rather than kept in the test file: it is also the honest fallback
 * for a browser that refuses IndexedDB, where a mission should still be
 * recordable for as long as the page is open.
 *
 * @returns A storage backed by two maps.
 */
export function createMemoryStorage(): MissionStorage {
	const headers = new Map<string, MissionHeader>();
	const chunks = new Map<string, MissionChunk[]>();

	return {
		async putHeader(header) {
			headers.set(header.id, header);
		},
		async putChunk(chunk) {
			const list = chunks.get(chunk.missionId) ?? [];
			const at = list.findIndex((c) => c.seq === chunk.seq);
			if (at >= 0) list[at] = chunk;
			else list.push(chunk);
			chunks.set(chunk.missionId, list);
		},
		async listHeaders() {
			return [...headers.values()];
		},
		async getHeader(id) {
			return headers.get(id);
		},
		async loadChunks(id) {
			return [...(chunks.get(id) ?? [])];
		},
		async deleteMission(id) {
			headers.delete(id);
			chunks.delete(id);
		},
	};
}
