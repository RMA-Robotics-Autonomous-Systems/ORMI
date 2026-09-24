import {
	ConfidenceStatistic,
	FindingEssence,
	essenceLabel,
	isSimulatedEssence,
	type Finding,
	type FindingMeasurement,
} from "./findings";

/**
 * A mission's contacts as the fog keeps them (pure, testable): what the map
 * draws, what the asset tree lists, and what the operator reads when they
 * click one.
 *
 * The fog stores every contact a mission took in RuntimeDB.MissionContacts,
 * one document per contact, and keeps them after the mission ends; `:5000`
 * serves them (`c2.missions.contacts`). So unlike the live `/mission/findings`
 * topic, they survive a page reload and a finished mission, and need nothing
 * but the C2 datasource. A resubmit clears them: they are the last run's.
 *
 * One contact is one sensor's report of one thing (no fusion), plus where it
 * sits in the mission: which step its robot was running, and every On contact
 * visit it got (`taken`).
 */

/** One visit of a contact: an On contact node sent a chain to it. */
export interface ContactVisit {
	/** The agents of the chain that went. */
	agents: string[];
	/** The On contact node that sent them. */
	node: string;
	/** When, ISO 8601 UTC ("" when unknown). */
	at: string;
	/** When, on the mission's run clock (seconds). */
	runS: number;
}

/** One contact of a mission, as stored by the fog. */
export interface MissionContact {
	missionId: string;
	uid: string;
	/** Its place in the mission: 1 = the first contact. */
	seq: number;
	agentId: string;
	/** The graph step its robot was running ("" = none). */
	stepId: string;
	payloadUid: string;
	/** EMI, GPR, … as the payload declared it. */
	modality: string;
	/** `[lng, lat]`. */
	lngLat: [number, number];
	altitude: number;
	/** 1-sigma position uncertainty, metres. */
	sigmaM: number;
	/** 0..1. */
	confidence: number;
	confidenceStatistic: ConfidenceStatistic;
	/** 0..1 — how much the producer is trusted. */
	sourceReliability: number;
	degradedFix: boolean;
	essence: FindingEssence;
	measurements: FindingMeasurement[];
	/** The finding's own stamp, epoch ms (0 = unset). */
	reportedAtMs: number;
	/** When the fog took it, ISO 8601 UTC. */
	foundAt: string;
	/** When the fog took it, on the mission's run clock (seconds). */
	runS: number;
	/** Producing component, e.g. the driver name. */
	source: string;
	/** Detector gate/threshold identity, if any. */
	gateUsed: string;
	visits: ContactVisit[];
}

