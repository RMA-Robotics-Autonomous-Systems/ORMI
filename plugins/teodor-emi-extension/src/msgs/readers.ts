/**
 * CDR readers for the message types this plugin ships definitions for.
 *
 * Two responsibilities beyond "call MessageReader":
 *
 * - **Caching.** Parsing a definition is not free and a replay decodes the same
 *   handful of types tens of thousands of times, so readers are built once.
 * - **Layout selection.** Some `emi_msgs` types have more than one live wire
 *   layout (see {@link SCHEMAS}) and CDR carries no schema, so the only way to
 *   tell them apart is to try. The winner is remembered per ROS type, so the
 *   cost is one failed parse per type per session, not per message.
 *
 * Safe to use from a worker: no DOM, no React.
 */

import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import { SCHEMAS } from "./schemas";

/** A reader plus the layout it was built from. */
export interface VariantReader {
	label: string;
	reader: MessageReader;
	validate?: (msg: unknown) => boolean;
}

/**
 * Decode with one variant, returning null if it does not fit.
 *
 * "Fits" is decode-without-throwing *and* pass the variant's structural check.
 * Both halves are needed: a longer layout on a shorter payload throws, but a
 * shorter layout on a longer payload succeeds while silently ignoring the
 * trailing bytes — and returns a plausible-looking wrong answer.
 */
function tryVariant<T>(v: VariantReader, data: Uint8Array): T | null {
	let msg: T;
	try {
		msg = v.reader.readMessage<T>(data);
	} catch {
		return null;
	}
	if (v.validate && !v.validate(msg)) return null;
	return msg;
}

const built = new Map<string, VariantReader[]>();
/** Which variant last decoded successfully, per ROS type. */
const chosen = new Map<string, VariantReader>();

/**
 * Every candidate reader for a ROS type, newest layout first.
 *
 * @param rosType - Fully qualified ROS 2 type name, e.g. `emi_msgs/msg/EMI`.
 * @returns The readers, or an empty array when no definition is shipped.
 */
export function readersFor(rosType: string): VariantReader[] {
	const cached = built.get(rosType);
	if (cached) return cached;

	const variants = SCHEMAS[rosType];
	if (!variants) return [];

	const readers = variants.map((v) => ({
		label: v.label,
		reader: new MessageReader(parse(v.text, { ros2: true })),
		validate: v.validate,
	}));
	built.set(rosType, readers);
	return readers;
}

/**
 * A reader for a ROS type — the layout currently in force, or the newest.
 *
 * @param rosType - Fully qualified ROS 2 type name.
 * @returns A reader, or null when no definition is shipped.
 */
export function readerFor(rosType: string): MessageReader | null {
	const picked = chosen.get(rosType);
	if (picked) return picked.reader;
	return readersFor(rosType)[0]?.reader ?? null;
}

/**
 * The layout label currently in force for a ROS type.
 *
 * Exposed so a caller can report which build it is talking to rather than
 * guessing — a recording and a live robot legitimately differ.
 *
 * @param rosType - Fully qualified ROS 2 type name.
 * @returns The label, or null if nothing has decoded yet.
 */
export function activeVariant(rosType: string): string | null {
	return chosen.get(rosType)?.label ?? null;
}

/**
 * Decode one CDR payload.
 *
 * **Total.** Returns null for an unknown type, a truncated or misaligned
 * payload, and a payload that matches no shipped layout — a replay loop must be
 * able to skip one bad message rather than die on it.
 *
 * @param rosType - The topic's ROS 2 type name.
 * @param data - The raw CDR bytes as stored in the bag or received on the wire.
 * @returns The decoded message, or null.
 */
export function decodeMessage<T = unknown>(
	rosType: string,
	data: Uint8Array,
): T | null {
	const readers = readersFor(rosType);
	if (!readers.length) return null;

	// The variant that worked last time first: after the first message this is
	// a single attempt, and the retry only ever costs the session's first
	// message of a type whose layout is not the newest.
	const picked = chosen.get(rosType);
	const ordered = picked
		? [picked, ...readers.filter((r) => r !== picked)]
		: readers;

	// A variant is only *selected* on positive evidence — it decoded and the
	// result satisfied the structural check. This is what lets the choice change
	// mid-session, when a page that was reviewing a recording connects to a live
	// robot on the same topic.
	for (const variant of ordered) {
		const msg = tryVariant<T>(variant, data);
		if (msg !== null) {
			chosen.set(rosType, variant);
			return msg;
		}
	}

	// Nothing proved itself. Decode with the standing choice if it parses, and
	// leave that choice alone: a message that carries no evidence — an empty
	// sequence, most often — must not be able to *unset* a layout that earlier
	// messages established.
	for (const variant of ordered) {
		try {
			return variant.reader.readMessage<T>(data);
		} catch {
			// Try the next layout.
		}
	}
	return null;
}

/** Drop every cached reader and layout choice. Exposed for tests. */
export function clearReaderCache(): void {
	built.clear();
	chosen.clear();
}
