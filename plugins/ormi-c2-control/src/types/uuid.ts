/**
 * `unique_identifier_msgs/msg/UUID` → the canonical string form.
 *
 * Every id this plugin keys on (`mission_id` from the REST catalog, the inner
 * `mission_feedback` JSON, the selection store) is the lowercase, hyphenated
 * 8-4-4-4-12 string the C2 produces with `convertByteArrayToString`
 * (`uuid_library.hpp`: `boost::uuids::to_string` over the 16 bytes, in order).
 *
 * A ROS message field typed `unique_identifier_msgs/UUID` does NOT arrive in that
 * form. `c2_msgs/msg/SwarmLog.mission_id` is one, and the swarm log keyed its
 * per-mission buckets on it as if it were a string, so every entry fell into the
 * "no mission" bucket and the log was empty whenever a mission was selected.
 *
 * The decoded shape depends on the bridge, so {@link uuidToString} accepts all of
 * them: `{ uuid: number[] }`, `{ uuid: Uint8Array }`, `{ uuid: "<base64>" }`
 * (rosbridge's encoding for `uint8[]`), a bare 16-byte array, or a string that
 * already is a UUID (normalised to lowercase).
 */

/** Byte count of a UUID. */
const UUID_BYTES = 16;

/** The canonical 8-4-4-4-12 layout, case-insensitive. */
const UUID_STRING =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 32 hex digits without hyphens. */
const UUID_HEX = /^[0-9a-f]{32}$/i;

/** Format 16 bytes as the canonical lowercase hyphenated string. */
function bytesToUuid(bytes: ArrayLike<number>): string | null {
	if (bytes.length !== UUID_BYTES) return null;
	let hex = "";
	for (let i = 0; i < UUID_BYTES; i++) {
		const b = bytes[i];
		if (typeof b !== "number" || !Number.isInteger(b) || b < 0 || b > 255) {
			return null;
		}
		hex += b.toString(16).padStart(2, "0");
	}
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Decode a base64 string to bytes, or null when it is not base64. */
function base64ToBytes(value: string): number[] | null {
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
	try {
		const binary = atob(value);
		const out: number[] = [];
		for (let i = 0; i < binary.length; i++) out.push(binary.charCodeAt(i));
		return out;
	} catch {
		return null;
	}
}

/** Normalise a string id: a UUID (with or without hyphens) → canonical form. */
function normaliseString(value: string): string {
	const trimmed = value.trim();
	if (UUID_STRING.test(trimmed)) return trimmed.toLowerCase();
	if (UUID_HEX.test(trimmed)) {
		const hex = trimmed.toLowerCase();
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
	// A 24-character base64 blob is exactly 16 bytes.
	if (trimmed.length === 24) {
		const bytes = base64ToBytes(trimmed);
		const uuid = bytes ? bytesToUuid(bytes) : null;
		if (uuid) return uuid;
	}
	// Some other id scheme (tests, legacy `mission-<ts>` ids): keep it as is.
	return trimmed;
}

/**
 * Convert a wire id to the canonical string form used everywhere else.
 *
 * @param value - A `unique_identifier_msgs/UUID` in any decoded shape, a byte
 *   array, or a string.
 * @returns The lowercase 8-4-4-4-12 string; a non-UUID string unchanged (trimmed);
 *   or null when the value cannot be read as an id (absent, wrong length, …).
 */
export function uuidToString(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === "string") {
		const s = normaliseString(value);
		return s.length > 0 ? s : null;
	}
	if (Array.isArray(value) || ArrayBuffer.isView(value)) {
		return bytesToUuid(value as ArrayLike<number>);
	}
	if (typeof value === "object" && "uuid" in value) {
		return uuidToString((value as { uuid: unknown }).uuid);
	}
	return null;
}

/**
 * A comparison key for an id: trimmed, lowercased, with every `-` and `_`
 * removed. The C2 is not consistent about separators — ROS-side code sometimes
 * spells a UUID with underscores (`a1b2c3d4_…`, legal in topic/namespace names)
 * while the REST catalog uses the canonical hyphenated form — so a name lookup
 * keyed on the raw string silently misses. Compare keys, never raw ids.
 *
 * @param id - Any id string (or null/undefined → "").
 * @returns The separator- and case-insensitive key.
 */
export function uuidKey(id: string | null | undefined): string {
	if (typeof id !== "string") return "";
	return id.trim().toLowerCase().replace(/[-_]/g, "");
}

/**
 * Whether two ids name the same thing, tolerant of `-` vs `_` and of case.
 *
 * @param a - First id.
 * @param b - Second id.
 * @returns True when both are non-empty and their {@link uuidKey}s match.
 */
export function sameUuid(
	a: string | null | undefined,
	b: string | null | undefined,
): boolean {
	const ka = uuidKey(a);
	return ka.length > 0 && ka === uuidKey(b);
}
