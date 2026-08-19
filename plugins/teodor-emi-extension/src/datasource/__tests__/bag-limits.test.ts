/**
 * The guards on the way in.
 *
 * These exist because the alternative is what actually happened: a 3 GB bag
 * picked, an uncaught `NotReadableError` in the console, and ten panels reading
 * "offline" with nothing on screen connecting the two. Every case below is a
 * failure that used to be silent.
 */

import { describe, expect, it } from "bun:test";
import {
	BAG_MAX_BYTES,
	BAG_WARN_BYTES,
	SQLITE_MAGIC,
	SQLITE_MAGIC_BYTES,
	SQLJS_HEAP_MAX_BYTES,
	checkBagSize,
	explainReadFailure,
	formatBytes,
	looksLikeSqlite,
} from "../bag-limits";

/** The first bytes of a real SQLite file. */
const sqliteHead = () => {
	const head = new Uint8Array(32);
	for (let i = 0; i < SQLITE_MAGIC.length; i++) {
		head[i] = SQLITE_MAGIC.charCodeAt(i);
	}
	return head;
};

describe("the size ceiling", () => {
	it("is below the heap the engine actually has", () => {
		// sql.js is wasm32 and holds the whole database in its heap; this
		// build's `emscripten_get_heap_max` returns exactly 2 GiB. The refusal
		// threshold has to leave room for SQLite's own allocations inside it,
		// so a ceiling *at* the heap max would refuse nothing that mattered and
		// still crash.
		expect(SQLJS_HEAP_MAX_BYTES).toBe(2147483648);
		expect(BAG_MAX_BYTES).toBeLessThan(SQLJS_HEAP_MAX_BYTES);
		expect(BAG_WARN_BYTES).toBeLessThan(BAG_MAX_BYTES);
	});

	it("refuses the recording that started all this", () => {
		const check = checkBagSize(3.1 * 1024 * 1024 * 1024);
		expect(check.verdict).toBe("refuse");
		// The number, the reason and the way out — a refusal without a next
		// step just moves the dead end.
		expect(check.message).toContain("3.1 GB");
		expect(check.message).toContain("2.0 GB");
		expect(check.advice).toContain("ros2 bag convert");
	});

	it("warns without refusing in the awkward middle", () => {
		const check = checkBagSize(BAG_WARN_BYTES + 1);
		expect(check.verdict).toBe("warn");
		expect(check.advice).not.toBe("");
	});

	it("says nothing about an ordinary recording", () => {
		const check = checkBagSize(80 * 1024 * 1024);
		expect(check.verdict).toBe("ok");
		expect(check.message).toBe("");
	});

	it("refuses an empty or impossible file", () => {
		expect(checkBagSize(0).verdict).toBe("refuse");
		expect(checkBagSize(NaN).verdict).toBe("refuse");
		expect(checkBagSize(-1).verdict).toBe("refuse");
	});

	it("draws the line at the threshold, not past it", () => {
		expect(checkBagSize(BAG_MAX_BYTES).verdict).toBe("refuse");
		expect(checkBagSize(BAG_MAX_BYTES - 1).verdict).toBe("warn");
		expect(checkBagSize(BAG_WARN_BYTES - 1).verdict).toBe("ok");
	});
});

describe("looksLikeSqlite", () => {
	it("accepts a SQLite header", () => {
		expect(looksLikeSqlite(sqliteHead())).toBe(true);
	});

	it("rejects the two files people actually pick by mistake", () => {
		// `metadata.yaml` from the bag directory…
		const yaml = new TextEncoder().encode("rosbag2_bagfile_information:\n");
		expect(looksLikeSqlite(yaml)).toBe(false);
		// …and an .mcap, whose magic is its own.
		const mcap = new Uint8Array([
			0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a, 0, 0, 0, 0, 0, 0, 0,
			0,
		]);
		expect(looksLikeSqlite(mcap)).toBe(false);
	});

	it("rejects a header too short to tell", () => {
		// A truncated read must not pass for a match — the check is what stands
		// between the operator and a gigabyte read that ends in the worker.
		expect(
			looksLikeSqlite(sqliteHead().subarray(0, SQLITE_MAGIC_BYTES - 1)),
		).toBe(false);
		expect(looksLikeSqlite(new Uint8Array(0))).toBe(false);
	});

	it("requires the terminator, not just the words", () => {
		const almost = sqliteHead();
		almost[SQLITE_MAGIC_BYTES - 1] = 0x20;
		expect(looksLikeSqlite(almost)).toBe(false);
	});
});

describe("explainReadFailure", () => {
	it("turns NotReadableError into the three things it actually means", () => {
		const { message, advice } = explainReadFailure(
			new DOMException("could not be read", "NotReadableError"),
			"rosbag2_0.db3",
		);
		expect(message).toContain("rosbag2_0.db3");
		// The browser's own wording ("permission problems") sends people to
		// chmod, which is almost never it. These three are.
		expect(advice).toContain("still being written");
		expect(advice).toContain("Snap");
		expect(advice).toContain("home directory");
	});

	it("names a file that moved as having moved", () => {
		const { message } = explainReadFailure(
			new DOMException("gone", "NotFoundError"),
			"bag.db3",
		);
		expect(message).toContain("no longer where it was");
	});

	it("routes an allocation failure to the filtering advice", () => {
		const { advice } = explainReadFailure(
			new RangeError("Array buffer allocation failed"),
			"huge.db3",
		);
		expect(advice).toContain("ros2 bag convert");
	});

	it("still says something useful for an error it has never seen", () => {
		const { message } = explainReadFailure(new Error("weird"), "bag.db3");
		expect(message).toContain("bag.db3");
		expect(message).toContain("weird");
	});
});

describe("formatBytes", () => {
	it("reads at the scale a person thinks in", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1024 * 1024 * 1024 * 3.1)).toBe("3.1 GB");
		expect(formatBytes(80 * 1024 * 1024)).toBe("80 MB");
	});

	it("does not print nonsense for a size it does not have", () => {
		expect(formatBytes(NaN)).toBe("unknown size");
		expect(formatBytes(-5)).toBe("unknown size");
	});
});