function num(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: fallback;
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function parseVisit(raw: unknown): ContactVisit | null {
	if (!raw || typeof raw !== "object") return null;
	const v = raw as Record<string, unknown>;
	return {
		agents: Array.isArray(v.agents)
			? v.agents.filter((a): a is string => typeof a === "string")
			: [],
		node: str(v.node),
		at: str(v.at),
		runS: num(v.run_s),
	};
}

function parseMeasurement(raw: unknown): FindingMeasurement | null {
	if (!raw || typeof raw !== "object") return null;
	const m = raw as Record<string, unknown>;
	return {
		quantity: str(m.quantity),
		value: num(m.value),
		unit: str(m.unit),
		sigma: num(m.sigma),
		depth_m: num(m.depth_m),
	};
}

/**
 * Read one stored contact; null when it has no uid or no usable position
 * (nothing could draw or name it).
 *
 * @param raw - One document from `c2.missions.contacts`.
 * @param missionId - The mission it was read for, when the document does not
 *   say.
 * @returns The contact, or null.
 */
export function parseMissionContact(
	raw: unknown,
	missionId = "",
): MissionContact | null {
	if (!raw || typeof raw !== "object") return null;
	const d = raw as Record<string, unknown>;
	const uid = str(d.uid);
	const lon = d.lon;
	const lat = d.lat;
	if (
		!uid ||
		typeof lon !== "number" ||
		typeof lat !== "number" ||
		!Number.isFinite(lon) ||
		!Number.isFinite(lat) ||
		Math.abs(lat) > 90 ||
		Math.abs(lon) > 180
	) {
		return null;
	}
	return {
		missionId: str(d.mission_id) || missionId,
		uid,
		seq: num(d.seq),
		agentId: str(d.agent_id),
		stepId: str(d.step_id),
		payloadUid: str(d.payload_uid),
		modality: str(d.modality),
		lngLat: [lon, lat],
		altitude: num(d.altitude),
		sigmaM: num(d.sigma_m, 1),
		confidence: Math.min(1, Math.max(0, num(d.confidence))),
		confidenceStatistic: num(d.confidence_statistic) as ConfidenceStatistic,
		sourceReliability: num(d.source_reliability),
		degradedFix: d.degraded_fix === true,
		essence: num(d.essence) as FindingEssence,
		measurements: Array.isArray(d.measurements)
			? d.measurements.flatMap((m) => {
					const parsed = parseMeasurement(m);
					return parsed ? [parsed] : [];
				})
			: [],
		reportedAtMs: Math.round(num(d.reported_at_s) * 1000),
		foundAt: str(d.found_at),
		runS: num(d.run_s),
		source: str(d.source),
		gateUsed: str(d.gate_used),
		visits: Array.isArray(d.taken)
			? d.taken.flatMap((v) => {
					const parsed = parseVisit(v);
					return parsed ? [parsed] : [];
				})
			: [],
	};
}

/**
 * Read a `c2.missions.contacts` answer: the contacts in the order they came
 * in (by `seq`), the unusable ones left out.
 *
 * @param data - The response body (an array).
 * @param missionId - The mission they were read for (a document that does not
 *   name its mission is that one's).
 * @returns The contacts.
 */
export function parseMissionContacts(
	data: unknown,
	missionId = "",
): MissionContact[] {
	if (!Array.isArray(data)) return [];
	return data
		.flatMap((raw) => {
			const contact = parseMissionContact(raw, missionId);
			return contact ? [contact] : [];
		})
		.sort((a, b) => a.seq - b.seq);
}

/**
 * The contact as the findings layer's record, so the map draws it in the one
 * findings layer (a live copy from `/mission/findings` has the same uid, and
 * is the same point).
 *
 * @param contact - The stored contact.
 * @returns The finding.
 */
export function contactToFinding(contact: MissionContact): Finding {
	return {
		uid: contact.uid,
		mission_id: contact.missionId,
		stampMs: contact.reportedAtMs,
		essence: contact.essence,
		lngLat: contact.lngLat,
		altitude: contact.altitude,
		supportUids: [],
		confidenceStatistic: contact.confidenceStatistic,
		confidence: contact.confidence,
		sourceReliability: contact.sourceReliability,
		measurements: contact.measurements,
		agent_id: contact.agentId,
		payload_uid: contact.payloadUid,
		source: contact.source,
		gate_used: contact.gateUsed,
		sigmaAtCreation: contact.sigmaM,
		degradedFix: contact.degradedFix,
		supersededBy: "",
		channel: "fog",
	};
}

/**
 * The contact's short name: "Contact 2 · EMI".
 *
 * @param contact - The contact.
 * @returns Its name.
 */
export function contactName(contact: MissionContact): string {
	const modality = contact.modality.startsWith("UNDECLARED:")
		? "undeclared sensor"
		: contact.modality || "sensor";
	return `Contact ${contact.seq || "?"} · ${modality}`;
}

/** One row of a contact's details: a label and what to show. */
export interface ContactFact {
	label: string;
	value: string;
	/** Worth drawing the eye to (not a real finding, a degraded fix). */
	warn?: boolean;
}

/** The names the details use, resolved by the caller (the stores know them). */
export interface ContactNames {
	/** An agent id to its name. */
	agent: (id: string) => string;
	/** A graph node id to its label ("" when not in the graph). */
	node: (id: string) => string;
}

const STATISTIC: Record<number, string> = {
	[ConfidenceStatistic.UNKNOWN]: "basis unknown",
	[ConfidenceStatistic.PROBABILITY]: "probability",
	[ConfidenceStatistic.LIKELIHOOD_RATIO]: "likelihood ratio",
	[ConfidenceStatistic.SCORE]: "score",
	[ConfidenceStatistic.HUMAN_INSTINCT]: "human instinct",
};

function pct(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function clock(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const m = Math.floor(s / 60);
	return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

/** An ISO or epoch-ms time as local HH:MM:SS, or "—". */
export function timeOfDay(at: string | number): string {
	const date = typeof at === "number" ? new Date(at) : new Date(at);
	if ((typeof at === "number" && at <= 0) || Number.isNaN(date.getTime())) {
		return "—";
	}
	return date.toLocaleTimeString([], { hour12: false });
}

function nodeName(names: ContactNames, id: string): string {
	if (!id) return "none";
	return names.node(id) || id;
}

/**
 * Everything about a contact, as rows to read: what was found, by whom and
 * when, where and how well, how much to believe it, and who went to it.
 * The measurements are separate ({@link MissionContact.measurements}): a
 * table, not rows.
 *
 * @param contact - The contact.
 * @param names - Agent and graph-node names.
 * @returns The rows, in reading order.
 */
export function contactFacts(
	contact: MissionContact,
	names: ContactNames,
): ContactFact[] {
	const facts: ContactFact[] = [
		{
			label: "Essence",
			value: essenceLabel(contact.essence),
			warn: isSimulatedEssence(contact.essence),
		},
		{
			label: "Found by",
			value: `${names.agent(contact.agentId) || "unknown agent"} · ${contact.modality || "sensor"}`,
		},
		{ label: "Payload", value: contact.payloadUid || "—" },
		{ label: "During step", value: nodeName(names, contact.stepId) },
		{
			label: "Found at",
			value: `${timeOfDay(contact.foundAt)} · ${clock(contact.runS)} into the run`,
		},
		{ label: "Reported at", value: timeOfDay(contact.reportedAtMs) },
		{
			label: "Position",
			value: `${contact.lngLat[1].toFixed(7)}, ${contact.lngLat[0].toFixed(7)}${contact.altitude ? ` · alt ${contact.altitude.toFixed(1)} m` : ""}`,
		},
		{
			label: "Uncertainty",
			value: `± ${contact.sigmaM.toFixed(2)} m (1σ)${contact.degradedFix ? " · degraded fix" : ""}`,
			warn: contact.degradedFix,
		},
		{
			label: "Confidence",
			value: `${pct(contact.confidence)} (${STATISTIC[contact.confidenceStatistic] ?? "basis unknown"})`,
		},
		{ label: "Source reliability", value: pct(contact.sourceReliability) },
	];
	if (contact.source) facts.push({ label: "Source", value: contact.source });
	if (contact.gateUsed)
		facts.push({ label: "Gate", value: contact.gateUsed });
	facts.push({
		label: "Visited",
		value:
			contact.visits.length === 0
				? "not yet"
				: contact.visits
						.map(
							(visit) =>
								`${visit.agents.map(names.agent).join(", ") || "?"} via ${nodeName(names, visit.node)} at ${timeOfDay(visit.at)}`,
						)
						.join("; "),
	});
	facts.push({ label: "Id", value: contact.uid });
	return facts;
}

/**
 * The findings to draw for a mission: the live ones, plus its stored
 * contacts. A contact on both is drawn once, as stored, but keeping what only
 * the live copy can know — its support and its supersession: a withdrawn
 * contact must not come back as standing because the fog's record of it
 * arrived.
 *
 * @param live - Findings from the topics, already scoped to the mission.
 * @param contacts - The mission's stored contacts.
 * @returns The findings, stored contacts last.
 */
export function withMissionContacts(
	live: readonly Finding[],
	contacts: readonly MissionContact[],
): readonly Finding[] {
	if (contacts.length === 0) return live;
	const liveByUid = new Map(live.map((finding) => [finding.uid, finding]));
	const stored = new Set(contacts.map((contact) => contact.uid));
	return [
		...live.filter((finding) => !stored.has(finding.uid)),
		...contacts.map((contact) => {
			const finding = contactToFinding(contact);
			const copy = liveByUid.get(contact.uid);
			return copy
				? {
						...finding,
						supportUids: copy.supportUids,
						supersededBy: copy.supersededBy,
					}
				: finding;
		}),
	];
}
