/* eslint-disable @typescript-eslint/no-explicit-any */

import * as ROSLIB from "roslib";
import { JsonSchema } from "@jsonforms/core";
import { decodeTypeDefs } from "./ros2-message-parser";
import type { ROSTopic } from "./types";

const ROS_API_TIMEOUT_MS = 2000;

/**
 * Wraps a promise with a 2-second timeout.
 * Rejects with a descriptive error if the bridge does not respond in time.
 */
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(
				() =>
					reject(
						new Error(
							`${label} timed out after ${ROS_API_TIMEOUT_MS}ms`,
						),
					),
				ROS_API_TIMEOUT_MS,
			),
		),
	]);
}

/**
 * Retrieves all topics and their message types from the ROS master.
 */
export async function getTopicsList(ros: ROSLIB.Ros): Promise<ROSTopic[]> {
	return withTimeout(
		new Promise<ROSTopic[]>((resolve, reject) => {
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
		}),
		"getTopicsList",
	);
}

/**
 * Retrieves all topics and their full typedef text, decoded into JsonSchema objects.
 */
export async function getTopicsAndRawTypes(
	ros: ROSLIB.Ros,
): Promise<Map<string, JsonSchema>> {
	return withTimeout(
		new Promise<Map<string, JsonSchema>>((resolve, reject) => {
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
		}),
		"getTopicsAndRawTypes",
	);
}

/**
 * Retrieves all available ROS interface types via the rosapi/interfaces service.
 * Throws if the rosapi service is not available.
 */
export async function getAllTopicTypes(ros: ROSLIB.Ros): Promise<string[]> {
	const services = await withTimeout(
		new Promise<string[]>((resolve, reject) => {
			ros.getServices(
				(results: string[]) => resolve(results),
				(error: any) => reject(error),
			);
		}),
		"getServices",
	);

	const serviceName = services.find((s) => s.includes("/rosapi/interfaces"));
	if (!serviceName) {
		throw new Error("rosapi/interfaces service not found");
	}

	return withTimeout(
		new Promise<string[]>((resolve, reject) => {
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
		}),
		"rosapi/interfaces",
	);
}
