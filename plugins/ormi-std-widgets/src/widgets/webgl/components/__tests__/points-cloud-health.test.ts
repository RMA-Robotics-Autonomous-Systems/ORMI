import { describe, expect, test } from "bun:test";
import type { SelectedTopic } from "@workspace/ormi-core/datasources";
import { offlineCloudSeries } from "../points-cloud-health";

const topic = (name: string, datasource: string) =>
	({
		topic: name,
		type: "PointCloud",
		datasource,
	}) as unknown as SelectedTopic;

describe("offlineCloudSeries", () => {
	const down = (t: SelectedTopic) =>
		(t as unknown as { datasource: string }).datasource === "b";

	test("names only the series on an offline datasource, in order", () => {
		expect(
			offlineCloudSeries(
				[
					{ topic: topic("/front", "a") },
					{ topic: topic("/rear", "b") },
					{ topic: topic("/top", "b") },
				],
				down,
			),
		).toEqual(["/rear", "/top"]);
	});

	test("all online, unbound entries and no topics name nothing", () => {
		expect(
			offlineCloudSeries([{ topic: topic("/front", "a") }], down),
		).toEqual([]);
		expect(offlineCloudSeries([{}], () => true)).toEqual([]);
		expect(offlineCloudSeries(undefined, () => true)).toEqual([]);
	});
});
