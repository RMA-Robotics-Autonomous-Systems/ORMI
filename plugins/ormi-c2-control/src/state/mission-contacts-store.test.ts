import { afterEach, describe, expect, it } from "bun:test";

import { parseMissionContacts } from "../widgets/mission-contacts";
import {
	__resetMissionContactsStore,
	focusContact,
	getMissionContacts,
	getSelectedContact,
	selectContact,
	setMissionContacts,
	setMissionContactsError,
	subscribeContactFocus,
	watchMissionContacts,
	type ContactsRead,
} from "./mission-contacts-store";

const contacts = parseMissionContacts([
	{ mission_id: "m1", uid: "c1", seq: 1, lon: 4.39, lat: 50.84 },
]);

afterEach(() => {
	__resetMissionContactsStore();
});

describe("the contacts store", () => {
	it("holds each mission's last read, keeps it through a failed one, and ignores a repeat", () => {
		expect(getMissionContacts("m1").loaded).toBe(false);
		setMissionContacts("m1", contacts);
		const first = getMissionContacts("m1");
		expect(first.contacts.map((c) => c.uid)).toEqual(["c1"]);
		setMissionContacts(
			"m1",
			parseMissionContacts([
				{ mission_id: "m1", uid: "c1", seq: 1, lon: 4.39, lat: 50.84 },
			]),
		);
		expect(getMissionContacts("m1")).toBe(first); // same content, same snapshot
		setMissionContactsError("m1", "HTTP 500");
		expect(getMissionContacts("m1").contacts).toBe(first.contacts);
		expect(getMissionContacts("m1").error).toBe("HTTP 500");
		setMissionContacts("m1", []); // a resubmit cleared them
		expect(getMissionContacts("m1")).toEqual({
			contacts: [],
			error: null,
			loaded: true,
		});
	});

	it("selects one contact, and focuses with a request each time", () => {
		const seen: number[] = [];
		subscribeContactFocus((request) => seen.push(request.seq));
		selectContact({ missionId: "m1", uid: "c1" });
		expect(getSelectedContact()).toEqual({ missionId: "m1", uid: "c1" });
		expect(seen).toEqual([]);
		focusContact({ missionId: "m1", uid: "c1" });
		focusContact({ missionId: "m1", uid: "c1" });
		expect(seen).toEqual([1, 2]);
		selectContact(null);
		expect(getSelectedContact()).toBeNull();
	});

	it("reads a watched mission once per interval, however many widgets watch it", async () => {
		let reads = 0;
		const read: ContactsRead = async () => {
			reads += 1;
			return { ok: true, contacts };
		};
		const stopMap = watchMissionContacts("m1", read);
		const stopTree = watchMissionContacts("m1", read);
		await Promise.resolve();
		await Promise.resolve();
		// Each watcher asks for a read now; the second finds one in flight.
		expect(reads).toBe(1);
		expect(getMissionContacts("m1").contacts).toHaveLength(1);
		stopMap();
		stopTree();
		// Nobody watches: a read that answers late is dropped.
		setMissionContacts("m2", []);
		const late = watchMissionContacts("m3", async () => ({
			ok: false,
			error: "gone",
		}));
		late();
		await Promise.resolve();
		expect(getMissionContacts("m3").error).toBeNull();
	});

	it("drops a read of a poll that was replaced while it was in flight", async () => {
		let answer: (
			value: Awaited<ReturnType<ContactsRead>>,
		) => void = () => {};
		const slow: ContactsRead = () =>
			new Promise((resolve) => {
				answer = resolve;
			});
		const stopOld = watchMissionContacts("m1", slow);
		stopOld(); // the widget re-bound: a new poll for the same mission
		const stopNew = watchMissionContacts("m1", async () => ({
			ok: true,
			contacts: [],
		}));
		await Promise.resolve();
		await Promise.resolve();
		answer({ ok: true, contacts }); // the old read answers last
		await Promise.resolve();
		await Promise.resolve();
		expect(getMissionContacts("m1").contacts).toEqual([]);
		stopNew();
	});
});
