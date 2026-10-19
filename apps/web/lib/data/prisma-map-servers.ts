import { Prisma } from "@prisma/client";
import {
	MAP_SERVER_AUTH_FIELDS,
	mergeMapServerAuthSecrets,
} from "@workspace/ormi-core/map-layers/model";
import type {
	MapLayerEntry,
	MapServerAuth,
	MapServerAuthKindFields,
	MapServerRecord,
	MapServerSettings,
} from "@workspace/ormi-core/map-layers/model";

import { db } from "@/server/db";
import type {
	MapServerAuthUpdate,
	MapServerSettingsUpdate,
} from "@/lib/validations/map-server";

/**
 * Sole Prisma caller for the `MapServer` table.
 *
 * Every query is scoped `where: { id, userId }` (or `{ userId }` for a list),
 * and the user id is always the caller's session id, never one from the
 * request. A record carries its auth secrets, so another user's id answers
 * exactly like an id that does not exist.
 *
 * Settings are never logged: use `logMapServerError`, which keeps a Prisma
 * error's name and code and drops its message (a validation error message
 * prints the invocation, arguments included).
 */

/** The columns a `MapServerRecord` is built from. */
const RECORD_SELECT = {
	id: true,
	serverKey: true,
	adapterId: true,
	title: true,
	settings: true,
	catalog: true,
	catalogFetchedAt: true,
} as const satisfies Prisma.MapServerSelect;

type MapServerRow = Prisma.MapServerGetPayload<{
	select: typeof RECORD_SELECT;
}>;

/**
 * Turn a row into the wire record.
 *
 * @param row - The selected row.
 * @returns The record, with the timestamp as ISO text.
 */
function toRecord(row: MapServerRow): MapServerRecord {
	return {
		id: row.id,
		serverKey: row.serverKey,
		adapterId: row.adapterId,
		title: row.title,
		settings: row.settings as unknown as MapServerSettings,
		catalog: (row.catalog as unknown as MapLayerEntry[] | null) ?? null,
		catalogFetchedAt: row.catalogFetchedAt
			? row.catalogFetchedAt.toISOString()
			: null,
	};
}

/**
 * Read a Prisma error code without importing the runtime error classes.
 *
 * @param error - Anything thrown.
 * @returns The `P****` code, if any.
 */
function prismaCode(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "code" in error) {
		const code = (error as { code: unknown }).code;
		return typeof code === "string" ? code : undefined;
	}
	return undefined;
}

/** Unique constraint violation: the user already has this `serverKey`. */
const UNIQUE_VIOLATION = "P2002";
/** `update` / `delete` matched no row. */
const RECORD_NOT_FOUND = "P2025";

/**
 * Log a failure without its payload.
 *
 * @param context - What was being done.
 * @param error - The thrown value; only its name and code are logged.
 */
export function logMapServerError(context: string, error: unknown): void {
	const name = error instanceof Error ? error.name : typeof error;
	const code = prismaCode(error);
	console.error(`${context}: ${name}${code ? ` (${code})` : ""}`);
}

/**
 * The result of a write that can collide with another record of the same
 * user, or find nothing to write.
 */
export type MapServerWriteResult =
	| { status: "ok"; server: MapServerRecord }
	| { status: "not-found" }
	| { status: "conflict" }
	| { status: "missing-secret"; field: string };

/** The result of a create: a write, or the user is at their server limit. */
export type MapServerCreateResult = MapServerWriteResult | { status: "limit" };

/**
 * List the user's servers in their stored order.
 *
 * @param userId - The session user.
 * @returns The records, `position` ascending.
 */
export async function listMapServers(
	userId: string,
): Promise<MapServerRecord[]> {
	const rows = await db.mapServer.findMany({
		where: { userId },
		select: RECORD_SELECT,
		orderBy: [{ position: "asc" }, { createdAt: "asc" }],
	});
	return rows.map(toRecord);
}

/**
 * Read one of the user's servers.
 *
 * @param id - The record id.
 * @param userId - The session user.
 * @returns The record, or `null` when it is not this user's.
 */
export async function getMapServer(
	id: string,
	userId: string,
): Promise<MapServerRecord | null> {
	const row = await db.mapServer.findFirst({
		where: { id, userId },
		select: RECORD_SELECT,
	});
	return row ? toRecord(row) : null;
}

