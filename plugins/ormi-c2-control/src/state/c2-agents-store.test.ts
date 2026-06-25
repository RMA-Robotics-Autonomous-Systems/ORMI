import { describe, expect, it } from "bun:test";

import { getAgentName, publishAgentNames, subscribe } from "./c2-agents-store";

/**
 * Pure-logic tests for the C2 agents store (no React). The store is
 * module-level; cases use distinct ids so they don't collide across tests, and
 * publishing the same name again is a documented no-op anyway.
 */

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

	describe("publishAgentNames", () => {
		it("publishes then resolves the namespace name", () => {
			publishAgentNames([{ agent_id: "a-alpha", name: "Themis_Fr" }]);
			expect(getAgentName("a-alpha")).toBe("Themis_Fr");
		});

		it("ignores empty/whitespace/null names (resolves to shortId — the unset AUTONOMY_TOPIC_PREFIX case)", () => {
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
			publishAgentNames([{ agent_id: "0123456789-empty", name: "" }]);
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
			publishAgentNames([{ agent_id: "0123456789-empty", name: "   " }]);
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
			publishAgentNames([{ agent_id: "0123456789-empty", name: null }]);
			expect(getAgentName("0123456789-empty")).toBe("01234567…");
		});

		it("trims a usable name", () => {
			publishAgentNames([{ agent_id: "a-trim", name: "  Atlas  " }]);
			expect(getAgentName("a-trim")).toBe("Atlas");
		});

		it("retains the prior name when a later blank publish arrives", () => {
			publishAgentNames([{ agent_id: "a-beta", name: "Beta_Bot" }]);
			publishAgentNames([{ agent_id: "a-beta", name: "" }]);
			publishAgentNames([{ agent_id: "a-beta", name: null }]);
			expect(getAgentName("a-beta")).toBe("Beta_Bot");
		});

		it("is a no-op (no notify) when names are unchanged but emits once on a change", () => {
			publishAgentNames([{ agent_id: "a-gamma", name: "Gamma" }]);
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			// Identical publish (the agent_profile topic republishes ~2s) → no emit.
			publishAgentNames([{ agent_id: "a-gamma", name: "Gamma" }]);
			expect(notified).toBe(0);
			// A real change emits exactly once.
			publishAgentNames([{ agent_id: "a-gamma", name: "Gamma2" }]);
			expect(notified).toBe(1);
			unsubscribe();
			expect(getAgentName("a-gamma")).toBe("Gamma2");
		});

		it("does not emit to an unsubscribed listener", () => {
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			unsubscribe();
			publishAgentNames([{ agent_id: "a-delta", name: "Delta" }]);
			expect(notified).toBe(0);
		});
	});
});
