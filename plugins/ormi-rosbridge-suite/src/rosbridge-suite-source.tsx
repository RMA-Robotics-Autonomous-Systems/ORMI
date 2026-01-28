"use client";
/*
    Provider that creates a datasets with random data

    data -> 
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
*/

import React, { createContext, ReactNode, useEffect, useRef } from "react";

import * as ROSLIB from "roslib";

import { JsonSchema } from "@jsonforms/core";
import { decodeTypeDefs } from "./ros2-message-parser";
import { UnifiedConverter } from "./ros2/unified-converter";

import {
	DatasourceProviderSettings,
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { Spinner } from "@workspace/ui/components/spinner";
import { toast } from "sonner";

const RosBridgeSuiteSourceContext = createContext(null);

// time to wait before trying to connect to the ROSBridge Suite
const WAIT_FOR_CONNECTION = 500;

interface RosBridgeSuiteDataSourceSettings extends DatasourceProviderSettings {
	url: string;
	reconnectTimeout: number;
	toasts: boolean;
	transformTreeTopics: string[];
}

export interface ROSTopic {
	topic: string;
	type: string;
}

export async function GetTopicType(
	ROS: ROSLIB.Ros,
	topic: string,
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		ROS.getTopicType(
			topic,
			(type: string) => {
				resolve(type);
			},
			(error: any) => {
				reject(error);
			},
		);
	});
}

export async function GetTopicsList(ROS: ROSLIB.Ros): Promise<ROSTopic[]> {
	return new Promise<ROSTopic[]>((resolve, reject) => {
		(ROS as any).getTopics(
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
			(error: any) => {
				reject(error);
			},
		);
	});
}

export async function GetTopicsAndRawTypes(
	ROS: ROSLIB.Ros,
): Promise<Map<string, JsonSchema>> {
	return new Promise<Map<string, JsonSchema>>((resolve, reject) => {
		(ROS as any).getTopicsAndRawTypes(
			(results: {
				topics: string[];
				types: string[];
				typedefs_full_text: string[];
			}) => {
				const topics = new Map<string, JsonSchema>();

				for (let i = 0; i < results.topics.length; i++) {
					const def = results.typedefs_full_text[i]!;
					const decoded = decodeTypeDefs(def); // parse the typedefs into a JsonSchema

					topics.set(results.topics[i]!, decoded);
				}

				resolve(topics);
			},
			(error: any) => {
				reject(error);
			},
		);
	});
}

export async function GetServices(ROS: ROSLIB.Ros): Promise<string[]> {
	return new Promise<string[]>((resolve, reject) => {
		ROS.getServices(
			(results: string[]) => {
				resolve(results);
			},
			(error: any) => {
				reject(error);
			},
		);
	});
}

export async function GetAllTopicTypes(ROS: ROSLIB.Ros): Promise<string[]> {
	// return all the types in the system
	return new Promise<string[]>(async (resolve, reject) => {
		const services = await GetServices(ROS);

		// find the service that contains : '/rosapi/interfaces'
		const service_name = services.find((service) =>
			service.includes("/rosapi/interfaces"),
		);

		if (!service_name) {
			reject("Service not found");
			return;
		}

		const addTwoIntsClient = new ROSLIB.Service({
			ros: ROS,
			name: service_name,
			serviceType: "rosapi_msgs/srv/Interfaces",
		});

		const request = new ROSLIB.ServiceRequest({});

		addTwoIntsClient.callService(
			request,
			function (result) {
				resolve(result.interfaces);
			},
			function (error) {
				reject(error);
			},
		);
	});
}

type RosTopicAndCounter = {
	topic: ROSLIB.Topic;
	counter: number;
	hook: string;
};