/** What a create writes. `serverKey` is computed by the route. */
export interface MapServerCreateData {
	serverKey: string;
	adapterId: string;
	title: string;
	settings: MapServerSettings;
	catalog?: MapLayerEntry[] | null;
	/** Servers the user may have; a create beyond it is refused. */
	maxServers: number;
}

/**
 * Register a server, appended after the user's existing ones.
 *
 * @param userId - The session user.
 * @param data - The validated record.
 * The limit is checked by count before the insert, so two concurrent creates
 * at the limit can both land; it bounds a user's rows, it is not a quota.
 *
 * @returns The record, `conflict` when the user already has the server, or
 *   `limit` when they already have `maxServers`.
 */
export async function createMapServer(
	userId: string,
	data: MapServerCreateData,
): Promise<MapServerCreateResult> {
	const count = await db.mapServer.count({ where: { userId } });
	if (count >= data.maxServers) return { status: "limit" };
	const last = await db.mapServer.aggregate({
		where: { userId },
		_max: { position: true },
	});
	const position = (last._max.position ?? -1) + 1;
	const hasCatalog = data.catalog !== undefined && data.catalog !== null;

	try {
		const row = await db.mapServer.create({
			data: {
				userId,
				serverKey: data.serverKey,
				adapterId: data.adapterId,
				title: data.title,
				settings: data.settings as unknown as Prisma.InputJsonValue,
				...(hasCatalog
					? {
							catalog:
								data.catalog as unknown as Prisma.InputJsonValue,
							catalogFetchedAt: new Date(),
						}
					: {}),
				position,
			},
			select: RECORD_SELECT,
		});
		return { status: "ok", server: toRecord(row) };
	} catch (error) {
		if (prismaCode(error) === UNIQUE_VIOLATION)
			return { status: "conflict" };
		throw error;
	}
}

/** The secret field of an auth kind, from core's `MAP_SERVER_AUTH_FIELDS`. */
function secretFieldOf(kind: MapServerAuth["kind"]): string | undefined {
	const shape: MapServerAuthKindFields | undefined =
		MAP_SERVER_AUTH_FIELDS[kind];
	return shape?.secret;
}

/**
 * Resolve an update's auth against the stored one.
 *
 * Omitting `auth` keeps the stored auth; `{ kind: "none" }` removes it. A
 * secret omitted from an auth of the **same** kind keeps the stored secret
 * (`mergeMapServerAuthSecrets`, core), which is how the edit form's
 * "Unchanged" password field round-trips. A changed kind has no stored secret
 * to keep, so the secret is then required.
 *
 * A secret belongs to the server it was typed for: when the update names
 * another server (`sameServer` false, the `serverKey` changes), nothing
 * stored is kept, so the secret is required again, whether the update
 * resends the auth without it or omits the auth entirely. Otherwise an edit
 * of the URL alone would send the old server's credential to the new one.
 *
 * Pure, exported for tests.
 *
 * @param stored - The auth on the record.
 * @param incoming - The auth the update carries.
 * @param sameServer - Whether the update keeps the record's `serverKey`.
 * @returns The auth to store, or the secret field that is missing.
 */
export function mergeMapServerAuth(
	stored: MapServerAuth | undefined,
	incoming: MapServerAuthUpdate | undefined,
	sameServer = true,
):
	| { ok: true; auth: MapServerAuth | undefined }
	| { ok: false; field: string } {
	if (incoming === undefined) {
		if (sameServer || !stored) return { ok: true, auth: stored };
		const field = secretFieldOf(stored.kind);
		return field
			? { ok: false, field: `auth.${field}` }
			: { ok: true, auth: stored };
	}

	const merged = mergeMapServerAuthSecrets(
		incoming as MapServerAuth,
		sameServer ? stored : undefined,
	) as Record<string, unknown> | undefined;
	const field = secretFieldOf(incoming.kind);
	if (field) {
		const value = merged?.[field];
		if (typeof value !== "string" || value === "") {
			return { ok: false, field: `auth.${field}` };
		}
	}
	return { ok: true, auth: merged as MapServerAuth | undefined };
}

