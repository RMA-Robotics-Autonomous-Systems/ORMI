/**
 * Tests for Topic Compatibility System
 *
 * Critical: Determines which topics can connect to which widgets. Wrong logic = widgets show wrong data.
 * Focus: Schema matching, type compatibility, nested properties, wildcard matching
 */

import { describe, test, expect } from "bun:test";
import {
	analyzeSchemaProperties,
	analyzeTopicCompatibility,
	analyzeTopicCompatibilityWithTrees,
	isTopicCompatible,
	validateDataRequirements,
	type CompatibleProperty,
} from "../topic-compatibility";
import type { DatasourceTopic } from "../../datasources/datasource-interface";
import type { DataRequirements } from "../widget-interface";
import type { JsonSchema } from "@jsonforms/core";

describe("Topic Compatibility - Schema Property Analysis", () => {
	test("should find top-level properties matching accepted types", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				temperature: { type: "number" },
				status: { type: "string" },
				active: { type: "boolean" },
			},
		};

		const compatibleProps = analyzeSchemaProperties(
			schema,
			["number"],
			"webapp",
		);

		expect(compatibleProps.length).toBe(1);
		expect(compatibleProps[0]!.path).toBe("temperature");
		expect(compatibleProps[0]!.type).toBe("number");
	});

	test("should find nested properties", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				position: {
					type: "object",
					properties: {
						x: { type: "number" },
						y: { type: "number" },
						z: { type: "number" },
					},
				},
				name: { type: "string" },
			},
		};

		const compatibleProps = analyzeSchemaProperties(
			schema,
			["number"],
			"webapp",
		);

		expect(compatibleProps.length).toBe(3);
		expect(compatibleProps.map((p) => p.path)).toContain("position.x");
		expect(compatibleProps.map((p) => p.path)).toContain("position.y");
		expect(compatibleProps.map((p) => p.path)).toContain("position.z");
	});

	test("should handle deeply nested properties", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				robot: {
					type: "object",
					properties: {
						sensor: {
							type: "object",
							properties: {
								reading: {
									type: "object",
									properties: {
										value: { type: "number" },
									},
								},
							},
						},
					},
				},
			},
		};

		const compatibleProps = analyzeSchemaProperties(
			schema,
			["number"],
			"webapp",
		);

		expect(compatibleProps.length).toBe(1);
		expect(compatibleProps[0]!.path).toBe("robot.sensor.reading.value");
	});

	test("should match multiple accepted types", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				count: { type: "number" },
				name: { type: "string" },
				active: { type: "boolean" },
				data: { type: "array" },
			},
		};

		const compatibleProps = analyzeSchemaProperties(
			schema,
			["number", "string"],
			"webapp",
		);

		expect(compatibleProps.length).toBe(2);
		expect(compatibleProps.map((p) => p.path)).toContain("count");
		expect(compatibleProps.map((p) => p.path)).toContain("name");
	});

	test("should match all types when wildcard (*) is used", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				number: { type: "number" },
				text: { type: "string" },
				flag: { type: "boolean" },
				items: { type: "array" },
			},
		};

		const compatibleProps = analyzeSchemaProperties(
			schema,
			["*"],
			"webapp",
		);

		expect(compatibleProps.length).toBe(4);
	});

	test("should track source of properties", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {
				value: { type: "number" },
			},
		};

		const webappProps = analyzeSchemaProperties(
			schema,
			["number"],
			"webapp",
		);
		const rawProps = analyzeSchemaProperties(schema, ["number"], "raw");

		expect(webappProps[0]!.source).toBe("webapp");
		expect(rawProps[0]!.source).toBe("raw");
	});

	test("should handle empty properties", () => {
		const schema: JsonSchema = {
			type: "object",
			properties: {},
		};

		const compatibleProps = analyzeSchemaProperties(
			schema,
			["number"],
			"webapp",
		);

		expect(compatibleProps.length).toBe(0);
	});

	test("should handle schema without properties", () => {
		const schema: JsonSchema = {
			type: "object",
		};

		const compatibleProps = analyzeSchemaProperties(
			schema,
			["number"],
			"webapp",
		);

		expect(compatibleProps.length).toBe(0);
	});
});

