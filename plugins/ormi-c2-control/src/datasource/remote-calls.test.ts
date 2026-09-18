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
			// `rest.ts` aborts the in-flight fetch on cancel(), so reads and
			// DB writes advertise it. A command does not: aborting the fetch
			// does not un-send a Stop the C2 may already have applied.
			const scope = findC2CallSpec(d.name)!.scope;
			expect(d.cancelable).toBe(scope !== "command");
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

	it("approve: change_status with requested_state=APPROVE", () => {
		const { url, init } = findC2CallSpec(C2Call.MissionApprove)!.build(
			settings,
			{},
		);
		expect(url).toBe("http://host:5001/mission_control");
		const body = JSON.parse(String(init.body));
		expect(body.action).toBe("change_status");
		expect(body.requested_state).toBe(MissionStatusRequest.APPROVE);
	});

	it("names the mission when the caller provides one", () => {
		// The alternative — relying on :5001's "last initialized" global — is
		// empty after a backend restart, so a running mission became
		// unstoppable and the request silently commanded nothing.
		const { init } = findC2CallSpec(C2Call.MissionStop)!.build(settings, {
			mission_id: "m-42",
		});
		const body = JSON.parse(String(init.body));
		expect(body.action).toBe("change_status");
		expect(body.requested_state).toBe(MissionStatusRequest.STOP);
		expect(body.mission_id).toBe("m-42");
	});

	it("sends the trimmed mission_id it validated", () => {
		const stop = findC2CallSpec(C2Call.MissionStop)!;
		expect(stop.validate!({ mission_id: "  m-42 " })).toBeNull();
		const body = JSON.parse(
			String(stop.build(settings, { mission_id: "  m-42 " }).init.body),
		);
		expect(body.mission_id).toBe("m-42");

		const initSpec = findC2CallSpec(C2Call.MissionInit)!;
		const request = { mission_id: " m-1 ", mission_config: { name: "x" } };
		expect(initSpec.validate!(request)).toBeNull();
		const initBody = JSON.parse(
			String(initSpec.build(settings, request).init.body),
		);
		expect(initBody.mission_id).toBe("m-1");
		expect(JSON.parse(initBody.mission_config).mission_id).toBe("m-1");
	});

	it("omits mission_id rather than sending an empty one", () => {
		// The backend falls back to its old behaviour on an absent
		// `mission_id`; an empty string is a different thing and would target a
		// mission called "".
		for (const request of [{}, { mission_id: "" }]) {
			const { init } = findC2CallSpec(C2Call.MissionStop)!.build(
				settings,
				request,
			);
			const body = JSON.parse(String(init.body));
			expect("mission_id" in body).toBe(false);
		}
	});

	it("maps.list / create / delete: registry CRUD on :5000/maps", () => {
		const list = findC2CallSpec(C2Call.MapsList)!.build(settings, {});
		expect(list.url).toBe("http://host:5000/maps");
		expect(list.init.method).toBe("GET");

		const create = findC2CallSpec(C2Call.MapsCreate)!.build(settings, {
			name: "Zone A",
		});
		expect(create.url).toBe("http://host:5000/maps");
		expect(create.init.method).toBe("POST");
		expect(JSON.parse(String(create.init.body))).toEqual({
			name: "Zone A",
		});

		const createCrs = findC2CallSpec(C2Call.MapsCreate)!.build(settings, {
			name: "Zone A",
			crs: "EPSG:4326",
		});
		expect(JSON.parse(String(createCrs.init.body))).toEqual({
			name: "Zone A",
			crs: "EPSG:4326",
		});

		const del = findC2CallSpec(C2Call.MapsDelete)!.build(settings, {
			name: "ma p/1",
		});
		// The backend now requires ?confirm=<name> on a (cascading) map delete.
		expect(del.url).toBe(
			"http://host:5000/maps/ma%20p%2F1?confirm=ma%20p%2F1",
		);
		expect(del.init.method).toBe("DELETE");
	});

	it("map.features.list / add / update / delete: per-map feature CRUD", () => {
		const list = findC2CallSpec(C2Call.MapFeaturesList)!.build(settings, {
			name: "Zone A",
		});
		expect(list.url).toBe("http://host:5000/maps/Zone%20A/features");
		expect(list.init.method).toBe("GET");

		const feature = {
			type: "Feature",
			properties: { feature_type: "road" },
		};
		const add = findC2CallSpec(C2Call.MapFeaturesAdd)!.build(settings, {
			name: "Zone A",
			feature,
		});
		expect(add.url).toBe("http://host:5000/maps/Zone%20A/features");
		expect(add.init.method).toBe("POST");
		expect(JSON.parse(String(add.init.body))).toEqual(feature);

		const upd = findC2CallSpec(C2Call.MapFeaturesUpdate)!.build(settings, {
			name: "Zone A",
			featureId: "abc/1",
			feature,
		});
		expect(upd.url).toBe("http://host:5000/maps/Zone%20A/features/abc%2F1");
		expect(upd.init.method).toBe("PUT");
		expect(JSON.parse(String(upd.init.body))).toEqual(feature);

		const del = findC2CallSpec(C2Call.MapFeaturesDelete)!.build(settings, {
			name: "Zone A",
			featureId: "abc/1",
		});
		expect(del.url).toBe("http://host:5000/maps/Zone%20A/features/abc%2F1");
		expect(del.init.method).toBe("DELETE");
	});

	it("planner.status hits :5000/planner/status", () => {
		const status = findC2CallSpec(C2Call.PlannerStatus)!.build(
			settings,
			{},
		);
		expect(status.url).toBe("http://host:5000/planner/status");
		expect(status.init.method).toBe("GET");
	});

	it("planner.graph hits :5000/planner/graph", () => {
		const graph = findC2CallSpec(C2Call.PlannerGraph)!.build(settings, {});
		expect(graph.url).toBe("http://host:5000/planner/graph");
		expect(graph.init.method).toBe("GET");
	});

	it("vehicles.list / missions.list hit :5000", () => {
		expect(
			findC2CallSpec(C2Call.VehiclesList)!.build(settings, {}).url,
		).toBe("http://host:5000/Vehicles");
		expect(
			findC2CallSpec(C2Call.MissionsList)!.build(settings, {}).url,
		).toBe("http://host:5000/missions");
	});

	it("feedback history reads hit :5000/mission-feedback (GET, no token scope)", () => {
		const latest = findC2CallSpec(C2Call.FeedbackLatest)!;
		expect(latest.scope).toBe("db");
		expect(latest.build(settings, {}).url).toBe(
			"http://host:5000/mission-feedback/latest",
		);
		const one = findC2CallSpec(C2Call.FeedbackGet)!.build(settings, {
			mission_id: "a b/c",
		});
		expect(one.url).toBe("http://host:5000/mission-feedback/a%20b%2Fc");
		expect(one.init.method).toBe("GET");
	});
});
