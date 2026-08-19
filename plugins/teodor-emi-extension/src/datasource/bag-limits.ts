/**
 * What this replay engine can actually open, and how to say so.
 *
 * ## The ceiling is real, and it is measured
 *
 * `emi-replay.worker.ts` opens a recording with `new SQL.Database(...)`. sql.js
 * is a **wasm32** module with an in-memory VFS: the entire database is copied
 * into the WebAssembly heap. That heap is hard-capped — this build's
 * `emscripten_get_heap_max` returns exactly `2147483648` (2 GiB) — and SQLite's
 * page cache and working allocations have to fit in there beside the database.
 * On top of that, the JS-side `ArrayBuffer` holds a second copy of the file
 * until it is collected, so the peak is roughly twice the file size.
 *
 * A recording that exceeds this does not degrade. It fails, in the worker,
 * several seconds after the operator picked it — which is exactly the kind of
 * late, unexplained failure these limits exist to convert into an immediate
 * sentence.
 *
 * ## Why the answer is "filter the bag", not "raise the limit"
 *
 * A multi-gigabyte survey bag is multi-gigabyte because of cameras, lidar or
 * point clouds. The cockpit reads seven small topics and ignores everything
 * else, so filtering is not a compromise — it is discarding data this tool was
 * never going to look at. The advice below says so, with the command.
 */

/**
 * Above this, warn but proceed.
 *
 * Around here a recording starts to cost seconds to open and hundreds of
 * megabytes of resident memory. It works; the operator should simply know why
 * the page went quiet for a moment.
 */
export const BAG_WARN_BYTES = 512 * 1024 * 1024;

/**
 * At or above this, refuse.
 *
 * Deliberately below the 2 GiB heap ceiling rather than at it: the database is
 * not the only thing in that heap, and a refusal that names a smaller number is
 * far better than an out-of-memory crash inside the worker at 1.9 GiB.
 */
export const BAG_MAX_BYTES = 1536 * 1024 * 1024;

/** The wasm32 heap ceiling this limit is derived from, for the message. */
export const SQLJS_HEAP_MAX_BYTES = 2147483648;

/** First bytes of every SQLite 3 database file, including the terminator. */
export const SQLITE_MAGIC = "SQLite format 3\0";

/** Bytes needed to recognise a SQLite file. */
export const SQLITE_MAGIC_BYTES = SQLITE_MAGIC.length;

/** How the caller should treat a recording. */
export type BagVerdict = "ok" | "warn" | "refuse";

/** The result of checking a recording before opening it. */
export interface BagCheck {
	verdict: BagVerdict;
	/** What is wrong, in one sentence. Empty when the verdict is `ok`. */
	message: string;
	/** What to do about it. Empty when there is nothing to do. */
	advice: string;
}

/** Nothing to say. */
const FINE: BagCheck = { verdict: "ok", message: "", advice: "" };

/**
 * Bytes at human scale.
 *
 * @param bytes - The count.
 * @returns e.g. `3.1 GB`.
 */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** The standing advice for a recording that is too big to open. */
export const FILTER_ADVICE =
	"The cockpit reads only the EMI, GNSS, quaternion and /tf_static topics — a survey bag is usually this large because of cameras or point clouds. Filter it with `ros2 bag convert` (see `ros2 bag info` for the topic names) and open the result.";

/**
 * Decide whether a recording can be opened, before spending a read on it.
 *
 * @param bytes - Size of the file.
 * @returns The verdict, with a message the operator can act on.
 */
export function checkBagSize(bytes: number): BagCheck {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return {
			verdict: "refuse",
			message: "That file is empty.",
			advice: "Pick a rosbag2 `.db3` recording.",
		};
	}
	if (bytes >= BAG_MAX_BYTES) {
		return {
			verdict: "refuse",
			message: `This recording is ${formatBytes(bytes)}. The replay engine holds the whole database in a WebAssembly heap capped at ${formatBytes(SQLJS_HEAP_MAX_BYTES)}, so it cannot be opened.`,
			advice: FILTER_ADVICE,
		};
	}
	if (bytes >= BAG_WARN_BYTES) {
		return {
			verdict: "warn",
			message: `This recording is ${formatBytes(bytes)}. It will take a moment to open and will stay in memory for as long as the page is.`,
			advice: FILTER_ADVICE,
		};
	}
	return FINE;
}

/**
 * Is this the beginning of a SQLite database?
 *
 * Checked from the first sixteen bytes, which costs one small range read. It
 * catches the two easy mistakes — a `.mcap`, or the metadata `.yaml` beside the
 * recording — before a gigabyte is pulled into memory to discover the same
 * thing in the worker.
 *
 * @param head - At least {@link SQLITE_MAGIC_BYTES} bytes from offset 0.
 * @returns True if the header matches.
 */
export function looksLikeSqlite(head: Uint8Array): boolean {
	if (head.length < SQLITE_MAGIC_BYTES) return false;
	for (let i = 0; i < SQLITE_MAGIC_BYTES; i++) {
		if (head[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
	}
	return true;
}

/**
 * Turn a failed file read into something an operator can act on.
 *
 * `NotReadableError` is the one that matters and the one whose own wording is
 * least helpful. The browser snapshots a file when it is picked and revalidates
 * that snapshot at read time, so it means one of a small set of concrete
 * things — all of which are worth naming, because the operator can check each
 * of them in seconds.
 *
 * @param err - Whatever the read threw.
 * @param name - File name, for the message.
 * @returns A message and its advice.
 */
export function explainReadFailure(
	err: unknown,
	name: string,
): { message: string; advice: string } {
	const kind = err instanceof DOMException ? err.name : "";
	const detail = err instanceof Error ? err.message : String(err);

	if (kind === "NotReadableError") {
		return {
			message: `"${name}" could not be read. The browser re-checks a picked file when it reads it, and this one no longer matches.`,
			advice: "Usually one of: the bag is still being written (`ros2 bag record` running, or a `-wal`/`-journal` file beside it); the file lives somewhere a sandboxed browser cannot reach (a Snap or Flatpak build cannot read `/mnt`, `/media` or another user's home); or it moved. Copy it into your home directory and pick the copy.",
		};
	}
	if (kind === "NotFoundError") {
		return {
			message: `"${name}" is no longer where it was when you picked it.`,
			advice: "Pick it again from its current location.",
		};
	}
	if (kind === "SecurityError" || kind === "NotAllowedError") {
		return {
			message: `The browser refused to read "${name}".`,
			advice: "Check the file's permissions, and whether the browser is sandboxed away from that directory.",
		};
	}
	if (err instanceof RangeError) {
		return {
			message: `"${name}" is too large to hold in memory: ${detail}`,
			advice: FILTER_ADVICE,
		};
	}
	return {
		message: `"${name}" could not be read: ${detail}`,
		advice: "",
	};
}
