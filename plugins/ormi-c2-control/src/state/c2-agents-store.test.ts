import { describe, expect, it } from "bun:test";

import {
	getAgentName,
	getAgentRecord,
	getAgentsSnapshot,
	publishAgentProfiles,
	subscribe,
} from "./c2-agents-store";

/**
 * Pure-logic tests for the C2 agents store (no React). The store is
 * module-level; cases use distinct ids so they don't collide across tests, and
 * publishing the same profile again is a documented no-op anyway.
 */

const source = (id: string) => ({ id, title: id, enable: true });

describe("c2-agents-store", () => {
	describe("getAgentName", () => {
		it("falls back to shortId for an unknown id", () => {
			expect(getAgentName("0123456789-unknown")).toBe("01234567…");
		});

		it("resolves '' for empty/null/undefined id", () => {
			expect(getAgentName("")).toBe("");
			expect(getAgentName(null)).toBe("");
			expect(getAgentName(undefined)).toBe("");
		});
	});

	describe("publishAgentProfiles", () => {
		it("publishes then resolves the namespace name", () => {
			publishAgentProfiles([
				{
					agent_id: "a-alpha",
					namespace: "Themis_Fr",
					name: "Themis_Fr",
				},
			]);
			expect(getAgentName("a-alpha")).toBe("Themis_Fr");
			expect(getAgentRecord("a-alpha")?.namespace).toBe("Themis_Fr");
		});

		it("ignores empty/whitespace/null names (resolves to shortId)", () => {
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
			publishAgentProfiles([{ agent_id: "0123456789-empty", name: "" }]);
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
			publishAgentProfiles([
				{ agent_id: "0123456789-empty", name: "   " },
			]);
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
			publishAgentProfiles([
				{ agent_id: "0123456789-empty", name: null },
			]);
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
		});

		it("trims a usable namespace into the resolved name", () => {
			publishAgentProfiles([
				{ agent_id: "a-trim", namespace: "  Atlas  " },
			]);
			expect(getAgentName("a-trim")).toBe("Atlas");
		});

		it("retains the prior name when a later blank publish arrives", () => {
			publishAgentProfiles([
				{ agent_id: "a-beta", namespace: "Beta_Bot" },
			]);
			publishAgentProfiles([{ agent_id: "a-beta", namespace: "" }]);
			publishAgentProfiles([{ agent_id: "a-beta", namespace: null }]);
			expect(getAgentName("a-beta")).toBe("Beta_Bot");
			expect(getAgentRecord("a-beta")?.namespace).toBe("Beta_Bot");
		});

		it("is a no-op (no notify) when unchanged but emits once on a change", () => {
			publishAgentProfiles([
				{
					agent_id: "a-gamma",
					namespace: "Gamma",
					source: source("d1"),
				},
			]);
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			// Identical publish (the agent_profile topic republishes ~2s) → no emit.
			publishAgentProfiles([
				{
					agent_id: "a-gamma",
					namespace: "Gamma",
					source: source("d1"),
				},
			]);
			expect(notified).toBe(0);
			// A real change emits exactly once.
			publishAgentProfiles([
				{
					agent_id: "a-gamma",
					namespace: "Gamma2",
					source: source("d1"),
				},
			]);
			expect(notified).toBe(1);
			unsubscribe();
			expect(getAgentName("a-gamma")).toBe("Gamma2");
		});

		it("compares source BY id (fresh settings object is still a no-op)", () => {
			publishAgentProfiles([
				{ agent_id: "a-src", namespace: "Src", source: source("ds-x") },
			]);
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			// New object, same id → no change.
			publishAgentProfiles([
				{ agent_id: "a-src", namespace: "Src", source: source("ds-x") },
			]);
			expect(notified).toBe(0);
			// Different id → one emit.
			publishAgentProfiles([
				{ agent_id: "a-src", namespace: "Src", source: source("ds-y") },
			]);
			expect(notified).toBe(1);
			unsubscribe();
			expect(getAgentRecord("a-src")?.source?.id).toBe("ds-y");
		});

		it("does not clear a known source on a source-less republish", () => {
			publishAgentProfiles([
				{
					agent_id: "a-keep",
					namespace: "Keep",
					source: source("ds-1"),
				},
			]);
			publishAgentProfiles([{ agent_id: "a-keep", namespace: "Keep" }]);
			expect(getAgentRecord("a-keep")?.source?.id).toBe("ds-1");
		});

		it("does not emit to an unsubscribed listener", () => {
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			unsubscribe();
			publishAgentProfiles([{ agent_id: "a-delta", namespace: "Delta" }]);
			expect(notified).toBe(0);
		});
	});

	describe("roster snapshot reference stability", () => {
		it("returns the same reference across identical re-publishes", () => {
			publishAgentProfiles([
				{ agent_id: "snap-1", namespace: "S1", source: source("d") },
			]);
			const first = getAgentsSnapshot();
			// Identical republish → no change → same array reference.
			publishAgentProfiles([
				{ agent_id: "snap-1", namespace: "S1", source: source("d") },
			]);
			expect(getAgentsSnapshot()).toBe(first);
		});

		it("returns a new reference only on a real change", () => {
			const before = getAgentsSnapshot();
			publishAgentProfiles([
				{ agent_id: "snap-2", namespace: "S2", source: source("d") },
			]);
			const after = getAgentsSnapshot();
			expect(after).not.toBe(before);
			// And the new agent is present, sorted by agent_id.
			expect(after.some((r) => r.agent_id === "snap-2")).toBe(true);
			const ids = after.map((r) => r.agent_id);
			expect([...ids]).toEqual(
				[...ids].sort((a, b) => a.localeCompare(b)),
			);
		});
	});
});
