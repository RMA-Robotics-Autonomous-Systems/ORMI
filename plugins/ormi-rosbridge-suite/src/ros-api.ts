/* eslint-disable @typescript-eslint/no-explicit-any */

import * as ROSLIB from "roslib";
import { JsonSchema } from "@jsonforms/core";
import { decodeTypeDefs } from "./ros2-message-parser";
import type { ROSTopic } from "./types";

/**
 * Retrieves all topics and their message types from the ROS master.
 */
export async function getTopicsList(ros: ROSLIB.Ros): Promise<ROSTopic[]> {
	return new Promise<ROSTopic[]>((resolve, reject) => {
		(ros as any).getTopics(
			(results: { topics: string[]; types: string[] }) => {
				const topics: ROSTopic[] = [];
				for (let i = 0; i < results.topics.length; i++) {
					topics.push({
						topic: results.topics[i]!,
						type: results.types[i]!,
					});
				}
				resolve(topics);
			},
			(error: any) => reject(error),
		);
	});
}

/**
 * Retrieves all topics and their full typedef text, decoded into JsonSchema objects.
 */
export async function getTopicsAndRawTypes(
	ros: ROSLIB.Ros,
): Promise<Map<string, JsonSchema>> {
	return new Promise<Map<string, JsonSchema>>((resolve, reject) => {
		(ros as any).getTopicsAndRawTypes(
			(results: {
				topics: string[];
				types: string[];
				typedefs_full_text: string[];
			}) => {
				const map = new Map<string, JsonSchema>();
				for (let i = 0; i < results.topics.length; i++) {
					map.set(
						results.topics[i]!,
						decodeTypeDefs(results.typedefs_full_text[i]!),
					);
				}
				resolve(map);
			},
			(error: any) => reject(error),
		);
	});
}

/**
 * Retrieves all available ROS interface types via the rosapi/interfaces service.
 * Throws if the rosapi service is not available.
 */
export async function getAllTopicTypes(ros: ROSLIB.Ros): Promise<string[]> {
	const services = await new Promise<string[]>((resolve, reject) => {
		ros.getServices(
			(results: string[]) => resolve(results),
			(error: any) => reject(error),
		);
	});

	const serviceName = services.find((s) => s.includes("/rosapi/interfaces"));
	if (!serviceName) {
		throw new Error("rosapi/interfaces service not found");
	}

	return new Promise<string[]>((resolve, reject) => {
		const client = new ROSLIB.Service<
			Record<string, never>,
			{ interfaces: string[] }
		>({
			ros,
			name: serviceName,
			serviceType: "rosapi_msgs/srv/Interfaces",
		});
		client.callService(
			{},
			(result) => resolve(result.interfaces),
			(error) => reject(error),
		);
	});
}