// Create a provider component
const RosBridgeSuiteSourceProvider = (
	children: ReactNode,
	props: RosBridgeSuiteDataSourceSettings,
) => {
	const pluginsManager = usePluginsManager();

	const subscribersRef = useRef(new Map<string, ROSLIB.Topic>());
	const subscribersCountRef = useRef(new Map<string, number>());

	// constant for the datasource
	const datasource_id = props.id;
	const available_topics_handler = `${datasource_id}-available-topics`;
	const subscribe_hook = `${datasource_id}-subscribe`;
	const unsubscribe_hook = `${datasource_id}-unsubscribe`;
	const definition_hook = `${datasource_id}-definition`;
	const advertise_hook = `${datasource_id}-advertise`;
	const unadvertise_hook = `${datasource_id}-unadvertise`;
	const available_types = `${datasource_id}-available-types`;

	// ROS Websocket
	const ROSRef = useRef<ROSLIB.Ros | null>(null);

	const connectionRef = useRef<Promise<boolean> | null>(null);
	const [connected, setConnected] = React.useState(false);

	const [retry, setRetry] = React.useState(0); // force re-render to re-connect

	const ros_publishers = useRef(
		new Map<string, RosTopicAndCounter>(),
	).current; // Keep using useRef for consistency
	const advertisingPromisesRef = useRef<Map<string, Promise<boolean>>>(
		new Map(),
	); // Topic name -> Promise<success> for advertise
	const unadvertisingPromisesRef = useRef<Map<string, Promise<void>>>(
		new Map(),
	); // Topic name -> Promise<void> for unadvertise

	useEffect(() => {
		if (!props.enable) {
			setConnected(true); // allow to render children
			return;
		}

		const waitTimeOut = setTimeout(() => {
			connectionRef.current = new Promise<boolean>((resolve, reject) => {
				if (!ROSRef.current || !(ROSRef.current as any).isConnected) {
					const ros = new ROSLIB.Ros({
						url: props.url,
					});

					ros.on("connection", () => {
						if (props.toasts) {
							toast(
								"Connecting to ROSBridge Suite at " + props.url,
							);
						}

						setConnected(true);
						resolve(true);
					});

					ros.on("error", (error) => {
						if (props.toasts) {
							toast(
								"Error connecting to ROSBridge Suite: " +
									error.message,
							);
						}
						setConnected(false);
						reject(error);
					});

					ros.on("close", () => {
						if (props.toasts) {
							toast(
								"Disconnected from ROSBridge Suite: " +
									props.url,
							);
						}

						setTimeout(() => {
							setRetry(retry + 1);
						}, props.reconnectTimeout * 1000);

						setConnected(false);
						resolve(false);
					});

					ROSRef.current = ros;
				}
			});

			pluginsManager.addFilter(`${datasource_id}-ros-2-connection`, {
				id: `${datasource_id}-ros-2-connection`,
				filter: (_obj = {}) => {
					return ROSRef.current;
				},
				priority: 1,
			});

			// Register plugin handlers
			pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
				id: available_topics_handler,
				filter: async (topics) => {
					try {
						await connectionRef.current;
						const rosTopics = await GetTopicsList(ROSRef.current!);

						return [
							...topics,
							...rosTopics.map((topic) => ({
								topic: topic.topic,
								datasource_id: "rosbridge-suite-source",
								source: props,
								type:
									UnifiedConverter.getWebappTypeFromROSType(
										topic.type,
									) || "",
								rawType: topic.type,
							})),
						];
					} catch (error) {
						return topics;
					}
				},
				priority: 100,
			});

			pluginsManager.addAction(subscribe_hook, {
				id: subscribe_hook,
				action: async (topic: DatasourceTopic) => {
					try {
						await connectionRef.current;

						if (subscribersRef.current.has(topic.topic)) {
							subscribersCountRef.current.set(
								topic.topic,
								(subscribersCountRef.current.get(topic.topic) ||
									0) + 1,
							);
							return;
						}

						// const topicType = await GetTopicType(ROSRef.current!, topic.topic);
						const subscriber = new ROSLIB.Topic({
							ros: ROSRef.current!,
							name: topic.topic,
							messageType: topic.rawType,
						});

						subscriber.subscribe((message: ROSLIB.Message) => {
							const frameId =
								(message as any)?.header?.frame_id ?? "unknown";

							// convert the incoming message to webapp format
							const convertedMessage =
								UnifiedConverter.convertToWebapp(
									message,
									topic.type,
									topic.rawType,
								);

							pluginsManager.doAction(
								`${datasource_id}-${topic.topic}-published`,
								convertedMessage,
								Date.now(),
								frameId,
							);
						});

						subscribersRef.current.set(topic.topic, subscriber);
						subscribersCountRef.current.set(topic.topic, 1);
					} catch (error) {
						if (props.toasts) {
							toast(
								"Error subscribing to topic " +
									topic.topic +
									": " +
									(error instanceof Error
										? error.message
										: String(error)),
							);
						}
					}
				},
				priority: 100,
			});

			pluginsManager.addAction(unsubscribe_hook, {
				id: unsubscribe_hook,
				action: async (
					topic: DatasourceTopic,
					ignoreCount: boolean = false,
				) => {
					try {
						await connectionRef.current;

						if (!subscribersRef.current.has(topic.topic)) {
							return;
						}

						const count =
							subscribersCountRef.current.get(topic.topic) || 0;
						subscribersCountRef.current.set(topic.topic, count - 1);

						if (count <= 1 || ignoreCount) {
							const subscriber = subscribersRef.current.get(
								topic.topic,
							);
							subscriber!.unsubscribe();
							subscribersRef.current.delete(topic.topic);
							subscribersCountRef.current.delete(topic.topic);
						}
					} catch (error) {
						console.error("Unsubscribe error:", error);
						if (props.toasts) {
							toast(
								"Error unsubscribing from topic " +
									topic.topic +
									": " +
									(error instanceof Error
										? error.message
										: String(error)),
							);
						}
					}
				},

				priority: 100,
			});

			pluginsManager.addFilter(definition_hook, {
				id: definition_hook,
				priority: 10,
				filter: async (
					definition: JsonSchema,
					topic: DatasourceTopic,
				) => {
					// return a JsonSchema representing the topic message structure
					// normally the current definition is empty.

					const converter = UnifiedConverter.converters[topic.type];
					if (converter && converter.isPrimitive) {
						return definition;
					}

					// get message definition from ROS
					const topics_and_raw_types = await GetTopicsAndRawTypes(
						ROSRef.current!,
					);
					const current_topic_raw_type = topics_and_raw_types.get(
						topic.topic,
					);

					if (!current_topic_raw_type) {
						return definition;
					}

					return current_topic_raw_type;
				},
			});

			pluginsManager.addFilter(advertise_hook, {
				id: advertise_hook,
				filter: async (topic: SelectedTopic): Promise<boolean> => {
					const topicName = topic.topic;
					const rawType = topic.rawType;

					// Check if an advertise operation for this topic is already in progress
					if (advertisingPromisesRef.current.has(topicName)) {
						console.log(
							`ROS2 Advertise for ${topicName}: Operation already in progress, awaiting...`,
						);
						return await advertisingPromisesRef.current.get(
							topicName,
						)!;
					}

					// Create a new promise to represent the advertise operation
					const advertisePromise = (async (): Promise<boolean> => {
						try {
							console.log(
								`ROS2 Advertise for ${topicName}: Starting operation...`,
							);
							await connectionRef.current; // Ensure connection is ready

							// --- Critical Section Start (Protected by advertisePromise) ---

							// Check if publisher *already* exists
							if (ros_publishers.has(topicName)) {
								const topic_and_counter =
									ros_publishers.get(topicName)!;
								console.log(
									`ROS2 Advertise for ${topicName}: Publisher already exists, incrementing count.`,
								);
								topic_and_counter.counter++;
								console.log(
									`ROS2 Advertise for ${topicName}: Count incremented to ${topic_and_counter.counter}.`,
								);
								return true; // Indicate success
							}

							// No existing publisher, proceed with advertising
							console.log(
								`ROS2 Advertise for ${topicName}: No existing publisher, creating ROSLIB.Topic...`,
							);
							const publisher = new ROSLIB.Topic({
								ros: ROSRef.current!,
								name: topicName,
								messageType: rawType,
							});

							const hook = `${datasource_id}-${topicName}-publish`;

							// Store the publisher and initialize count
							ros_publishers.set(topicName, {
								topic: publisher,
								counter: 1, // Initial count is 1
								hook: hook,
							});
							console.log(
								`ROS2 Advertise for ${topicName}: Publisher state created.`,
							);

							// Register the publish action hook
							// Ensure no duplicate action hook registration
							pluginsManager.removeAction(hook); // Remove existing first, just in case
							pluginsManager.addAction(hook, {
								id: hook, // Use hook name as ID
								action: async (
									selected_topic: SelectedTopic,
									message: any,
									webtype: any,
								) => {
									const currentPublisherData =
										ros_publishers.get(topicName);
									if (!currentPublisherData) {
										console.warn(
											`ROS2 Publish action for ${topicName}: Publisher no longer exists.`,
										);
										return;
									}
									try {
										const converted =
											UnifiedConverter.convertToROS2(
												message,
												webtype,
												rawType,
											);
										const msg = new ROSLIB.Message(
											converted,
										);
										currentPublisherData.topic.publish(msg);
									} catch (error) {
										console.error(
											`ROS2 Failed to publish message on ${topicName}:`,
											error,
										);
									}
								},
								priority: 100,
							});
							console.log(
								`ROS2 Advertise for ${topicName}: Publish action registered for hook ${hook}.`,
							);

							// --- Critical Section End ---
							console.log(
								`ROS2 Advertise for ${topicName}: Operation setup complete, returning true.`,
							);
							return true; // Indicate success
						} catch (error) {
							console.error(
								`ROS2 Advertise for ${topicName}: Error during operation:`,
								error,
							);
							// Clean up if advertise failed after creating state but before finishing
							if (ros_publishers.has(topicName)) {
								const hook =
									ros_publishers.get(topicName)?.hook;
								if (hook) pluginsManager.removeAction(hook);
								ros_publishers.delete(topicName);
								console.log(
									`ROS2 Advertise for ${topicName}: Cleaned up publisher state due to error.`,
								);
							}
							if (props.toasts) {
								toast(
									"Error advertising topic " +
										topicName +
										": " +
										(error instanceof Error
											? error.message
											: String(error)),
								);
							}
							return false; // Indicate failure
						} finally {
							// Remove the promise from the map once it's settled
							advertisingPromisesRef.current.delete(topicName);
							console.log(
								`ROS2 Advertise for ${topicName}: Operation finished, removed promise.`,
							);
						}
					})();

					// Store the promise and return it
					advertisingPromisesRef.current.set(
						topicName,
						advertisePromise,
					);
					return await advertisePromise;
				},
				priority: 100,
			});

			pluginsManager.addAction(unadvertise_hook, {
				id: unadvertise_hook,
				action: async (
					topic: DatasourceTopic,
					ignoreCount: boolean = false,
				) => {
					const topicName = topic.topic;

					// Check if an unadvertise operation for this topic is already in progress
					if (unadvertisingPromisesRef.current.has(topicName)) {
						console.log(
							`ROS2 Unadvertise for ${topicName}: Operation already in progress, awaiting...`,
						);
						// Await the existing promise to ensure serialization
						await unadvertisingPromisesRef.current.get(topicName)!;
						// After awaiting, the action might have already been completed by the original call.
						// Return here to prevent redundant execution.
						return;
					}

					// Create a new promise to represent the unadvertise operation
					const unadvertisePromise = (async (): Promise<void> => {
						// Return void
						console.log(
							`ROS2 Unadvertise for ${topicName}: Starting operation (ignoreCount: ${ignoreCount}).`,
						);
						try {
							await connectionRef.current; // Ensure connection

							// --- Critical Section Start (Protected by unadvertisePromise) ---

							// Check if an advertise operation is still in progress *before* proceeding
							if (advertisingPromisesRef.current.has(topicName)) {
								console.warn(
									`ROS2 Unadvertise for ${topicName}: Advertise operation still in progress. Awaiting completion before unadvertising.`,
								);
								try {
									await advertisingPromisesRef.current.get(
										topicName,
									);
									console.log(
										`ROS2 Unadvertise for ${topicName}: Advertise operation completed. Proceeding with unadvertise.`,
									);
								} catch (advError) {
									console.warn(
										`ROS2 Unadvertise for ${topicName}: Advertise operation failed, proceeding with unadvertise cleanup anyway. Error:`,
										advError,
									);
								}
							}

							// Find the publisher data - re-check *inside* the serialized block
							const topic_and_counter =
								ros_publishers.get(topicName);

							if (!topic_and_counter) {
								console.warn(
									`ROS2 Unadvertise for ${topicName}: Publisher not found within operation (potentially already unadvertised or advertise failed).`,
								);
								pluginsManager.removeAction(
									`${datasource_id}-${topicName}-publish`,
								); // Cleanup hook just in case
								return; // Nothing more to do
							}

							// Decrement count or force removal
							if (ignoreCount) {
								topic_and_counter.counter = 0;
							} else {
								// Only decrement if counter > 0 to prevent going negative
								if (topic_and_counter.counter > 0) {
									topic_and_counter.counter--;
								} else {
									console.warn(
										`ROS2 Unadvertise for ${topicName}: Counter was already zero or less before decrementing.`,
									);
								}
							}
							console.log(
								`ROS2 Unadvertise for ${topicName}: Count updated to ${topic_and_counter.counter}.`,
							);

							if (topic_and_counter.counter <= 0) {
								console.log(
									`ROS2 Unadvertise for ${topicName}: Count is zero or less, proceeding with unadvertise.`,
								);
								try {
									topic_and_counter.topic.unadvertise();
									console.log(
										`ROS2 Unadvertise for ${topicName}: Unadvertise call sent.`,
									);
								} catch (unadvError) {
									console.error(
										`ROS2 Unadvertise for ${topicName}: Error calling topic.unadvertise:`,
										unadvError,
									);
								}

								// Remove publisher state *after* attempting unadvertise
								ros_publishers.delete(topicName);
								pluginsManager.removeAction(
									topic_and_counter.hook,
								);
								console.log(
									`ROS2 Unadvertise for ${topicName}: Publisher state removed, action hook ${topic_and_counter.hook} removed.`,
								);
							} else {
								console.log(
									`ROS2 Unadvertise for ${topicName}: Count is ${topic_and_counter.counter}, publisher remains active.`,
								);
							}
							// --- Critical Section End ---
						} catch (error) {
							console.error(
								`ROS2 Unadvertise for ${topicName}: Error during operation:`,
								error,
							);
							if (props.toasts) {
								toast(
									"Error unadvertising topic " +
										topicName +
										": " +
										(error instanceof Error
											? error.message
											: String(error)),
								);
							}
							// Don't re-throw, just log
						} finally {
							// Remove the promise from the map once this operation is fully settled
							unadvertisingPromisesRef.current.delete(topicName);
							console.log(
								`ROS2 Unadvertise for ${topicName}: Operation finished, removed promise.`,
							);
						}
					})();

					// Store the promise and await it to ensure the caller waits for completion
					unadvertisingPromisesRef.current.set(
						topicName,
						unadvertisePromise,
					);
					await unadvertisePromise;
				},
				priority: 100,
			});

			pluginsManager.addFilter(available_types, {
				id: available_types,
				filter: async (types: string[]) => {
					try {
						await connectionRef.current;
						const all_types = await GetAllTopicTypes(
							ROSRef.current!,
						);
						return [...types, ...all_types];
					} catch (error) {
						return types;
					}
				},
				priority: 100,
			});
		}, WAIT_FOR_CONNECTION);

		const disconnect = async () => {
			if (!connectionRef.current) {
				return;
			}

			await connectionRef.current;

			if (ROSRef.current && (ROSRef.current as any).isConnected) {
				ROSRef.current.close();
			}
		};

		return () => {
			clearTimeout(waitTimeOut);

			// Check if connection was even attempted
			if (!connectionRef.current) {
				console.log(
					"ROS2 Cleanup: Connection was not attempted, skipping cleanup.",
				);
				return;
			}
			console.log(
				"ROS2 Cleanup: Starting cleanup for datasource",
				datasource_id,
			);

			// Remove core filters and actions registered by this provider instance
			pluginsManager.removeFilter(`${datasource_id}-ros-2-connection`);
			pluginsManager.removeFilter(available_topics_handler);
			pluginsManager.removeAction(subscribe_hook);
			pluginsManager.removeAction(unsubscribe_hook);
			pluginsManager.removeFilter(definition_hook);
			pluginsManager.removeFilter(advertise_hook);
			pluginsManager.removeAction(unadvertise_hook);
			pluginsManager.removeFilter(available_types);
			console.log("ROS2 Cleanup: Core filters and actions removed.");

			// --- Subscriber Cleanup ---
			// Unsubscribe ROSLib topics. The associated action hooks (`<ds_id>-<topic>-published`)
			// are managed by the LocalDataSourcesProvider and removed there.
			subscribersRef.current.forEach((subscriber, topicName) => {
				try {
					console.log(
						`ROS2 Cleanup: Unsubscribing from ${topicName}`,
					);
					subscriber.unsubscribe();
				} catch (e) {
					console.error(
						`ROS2 Cleanup: Error unsubscribing from ${topicName}:`,
						e,
					);
				}
			});
			subscribersRef.current.clear();
			subscribersCountRef.current.clear();
			console.log("ROS2 Cleanup: Subscribers cleared.");

			// --- Publisher Cleanup ---
			// DO NOT forcefully unadvertise here. The reference counting in unadvertise_hook
			// handles this when components unmount via PublisherDataSourcesProvider.
			// We just need to clear the local references and promises.

			// Clear advertising promises immediately
			advertisingPromisesRef.current.clear();
			console.log("ROS2 Cleanup: Advertising promises cleared.");

			// Clear the publisher map reference. Individual publishers and their hooks
			// should be cleaned up via the unadvertise_hook action triggered elsewhere.
			// If any publishers *were* still active according to their counts,
			// they will become orphaned, but this prevents incorrect mass removal.
			// Consider adding a log if the map isn't empty here, indicating potential leaks
			// if unadvertise wasn't called correctly for all users.
			if (ros_publishers.size > 0) {
				console.warn(
					`ROS2 Cleanup: ${ros_publishers.size} publishers still in map during provider cleanup. This might indicate components did not unadvertise correctly.`,
				);
				// Optionally, iterate and remove associated action hooks as a fallback,
				// though ideally they are removed by unadvertise_hook.
				ros_publishers.forEach((pubData) => {
					pluginsManager.removeAction(pubData.hook);
				});
			}
			ros_publishers.clear(); // Clear the map reference
			console.log("ROS2 Cleanup: Publisher map reference cleared.");

			// Clear unadvertising promises on cleanup
			unadvertisingPromisesRef.current.clear();
			console.log("ROS2 Cleanup: Unadvertising promises cleared.");

			// --- Disconnect ---
			disconnect(); // Disconnect the ROS connection
			console.log("ROS2 Cleanup: Disconnect called.");
		};
	}, [retry, props, pluginsManager]); // Add pluginsManager dependency

	return (
		<RosBridgeSuiteSourceContext.Provider value={null}>
			{connected && children}
			{!connected && <Spinner />}
		</RosBridgeSuiteSourceContext.Provider>
	);
};

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
