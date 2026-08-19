/**
 * The channel that carries a worker's refusal to the panels.
 *
 * It is a bare `postMessage` riding the same port as core's RPC, so two things
 * have to hold: the provider must recognise its own message, and it must not
 * mistake core's traffic for one. If either fails the symptom is the one this
 * whole layer exists to remove — a recording that will not play and a screen
 * that does not say so.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	REPLAY_PROBLEM_MESSAGE,
	__resetReplayStatusForTests,
	asReplayProblemMessage,
	clearReplayProblem,
	listReplayProblems,
	setReplayProblem,
	subscribeReplayStatus,
} from "../replay-status";

const problem = (id: string, message = "bad bag") => ({
	datasourceId: id,
	title: "Recording",
	kind: "not-a-bag" as const,
	message,
	advice: "do the thing",
});

beforeEach(() => __resetReplayStatusForTests());

describe("recognising the message", () => {
	it("accepts what the worker posts", () => {
		const got = asReplayProblemMessage({
			type: REPLAY_PROBLEM_MESSAGE,
			kind: "no-emi-topics",
			message: "no EMI topic",
			advice: "check ros2 bag info",
		});
		expect(got?.kind).toBe("no-emi-topics");
		expect(got?.message).toBe("no EMI topic");
	});

	it("ignores core's own RPC traffic", () => {
		// Both ride the same port. Claiming one of these would be worse than
		// missing our own — it would put an RPC frame on screen as an error.
		expect(
			asReplayProblemMessage({ type: "rpc/response", id: "1", ok: true }),
		).toBeNull();
		expect(
			asReplayProblemMessage({ type: "rpc/event", event: "published" }),
		).toBeNull();
		expect(asReplayProblemMessage({ type: "metrics-snapshot" })).toBeNull();
	});

	it("ignores anything that is not a message at all", () => {
		expect(asReplayProblemMessage(null)).toBeNull();
		expect(asReplayProblemMessage(undefined)).toBeNull();
		expect(asReplayProblemMessage("hello")).toBeNull();
		expect(asReplayProblemMessage(42)).toBeNull();
	});

	it("refuses a message of the right type but the wrong shape", () => {
		expect(
			asReplayProblemMessage({ type: REPLAY_PROBLEM_MESSAGE }),
		).toBeNull();
		expect(
			asReplayProblemMessage({ type: REPLAY_PROBLEM_MESSAGE, kind: "x" }),
		).toBeNull();
	});

	it("tolerates a missing advice", () => {
		const got = asReplayProblemMessage({
			type: REPLAY_PROBLEM_MESSAGE,
			kind: "unopenable",
			message: "boom",
		});
		expect(got?.advice).toBe("");
	});
});

describe("the store", () => {
	it("keeps one problem per datasource and notifies", () => {
		let notified = 0;
		const off = subscribeReplayStatus(() => notified++);
		setReplayProblem(problem("ds-1"));
		setReplayProblem(problem("ds-2"));
		expect(listReplayProblems()).toHaveLength(2);
		expect(notified).toBe(2);
		off();
	});

	it("does not re-notify for an unchanged report", () => {
		let notified = 0;
		const off = subscribeReplayStatus(() => notified++);
		setReplayProblem(problem("ds-1"));
		setReplayProblem(problem("ds-1"));
		setReplayProblem(problem("ds-1"));
		// The provider re-reports on every worker restart. A fresh object each
		// time would re-render every EMI panel on the 2 s discovery poll.
		expect(notified).toBe(1);
		off();
	});

	it("notifies when the reason actually changes", () => {
		let notified = 0;
		const off = subscribeReplayStatus(() => notified++);
		setReplayProblem(problem("ds-1", "first"));
		setReplayProblem(problem("ds-1", "second"));
		expect(notified).toBe(2);
		expect(listReplayProblems()).toHaveLength(1);
		off();
	});

	it("hands back an identity-stable array between changes", () => {
		setReplayProblem(problem("ds-1"));
		// `getSnapshot` returning a fresh array per read is an infinite render
		// loop under `useSyncExternalStore`.
		expect(listReplayProblems()).toBe(listReplayProblems());
	});

	it("forgets a problem when the datasource goes away", () => {
		setReplayProblem(problem("ds-1"));
		clearReplayProblem("ds-1");
		expect(listReplayProblems()).toHaveLength(0);
	});

	it("does not notify for clearing something that was never there", () => {
		let notified = 0;
		const off = subscribeReplayStatus(() => notified++);
		clearReplayProblem("never-existed");
		expect(notified).toBe(0);
		off();
	});
});