/**
 * Resolve an update's settings against the stored ones. Adapter keys are
 * replaced as a whole; only the auth secret is merged, and only while the
 * update keeps the same server (see {@link mergeMapServerAuth}).
 *
 * Pure, exported for tests.
 *
 * @param stored - The settings on the record.
 * @param incoming - The validated update settings.
 * @param sameServer - Whether the update keeps the record's `serverKey`.
 * @returns The settings to store, or the secret field that is missing.
 */
export function mergeMapServerSettings(
	stored: MapServerSettings,
	incoming: MapServerSettingsUpdate,
	sameServer = true,
): { ok: true; settings: MapServerSettings } | { ok: false; field: string } {
	const { auth: incomingAuth, ...rest } = incoming;
	const auth = mergeMapServerAuth(
		stored.auth,
		incomingAuth as MapServerAuthUpdate | undefined,
		sameServer,
	);
	if (!auth.ok) return auth;
	const settings = { ...rest } as unknown as MapServerSettings;
	if (auth.auth !== undefined) settings.auth = auth.auth;
	return { ok: true, settings };
}

/** What an update may change. */
export interface MapServerUpdateData {
	title?: string;
	settings?: MapServerSettingsUpdate;
}

/**
 * Update one of the user's servers.
 *
 * A changed address re-keys the record through `computeKey`, drops the
 * catalogue (a snapshot of another address describes another server) and
 * keeps no stored secret (it must be sent again).
 *
 * @param id - The record id.
 * @param userId - The session user.
 * @param data - The validated update.
 * @param computeKey - `serverKey(adapterId, url)` for the merged settings.
 * @returns The record, or why it was not written.
 */
export async function updateMapServer(
	id: string,
	userId: string,
	data: MapServerUpdateData,
	computeKey: (adapterId: string, url: string) => string,
): Promise<MapServerWriteResult> {
	const existing = await db.mapServer.findFirst({
		where: { id, userId },
		select: RECORD_SELECT,
	});
	if (!existing) return { status: "not-found" };
	const current = toRecord(existing);

	const update: Prisma.MapServerUpdateInput = {};
	if (data.title !== undefined) update.title = data.title;

	if (data.settings !== undefined) {
		const key = computeKey(current.adapterId, data.settings.url);
		const sameServer = key === current.serverKey;
		const merged = mergeMapServerSettings(
			current.settings,
			data.settings,
			sameServer,
		);
		if (!merged.ok)
			return { status: "missing-secret", field: merged.field };
		update.settings = merged.settings as unknown as Prisma.InputJsonValue;

		if (!sameServer) {
			update.serverKey = key;
			update.catalog = Prisma.DbNull;
			update.catalogFetchedAt = null;
		}
	}

	try {
		const row = await db.mapServer.update({
			where: { id, userId },
			data: update,
			select: RECORD_SELECT,
		});
		return { status: "ok", server: toRecord(row) };
	} catch (error) {
		const code = prismaCode(error);
		if (code === UNIQUE_VIOLATION) return { status: "conflict" };
		if (code === RECORD_NOT_FOUND) return { status: "not-found" };
		throw error;
	}
}

/**
 * Replace a server's catalogue snapshot and stamp its fetch time.
 *
 * @param id - The record id.
 * @param userId - The session user.
 * @param catalog - The validated snapshot.
 * @returns The record, or `null` when it is not this user's.
 */
export async function updateMapServerCatalog(
	id: string,
	userId: string,
	catalog: MapLayerEntry[],
): Promise<MapServerRecord | null> {
	try {
		const row = await db.mapServer.update({
			where: { id, userId },
			data: {
				catalog: catalog as unknown as Prisma.InputJsonValue,
				catalogFetchedAt: new Date(),
			},
			select: RECORD_SELECT,
		});
		return toRecord(row);
	} catch (error) {
		if (prismaCode(error) === RECORD_NOT_FOUND) return null;
		throw error;
	}
}

/**
 * Remove one of the user's servers.
 *
 * @param id - The record id.
 * @param userId - The session user.
 * @returns Whether a record was removed.
 */
export async function deleteMapServer(
	id: string,
	userId: string,
): Promise<boolean> {
	const result = await db.mapServer.deleteMany({ where: { id, userId } });
	return result.count > 0;
}
