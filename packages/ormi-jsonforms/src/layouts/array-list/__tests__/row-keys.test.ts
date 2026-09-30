import { describe, expect, it } from "bun:test";

import {
	moveRowKey,
	nextRowKey,
	reconcileRowKeys,
	removeRowKey,
} from "../row-keys";

describe("row keys", () => {
	it("mints one past the largest key, deterministically", () => {
		expect(nextRowKey([])).toBe(0);
		expect(nextRowKey([4, 1, 2])).toBe(5);
	});

	it("reconciles by length and returns the same array when it fits", () => {
		const keys = [0, 1];
		expect(reconcileRowKeys(keys, 2)).toBe(keys);
		expect(reconcileRowKeys(keys, 4)).toEqual([0, 1, 2, 3]);
		expect(reconcileRowKeys([3, 0, 7], 1)).toEqual([3]);
	});

	it("an add handler and a reconciliation agree on the new key", () => {
		const keys = [2, 0];
		const added = [...keys, nextRowKey(keys)];
		expect(reconcileRowKeys(keys, 3)).toEqual(added);
	});

	it("moves a key with its row and refuses to leave the list", () => {
		expect(moveRowKey([0, 1, 2], 1, -1)).toEqual([1, 0, 2]);
		expect(moveRowKey([0, 1, 2], 1, 1)).toEqual([0, 2, 1]);
		const keys = [0, 1];
		expect(moveRowKey(keys, 0, -1)).toBe(keys);
		expect(moveRowKey(keys, 1, 1)).toBe(keys);
	});

	it("removes the key of the removed row only", () => {
		expect(removeRowKey([5, 6, 7], 1)).toEqual([5, 7]);
	});
});
