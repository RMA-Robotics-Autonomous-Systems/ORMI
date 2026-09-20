import { describe, expect, it } from "bun:test";

import { uuidToString } from "./uuid";

/**
 * `SwarmLog.mission_id` is a `unique_identifier_msgs/UUID`, not a
 * string. It must convert to the same string the C2 prints with
 * `convertByteArrayToString` (boost `to_string`: the 16 bytes in order, hex,
 * lowercase, 8-4-4-4-12).
 */

const BYTES = [
	0x3f, 0x2a, 0x9c, 0x10, 0x5b, 0x7e, 0x4d, 0x21, 0x8a, 0x0b, 0xc4, 0xde,
	0xf0, 0x12, 0x34, 0x56,
];
const CANONICAL = "3f2a9c10-5b7e-4d21-8a0b-c4def0123456";

/** Base64 of {@link BYTES}, as rosbridge encodes a `uint8[]`. */
const BASE64 = btoa(String.fromCharCode(...BYTES));

describe("uuidToString", () => {
	it("converts a { uuid: number[] } message", () => {
		expect(uuidToString({ uuid: BYTES })).toBe(CANONICAL);
	});

	it("converts a { uuid: Uint8Array } message (CDR / foxglove decoding)", () => {
		expect(uuidToString({ uuid: new Uint8Array(BYTES) })).toBe(CANONICAL);
	});

	it("converts a base64 uuid (rosbridge)", () => {
		expect(BASE64).toHaveLength(24);
		expect(uuidToString({ uuid: BASE64 })).toBe(CANONICAL);
	});

	it("converts a bare byte array", () => {
		expect(uuidToString(BYTES)).toBe(CANONICAL);
	});

	it("normalises a string UUID to lowercase, with or without hyphens", () => {
		expect(uuidToString(CANONICAL.toUpperCase())).toBe(CANONICAL);
		expect(uuidToString(CANONICAL.replace(/-/g, ""))).toBe(CANONICAL);
		expect(uuidToString(`  ${CANONICAL} `)).toBe(CANONICAL);
	});

	it("keeps a non-UUID string id unchanged", () => {
		expect(uuidToString("mission-1")).toBe("mission-1");
	});

	it("keeps leading zero bytes (pads every byte to two digits)", () => {
		const zeros = new Array(16).fill(0);
		zeros[15] = 1;
		expect(uuidToString({ uuid: zeros })).toBe(
			"00000000-0000-0000-0000-000000000001",
		);
	});

	it("rejects what cannot be an id", () => {
		expect(uuidToString(null)).toBeNull();
		expect(uuidToString(undefined)).toBeNull();
		expect(uuidToString("")).toBeNull();
		expect(uuidToString({ uuid: [1, 2, 3] })).toBeNull();
		expect(uuidToString({ uuid: [...BYTES.slice(0, 15), 256] })).toBeNull();
		expect(uuidToString(42)).toBeNull();
		expect(uuidToString({})).toBeNull();
	});
});