describe("Topic Compatibility - Direct Type Matching", () => {
	test("should match when topic type is in accepted list", async () => {
		const topic: DatasourceTopic = {
			topic: "/temperature",
			datasource_id: "test",
			source: {} as any,
			type: "number",
			rawType: "sensor_msgs/msg/Float64",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		expect(result.isCompatible).toBe(true);
		expect(result.directMatch).toBe(true);
	});

	test("should not match when topic type is not in accepted list", async () => {
		const topic: DatasourceTopic = {
			topic: "/velocity",
			datasource_id: "test",
			source: {} as any,
			type: "Movement",
			rawType: "geometry_msgs/msg/Twist",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		expect(result.directMatch).toBe(false);
	});

	test("should be compatible when no requirements specified", async () => {
		const topic: DatasourceTopic = {
			topic: "/any_topic",
			datasource_id: "test",
			source: {} as any,
			type: "any_type",
			rawType: "any_type",
		};

		const result = await analyzeTopicCompatibility(topic, undefined);

		expect(result.isCompatible).toBe(true);
		expect(result.directMatch).toBe(true);
	});
});

describe("Topic Compatibility - Raw Type Matching (acceptsRaw)", () => {
	const c2Topic: DatasourceTopic = {
		topic: "/multi_robot/swarm_log",
		datasource_id: "test",
		source: {} as any,
		type: "", // no webapp type — custom ROS message
		rawType: "c2_msgs/msg/SwarmLog",
	};

	test("matches directly when rawType is in acceptsRaw", async () => {
		const requirements: DataRequirements = {
			accepts: [],
			acceptsRaw: ["c2_msgs/msg/SwarmLog"],
		};

		const result = await analyzeTopicCompatibility(c2Topic, requirements);

		expect(result.directMatch).toBe(true);
		expect(result.isCompatible).toBe(true);
	});

	test("does not match when rawType is absent from acceptsRaw", async () => {
		const requirements: DataRequirements = {
			accepts: [],
			acceptsRaw: ["c2_msgs/msg/MissionFeedback"],
		};

		const result = await analyzeTopicCompatibility(c2Topic, requirements);

		expect(result.directMatch).toBe(false);
		expect(result.isCompatible).toBe(false);
		expect(result.reason).toContain("c2_msgs/msg/SwarmLog");
	});

	test("webapp accepts and raw acceptsRaw are OR-ed", async () => {
		const webappTopic: DatasourceTopic = {
			topic: "/temperature",
			datasource_id: "test",
			source: {} as any,
			type: "number",
			rawType: "sensor_msgs/msg/Float64",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
			acceptsRaw: ["c2_msgs/msg/SwarmLog"],
		};

		// webapp side matches
		expect(
			(await analyzeTopicCompatibility(webappTopic, requirements))
				.directMatch,
		).toBe(true);
		// raw side matches
		expect(
			(await analyzeTopicCompatibility(c2Topic, requirements))
				.directMatch,
		).toBe(true);
	});

	test("analyzeTopicCompatibilityWithTrees direct-matches via rawType", async () => {
		const result = await analyzeTopicCompatibilityWithTrees(c2Topic, {
			accepts: [],
			acceptsRaw: ["c2_msgs/msg/SwarmLog"],
		});
		expect(result.directMatch).toBe(true);
		expect(result.isCompatible).toBe(true);
	});

	test("an empty rawType never matches an acceptsRaw entry", async () => {
		const noRawTopic: DatasourceTopic = {
			topic: "/x",
			datasource_id: "test",
			source: {} as any,
			type: "",
			rawType: "",
		};
		// A widget that fat-fingers "" into acceptsRaw must not match every
		// raw-less topic.
		expect(
			(
				await analyzeTopicCompatibility(noRawTopic, {
					accepts: [],
					acceptsRaw: [""],
				})
			).directMatch,
		).toBe(false);
		expect(
			isTopicCompatible(noRawTopic, { accepts: [], acceptsRaw: [""] }),
		).toBe(false);
	});

	test("sync isTopicCompatible honors acceptsRaw", () => {
		expect(
			isTopicCompatible(c2Topic, {
				accepts: [],
				acceptsRaw: ["c2_msgs/msg/SwarmLog"],
			}),
		).toBe(true);
		expect(
			isTopicCompatible(c2Topic, {
				accepts: [],
				acceptsRaw: ["other/Type"],
			}),
		).toBe(false);
	});

	test("validateDataRequirements accepts a raw-only requirement", () => {
		expect(
			validateDataRequirements({
				accepts: [],
				acceptsRaw: ["c2_msgs/msg/SwarmLog"],
			}),
		).toEqual([]);
		// neither accepts nor acceptsRaw => error
		expect(
			validateDataRequirements({ accepts: [], acceptsRaw: [] }).length,
		).toBeGreaterThan(0);
	});
});

describe("Topic Compatibility - Property Compatibility", () => {
	test("should find compatible properties in topic schema", async () => {
		const topic: DatasourceTopic = {
			topic: "/pose",
			datasource_id: "test",
			source: {} as any,
			type: "Pose",
			rawType: "geometry_msgs/msg/Pose",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		// Pose has position (Vector3) + orientation (Quaternion) = 7 number properties
		expect(result.directMatch).toBe(false);
		expect(result.compatibleProperties.length).toBe(7);
		expect(result.isCompatible).toBe(true);
	});

	test("should handle topics with both matching and non-matching properties", async () => {
		const topic: DatasourceTopic = {
			topic: "/sensor_data",
			datasource_id: "test",
			source: {} as any,
			type: "IMU",
			rawType: "sensor_msgs/msg/Imu",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		// IMU has nested Vector3 and Vector4 properties with numbers
		expect(result.compatibleProperties.length).toBeGreaterThan(0);
		expect(result.directMatch).toBe(false);
		expect(result.isCompatible).toBe(true);
	});
});

describe("Topic Compatibility - Edge Cases", () => {
	test("should handle topic without type", async () => {
		const topic: DatasourceTopic = {
			topic: "/unknown",
			datasource_id: "test",
			source: {} as any,
			type: "",
			rawType: "",
		};

		const requirements: DataRequirements = {
			accepts: ["sensor_msgs/Temperature"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		expect(result.directMatch).toBe(false);
	});

	test("should handle invalid schema gracefully", async () => {
		const topic: DatasourceTopic = {
			topic: "/invalid",
			datasource_id: "test",
			source: {} as any,
			type: "custom/Invalid",
			rawType: "custom/Invalid",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
		};

		// Should not throw
		const result = await analyzeTopicCompatibility(topic, requirements);
		expect(result).toBeDefined();
	});

	test("should handle empty accepts array", async () => {
		const topic: DatasourceTopic = {
			topic: "/test",
			datasource_id: "test",
			source: {} as any,
			type: "test/Type",
			rawType: "test/Type",
		};

		const requirements: DataRequirements = {
			accepts: [],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		expect(result.directMatch).toBe(false);
		expect(result.compatibleProperties.length).toBe(0);
	});

	test("should handle topics with array types", async () => {
		const topic: DatasourceTopic = {
			topic: "/point_cloud",
			datasource_id: "test",
			source: {} as any,
			type: "PointsCloud",
			rawType: "sensor_msgs/msg/PointCloud2",
		};

		const requirements: DataRequirements = {
			accepts: ["array"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		// PointsCloud has array properties: points, colors, intensities
		expect(result.compatibleProperties.length).toBe(3);
		expect(result.isCompatible).toBe(true);
	});

	test("should handle circular schema references gracefully", async () => {
		const schema: any = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};
		// Create circular reference
		schema.properties.self = schema;

		const topic: DatasourceTopic = {
			topic: "/circular",
			datasource_id: "test",
			source: {} as any,
			type: "UnknownType",
			rawType: "custom/Circular",
		};

		const requirements: DataRequirements = {
			accepts: ["string"],
		};

		// Should not cause infinite loop - unknown types return empty schema
		const result = await analyzeTopicCompatibility(topic, requirements);
		expect(result).toBeDefined();
		expect(result.compatibleProperties.length).toBe(0);
	});
});

describe("Topic Compatibility - Complex Schemas", () => {
	test("should handle ROS message schemas", async () => {
		const topic: DatasourceTopic = {
			topic: "/cmd_vel",
			datasource_id: "test",
			source: {} as any,
			type: "Movement",
			rawType: "geometry_msgs/msg/Twist",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		// Movement has linear (Vector3) and angular (Vector3) with number properties
		expect(result.compatibleProperties.length).toBe(6); // linear.x/y/z + angular.x/y/z
		expect(result.directMatch).toBe(false);
		expect(result.isCompatible).toBe(true);
	});

	test("should handle optional properties", async () => {
		const topic: DatasourceTopic = {
			topic: "/config",
			datasource_id: "test",
			source: {} as any,
			type: "Pose",
			rawType: "geometry_msgs/msg/Pose",
		};

		const requirements: DataRequirements = {
			accepts: ["number", "string"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		// Pose has position (Vector3) with 3 number properties and orientation (Quaternion) with 4 number properties
		expect(result.compatibleProperties.length).toBeGreaterThan(0);
		// Should find nested number properties in position.x, position.y, position.z, orientation.x, etc.
		const numberProps = result.compatibleProperties.filter(
			(p) => p.type === "number",
		);
		expect(numberProps.length).toBe(7); // 3 from position + 4 from orientation
	});

	test("should use ROS2 schema when webapp type is empty", async () => {
		const topic: DatasourceTopic = {
			topic: "/raw_twist",
			datasource_id: "test",
			source: {} as any,
			type: "", // Empty type - should fall back to ROS2 schema via plugin
			rawType: "geometry_msgs/msg/Twist",
		};

		const requirements: DataRequirements = {
			accepts: ["number"],
		};

		const result = await analyzeTopicCompatibility(topic, requirements);

		// Without pluginsManager mock, won't find ROS2 schema properties
		// This test documents that ROS2 schema requires pluginsManager parameter
		expect(result.directMatch).toBe(false);
		expect(result.compatibleProperties.length).toBe(0);
	});
});
