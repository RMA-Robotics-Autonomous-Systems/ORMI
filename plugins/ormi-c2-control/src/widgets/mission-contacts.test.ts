import { describe, expect, it } from "bun:test";

import { FindingEssence, findingKind, type Finding } from "./findings";
import {
	contactFacts,
	contactName,
	contactToFinding,
	parseMissionContacts,
	withMissionContacts,
} from "./mission-contacts";

/** A document as `:5000/missions/<id>/contacts` returns it. */
function stored(overrides: Record<string, unknown> = {}) {
	return {
		mission_id: "m1",
		uid: "c1",
		seq: 1,
		agent_id: "ge",
		step_id: "sweep",
		payload_uid: "PL-GE-EMI",
		modality: "EMI",
		lon: 4.3916,
		lat: 50.8442,
		altitude: 0,
		sigma_m: 0.5,
		confidence: 0.7,
		confidence_statistic: 1,
		source_reliability: 0.9,
		degraded_fix: false,
		essence: 2,
		measurements: [
			{
				quantity: "apparent_conductivity",
				value: 27.5,
				unit: "mS/m",
				sigma: 2.5,
				depth_m: 0.1,
			},
		],
		reported_at_s: 1790244712.5,
		found_at: "2026-09-24T10:00:00.000Z",
		run_s: 42.4,
		source: "sim-emi",
		gate_used: "",
		taken: [],
		...overrides,
	};
}

const names = {
	agent: (id: string) => ({ ge: "Themis_Ge", es: "Themis_Es" })[id] ?? id,
	node: (id: string) => ({ sweep: "Coverage", oc: "On contact" })[id] ?? "",
};

describe("a mission's stored contacts", () => {
	it("reads them in the order they came in, leaving out what cannot be placed", () => {
		const out = parseMissionContacts([
			stored({ uid: "c2", seq: 2 }),
			stored({ uid: "c1", seq: 1 }),
			stored({ uid: "", seq: 3 }),
			stored({ uid: "c4", seq: 4, lat: 91 }),
			stored({ uid: "c5", seq: 5, lon: "4.39" }),
			null,
		]);
		expect(out.map((c) => c.uid)).toEqual(["c1", "c2"]);
		expect(parseMissionContacts({ not: "an array" })).toEqual([]);
	});

	it("keeps the whole report and every visit", () => {
		const [contact] = parseMissionContacts([
			stored({
				taken: [
					{
						agents: ["es"],
						node: "oc",
						at: "2026-09-24T10:00:05.000Z",
						run_s: 47,
					},
					{ bad: true },
				],
			}),
		]);
		expect(contact?.lngLat).toEqual([4.3916, 50.8442]);
		expect(contact?.reportedAtMs).toBe(1790244712500);
		expect(contact?.measurements[0]?.unit).toBe("mS/m");
		expect(contact?.essence).toBe(FindingEssence.SIMULATED);
		expect(contact?.visits).toEqual([
			{
				agents: ["es"],
				node: "oc",
				at: "2026-09-24T10:00:05.000Z",
				runS: 47,
			},
			{ agents: [], node: "", at: "", runS: 0 },
		]);
	});

	it("is a contact on the findings layer, of its mission, from the fog", () => {
		const [contact] = parseMissionContacts([stored()]);
		const finding = contactToFinding(contact!);
		expect(finding.mission_id).toBe("m1");
		expect(finding.channel).toBe("fog");
		expect(findingKind(finding)).toBe("contact");
		expect(finding.lngLat).toEqual([4.3916, 50.8442]);
	});

	it("replaces a live copy of the same contact, and keeps the other live ones", () => {
		const contacts = parseMissionContacts([stored()]);
		const live = [
			{ ...contactToFinding(contacts[0]!), channel: "observation" },
			{
				...contactToFinding(contacts[0]!),
				uid: "other",
				channel: "observation",
			},
		] as Finding[];
		const out = withMissionContacts(live, contacts);
		expect(out.map((f) => [f.uid, f.channel])).toEqual([
			["other", "observation"],
			["c1", "fog"],
		]);
		expect(withMissionContacts(live, [])).toBe(live);
	});

	it("keeps what only the live copy knows: a withdrawn contact stays withdrawn", () => {
		const contacts = parseMissionContacts([stored()]);
		const live = [
			{
				...contactToFinding(contacts[0]!),
				supersededBy: "c9",
				supportUids: ["s1"],
			},
		] as Finding[];
		const [drawn] = withMissionContacts(live, contacts);
		expect(drawn?.channel).toBe("fog");
		expect(drawn?.supersededBy).toBe("c9");
		expect(drawn?.supportUids).toEqual(["s1"]);
	});

	it("belongs to the mission it was read for when the document does not say", () => {
		const [contact] = parseMissionContacts(
			[stored({ mission_id: undefined })],
			"m7",
		);
		expect(contact?.missionId).toBe("m7");
		expect(parseMissionContacts([stored()], "m7")[0]?.missionId).toBe("m1");
	});

	it("is named by its place and its sensor", () => {
		const [emi, undeclared] = parseMissionContacts([
			stored({ seq: 2 }),
			stored({ uid: "c3", seq: 3, modality: "UNDECLARED:PL-X" }),
		]);
		expect(contactName(emi!)).toBe("Contact 2 · EMI");
		expect(contactName(undeclared!)).toBe("Contact 3 · undeclared sensor");
	});

	it("says who found it, during which step, how well, and who went to it", () => {
		const [contact] = parseMissionContacts([
			stored({
				degraded_fix: true,
				taken: [
					{
						agents: ["es"],
						node: "oc",
						at: "2026-09-24T10:00:05.000Z",
						run_s: 47,
					},
				],
			}),
		]);
		const facts = Object.fromEntries(
			contactFacts(contact!, names).map((f) => [f.label, f]),
		);
		expect(facts["Essence"]).toEqual({
			label: "Essence",
			value: "SIMULATED",
			warn: true,
		});
		expect(facts["Found by"]?.value).toBe("Themis_Ge · EMI");
		expect(facts["During step"]?.value).toBe("Coverage");
		expect(facts["Found at"]?.value).toContain("42 s into the run");
		expect(facts["Position"]?.value).toBe("50.8442000, 4.3916000");
		expect(facts["Uncertainty"]?.warn).toBe(true);
		expect(facts["Confidence"]?.value).toBe("70% (probability)");
		expect(facts["Source reliability"]?.value).toBe("90%");
		expect(facts["Source"]?.value).toBe("sim-emi");
		expect(facts["Gate"]).toBeUndefined(); // none reported: no row
		expect(facts["Visited"]?.value).toStartWith(
			"Themis_Es via On contact at ",
		);
		expect(facts["Id"]?.value).toBe("c1");
	});

	it("names a step that is no longer in the graph by its id, and none as none", () => {
		const [gone, none] = parseMissionContacts([
			stored({ step_id: "deleted-node" }),
			stored({ uid: "c2", seq: 2, step_id: "" }),
		]);
		const step = (c: typeof gone) =>
			contactFacts(c!, names).find((f) => f.label === "During step")
				?.value;
		expect(step(gone)).toBe("deleted-node");
		expect(step(none)).toBe("none");
		expect(
			contactFacts(none!, names).find((f) => f.label === "Visited")
				?.value,
		).toBe("not yet");
	});
});
