import { describe, it, expect } from "bun:test";
import {
	buildC2RemoteCalls,
	findC2CallSpec,
	C2Call,
	C2_CALL_SPECS,
} from "./remote-calls";
import { MissionStatusRequest, C2ControlSettings } from "../types/c2-types";

const settings: C2ControlSettings = {
	id: "c2-control-source",
	title: "C2",
	enable: true,
	missionControlUrl: "http://host:5001",
	dbUrl: "http://host:5000",
};

describe("buildC2RemoteCalls", () => {
	it("emits one fully-formed definition per catalog entry", () => {
		const defs = buildC2RemoteCalls(settings);
		expect(defs).toHaveLength(C2_CALL_SPECS.length);
		for (const d of defs) {
			expect(d.datasource_id).toBe("c2-control-source");
			expect(d.source).toBe(settings);
			expect(d.requestType).toBeTruthy();
			expect(d.rawRequestType).toBe("application/json");
			expect(d.responseType).toBeTruthy();
			expect(d.rawResponseType).toBe("application/json");
			expect(d.cancelable).toBe(false);
		}
	});
});

describe("REST mapping (spec.build)", () => {
	it("init: double-serializes mission_config and targets :5001", () => {
		const { url, init } = findC2CallSpec(C2Call.MissionInit)!.build(
			settings,
			{
				mission_id: "m-1",
				mission_config: { mission_id: "m-1", name: "x" },
			},
		);
		expect(url).toBe("http://host:5001/mission_control");
		const body = JSON.parse(String(init.body));
		expect(body.action).toBe("initialize");
		expect(body.mission_id).toBe("m-1");
		expect(typeof body.mission_config).toBe("string"); // double-serialized
		expect(JSON.parse(body.mission_config).name).toBe("x");
	});

	it("approve: change_status with requested_state=APPROVE and no mission_id", () => {
		const { url, init } = findC2CallSpec(C2Call.MissionApprove)!.build(
			settings,
			{},
		);
		expect(url).toBe("http://host:5001/mission_control");
		const body = JSON.parse(String(init.body));
		expect(body.action).toBe("change_status");
		expect(body.requested_state).toBe(MissionStatusRequest.APPROVE);
		expect(body.mission_id).toBeUndefined();
	});

	it("features.list / delete: builds encoded :5000 paths", () => {
		const list = findC2CallSpec(C2Call.FeaturesList)!.build(settings, {
			collectionName: "fea tures",
		});
		expect(list.url).toBe("http://host:5000/map-features/fea%20tures");
		expect(list.init.method).toBe("GET");

		const del = findC2CallSpec(C2Call.FeaturesDelete)!.build(settings, {
			collectionName: "features",
			featureId: "abc/1",
		});
		expect(del.url).toBe(
			"http://host:5000/delete-feature/features/abc%2F1",
		);
		expect(del.init.method).toBe("DELETE");
	});

	it("vehicles.list / missions.list hit :5000", () => {
		expect(
			findC2CallSpec(C2Call.VehiclesList)!.build(settings, {}).url,
		).toBe("http://host:5000/Vehicles");
		expect(
			findC2CallSpec(C2Call.MissionsList)!.build(settings, {}).url,
		).toBe("http://host:5000/missions");
	});
});
