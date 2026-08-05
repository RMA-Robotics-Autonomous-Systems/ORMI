import { describe, expect, it } from "bun:test";

import {
	getFeatureName,
	getMissionName,
	publishFeatureNames,
	publishMissionNames,
	shortId,
	subscribe,
} from "./c2-catalog-store";

/**
 * Pure-logic tests for the C2 catalog store (no React). The store is
 * module-level; cases use distinct ids so they don't collide across tests, and
 * publishing the same name again is a documented no-op anyway.
 */

describe("c2-catalog-store", () => {
	describe("shortId", () => {
		it("returns '' for empty/null/undefined", () => {
			expect(shortId("")).toBe("");
			expect(shortId(null)).toBe("");
			expect(shortId(undefined)).toBe("");
		});

		it("returns a short string verbatim", () => {
			expect(shortId("abc")).toBe("abc");
			expect(shortId("12345678")).toBe("12345678");
		});

		it("truncates a long id to the first 8 chars + …", () => {
			expect(shortId("0123456789abcdef")).toBe("01234567…");
		});
	});

	describe("mission names", () => {
		it("publishes then resolves the name", () => {
			publishMissionNames([{ mission_id: "m-alpha", name: "Alpha" }]);
			expect(getMissionName("m-alpha")).toBe("Alpha");
		});

		it("falls back to shortId for an unknown id", () => {
			expect(getMissionName("0123456789-unknown")).toBe("01234567…");
		});

		it("resolves '' for empty/null id", () => {
			expect(getMissionName("")).toBe("");
			expect(getMissionName(null)).toBe("");
			expect(getMissionName(undefined)).toBe("");
		});

		it("ignores rows without a usable name (keeps the prior name)", () => {
			publishMissionNames([{ mission_id: "m-beta", name: "Beta" }]);
			publishMissionNames([{ mission_id: "m-beta" }]);
			expect(getMissionName("m-beta")).toBe("Beta");
		});

		it("is a no-op (no notify) when names are unchanged", () => {
			publishMissionNames([{ mission_id: "m-gamma", name: "Gamma" }]);
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			publishMissionNames([{ mission_id: "m-gamma", name: "Gamma" }]);
			unsubscribe();
			expect(notified).toBe(0);
			expect(getMissionName("m-gamma")).toBe("Gamma");
		});

		it("notifies on a real change", () => {
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			publishMissionNames([{ mission_id: "m-delta", name: "Delta" }]);
			unsubscribe();
			expect(notified).toBe(1);
		});
	});

	describe("feature names", () => {
		it("publishes then resolves the name", () => {
			publishFeatureNames([{ feature_id: "f-alpha", name: "Fence A" }]);
			expect(getFeatureName("f-alpha")).toBe("Fence A");
		});

		it("falls back to shortId for an unknown id", () => {
			expect(getFeatureName("fedcba9876-unknown")).toBe("fedcba98…");
		});

		it("is a no-op (no notify) when names are unchanged", () => {
			publishFeatureNames([{ feature_id: "f-beta", name: "Road B" }]);
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			publishFeatureNames([{ feature_id: "f-beta", name: "Road B" }]);
			unsubscribe();
			expect(notified).toBe(0);
		});
	});

	describe("independence", () => {
		it("feature and mission maps do not cross-resolve", () => {
			publishMissionNames([{ mission_id: "shared-id", name: "Mission" }]);
			publishFeatureNames([{ feature_id: "shared-id", name: "Feature" }]);
			expect(getMissionName("shared-id")).toBe("Mission");
			expect(getFeatureName("shared-id")).toBe("Feature");
		});

		it("a mission id unknown to features falls back to shortId", () => {
			publishMissionNames([
				{ mission_id: "01234567mission", name: "Only Mission" },
			]);
			expect(getFeatureName("01234567mission")).toBe("01234567…");
		});
	});
});
