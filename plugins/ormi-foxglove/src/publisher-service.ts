/* eslint-disable @typescript-eslint/no-explicit-any */
import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { parse } from "@foxglove/rosmsg";
import { PluginsManager } from "@workspace/ormi-plugins";
import {
	Publisher,
	DatasourceTopic,
	FoxgloveDataSourceSettings,
} from "./types";
import { UnifiedConverter } from "./unified-converter";

/**
 * Channel information from Foxglove.
 */
interface Channel {
	id: number;
	schemaName: string;
	schema?: string;
}

/**
 * Schema resolver with promise and timeout.
 */
interface SchemaResolver {
	promise: Promise<string>;
	resolve: (schema: string) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
}

/**
 * Manages publishers for Foxglove datasource.
 */
export class PublisherService {
	private publishers = new Map<number, Publisher>();
	private schemaResolvers = new Map<string, SchemaResolver>();
	private channels = new Map<number, Channel>();
	private pluginsManager: PluginsManager;
	private settings: FoxgloveDataSourceSettings;
	private client: any;

	constructor(
		pluginsManager: PluginsManager,
		settings: FoxgloveDataSourceSettings,
		client: any,
	) {
		this.pluginsManager = pluginsManager;
		this.settings = settings;
		this.client = client;
	}

	/**
	 * Updates the internal channel map and resolves any pending schema promises.
	 *
	 * This method is called when Foxglove discovers new channels or updates existing ones.
	 * It's the key method that "completes the circle" of schema resolution.
	 *
	 * @param channels - Map of channel ID to channel data from Foxglove
	 */
	updateChannels(channels: Map<number, any>): void {
		let resolvedCount = 0;

		// Update internal channel map
		channels.forEach((channel, id) => {
			const channelInfo = {
				id,
				schemaName: channel.schemaName,
				schema: channel.schema,
			};

			this.channels.set(id, channelInfo);

			// Resolve pending schema promises if we now have the schema
			if (
				channel.schema &&
				this.schemaResolvers.has(channel.schemaName)
			) {
				const resolver = this.schemaResolvers.get(channel.schemaName)!;

				clearTimeout(resolver.timeout);
				resolver.resolve(channel.schema);
				this.schemaResolvers.delete(channel.schemaName);
				resolvedCount++;
			}
		});
	}

	/**
	 * Resolves a ROS2 message schema by schemaName.
	 *
	 * Schema Resolution Flow:
	 * 1. Check if we already have the schema in our channels (by schema name OR by channel ID)
	 * 2. If not, check if we're already waiting for it (return existing promise)
	 * 3. If not waiting, create a new promise that will be resolved when updateChannels() finds the schema
	 * 4. Set a timeout to prevent hanging forever
	 *
	 * @param schemaName - The ROS2 message type (e.g., "geometry_msgs/msg/Twist")
	 * @param channelId - Optional channel ID to check for existing schema
	 * @returns Promise that resolves with the schema string
	 */
	private async resolveSchema(
		schemaName: string,
		channelId?: number,
	): Promise<string> {
		// 1a. If channelId provided, check that specific channel first
		if (channelId !== undefined) {
			const specificChannel = this.channels.get(channelId);
			if (
				specificChannel &&
				specificChannel.schema &&
				specificChannel.schemaName === schemaName
			) {
				return specificChannel.schema;
			}
		}

		// 1b. Check if schema is available in any channel by schema name
		const existingChannel = Array.from(this.channels.values()).find(
			(ch) => ch.schemaName === schemaName && ch.schema,
		);

		if (existingChannel?.schema) {
			return existingChannel.schema;
		}

		// 2. Check if we're already waiting for this schema type
		if (this.schemaResolvers.has(schemaName)) {
			return this.schemaResolvers.get(schemaName)!.promise;
		}

		// 3. Create new schema resolution promise
		let resolve: (schema: string) => void;
		let reject: (error: Error) => void;

		const promise = new Promise<string>((res, rej) => {
			resolve = res;
			reject = rej;
		});

		// 4. Set timeout to prevent hanging
		const timeout = setTimeout(() => {
			const resolver = this.schemaResolvers.get(schemaName);
			if (resolver) {
				resolver.reject(
					new Error(`Schema resolution timeout for ${schemaName}`),
				);
				this.schemaResolvers.delete(schemaName);
			}
		}, 10000);

		// Store the resolver for later resolution
		this.schemaResolvers.set(schemaName, {
			promise,
			resolve: resolve!,
			reject: reject!,
			timeout,
		});

		return promise;
	}

	async advertise(topic: any): Promise<boolean> {
		try {
			if (!this.client) {
				throw new Error("Foxglove client not available");
			}

			const topicName = topic.topic;
			const rawType = topic.rawType;

			// Check for existing publisher
			const existingPublisher = Array.from(this.publishers.values()).find(
				(p) => p.topic === topicName,
			);

			if (existingPublisher) {
				existingPublisher.count++;

				this.registerPublishAction(existingPublisher);

				return true;
			}

			// Advertise new channel
			const channelId = this.client.advertise({
				topic: topicName,
				encoding: "cdr",
				schemaName: rawType,
			});

			if (channelId === undefined || channelId === null) {
				throw new Error(`Failed to advertise topic ${topicName}`);
			}

			// Small delay to allow channel discovery to complete
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Trigger channel update to help with schema resolution
			this.triggerChannelUpdate();

			// Resolve schema - prioritize exact schema name match over channel ID
			const schema = await this.resolveSchema(rawType);

			// Validate schema matches expected type
			if (!schema) {
				throw new Error(`No schema found for ${rawType}`);
			}

			// Parse schema and create writer
			let parsedSchema;
			try {
				parsedSchema = parse(schema, { ros2: true });
			} catch (parseError) {
				console.error(
					`Schema parsing failed for ${rawType}:`,
					parseError,
				);
				throw new Error(
					`Failed to parse schema for ${rawType}: ${parseError}`,
				);
			}

			// Create publisher
			const publisher: Publisher = {
				channelId,
				topic: topicName,
				schemaName: rawType,
				webtype: topic.type,
				count: 1,
				hook: `${this.settings.id}-${topicName}-publish`,
				writer: new MessageWriter(parsedSchema),
			};

			this.publishers.set(channelId, publisher);

			// Register publish action
			this.registerPublishAction(publisher);

			return true;
		} catch (error) {
			console.error(`Failed to advertise ${topic.topic}:`, error);

			if (this.settings.toasts) {
				// Toast error notification would go here
			}
			return false;
		}
	}

	private registerPublishAction(publisher: Publisher): void {
		const hook = publisher.hook;

		this.pluginsManager.removeAction(hook);
		this.pluginsManager.addAction(hook, {
			id: hook,
			action: async (selectedTopic: any, message: any, webtype: any) => {
				try {
					const currentPublisher = this.publishers.get(
						publisher.channelId,
					);
					if (!currentPublisher) {
						console.warn(
							`Publisher for ${publisher.topic} no longer exists`,
						);
						return;
					}

					// Add validation before conversion
					if (!message) {
						console.error(
							`Cannot publish empty message on ${publisher.topic}`,
						);
						return;
					}

					// Convert webapp message to ROS2 format
					const converted = UnifiedConverter.convertToROS2(
						message,
						webtype,
						selectedTopic.rawType,
					);

					// Validate converted message structure for Twist payloads.
					// TwistStamped carries the same body under `twist`.
					if (selectedTopic.rawType === "geometry_msgs/msg/Twist") {
						this.validateTwistMessage(converted, publisher.topic);
					} else if (
						selectedTopic.rawType ===
						"geometry_msgs/msg/TwistStamped"
					) {
						this.validateTwistMessage(
							converted?.twist,
							publisher.topic,
						);
					}

					// Serialize message using MessageWriter
					const serialized =
						currentPublisher.writer.writeMessage(converted);

					// Validate serialized data
					if (!serialized || serialized.byteLength === 0) {
						console.error(
							`Serialization failed for ${publisher.topic}: empty buffer`,
						);
						return;
					}

					this.client?.sendMessage(publisher.channelId, serialized);
				} catch (error) {
					console.error(
						`Failed to publish message on ${publisher.topic}:`,
						error,
					);

					// Optional: Show toast for critical errors
					if (this.settings.toasts && error instanceof Error) {
						console.warn(
							`Publishing error on ${publisher.topic}: ${error.message}`,
						);
					}
				}
			},
			priority: 100,
		});
	}

	/**
	 * Validates a Twist body (the `linear`/`angular` pair) to ensure it matches
	 * the expected schema. For `TwistStamped`, pass the nested `twist` object.
	 */
	private validateTwistMessage(message: any, topicName: string): void {
		if (!message) {
			throw new Error(
				`Twist message missing its body for topic ${topicName}`,
			);
		}

		const requiredStructure = {
			linear: ["x", "y", "z"],
			angular: ["x", "y", "z"],
		};

		for (const [key, fields] of Object.entries(requiredStructure)) {
			if (!message[key]) {
				throw new Error(
					`Twist message missing required field '${key}' for topic ${topicName}`,
				);
			}

			for (const field of fields) {
				if (typeof message[key][field] !== "number") {
					throw new Error(
						`Twist message field '${key}.${field}' must be a number, got ${typeof message[key][field]} for topic ${topicName}`,
					);
				}

				// Check for NaN or Infinity
				if (!isFinite(message[key][field])) {
					console.warn(
						`Twist message field '${key}.${field}' contains invalid value ${message[key][field]} for topic ${topicName}, setting to 0`,
					);
					message[key][field] = 0;
				}
			}
		}
	}

	async unadvertise(
		topic: DatasourceTopic,
		ignoreCount = false,
	): Promise<void> {
		try {
			if (!this.client) {
				console.warn(
					`Cannot unadvertise ${topic.topic}: client not available`,
				);
				return;
			}

			const publisherEntry = Array.from(this.publishers.entries()).find(
				([_, pub]) => pub.topic === topic.topic,
			);

			if (!publisherEntry) {
				console.warn(`Publisher for ${topic.topic} not found`);
				return;
			}

			const [channelId, publisher] = publisherEntry;

			if (ignoreCount) {
				publisher.count = 0;
			} else {
				publisher.count--;
			}

			if (publisher.count <= 0) {
				// Cleanup publisher
				try {
					this.client.unadvertise(channelId);
				} catch (error) {
					console.error(
						`Error unadvertising channel ${channelId}:`,
						error,
					);
				}

				this.publishers.delete(channelId);
				this.pluginsManager.removeAction(publisher.hook);
			}
		} catch (error) {
			console.error(`Failed to unadvertise ${topic.topic}:`, error);
			if (this.settings.toasts) {
				// Toast error notification would go here
			}
		}
	}

	cleanup(): void {
		// Clear schema resolvers
		this.schemaResolvers.forEach((resolver) => {
			clearTimeout(resolver.timeout);
			resolver.reject(new Error("Publisher service cleanup"));
		});
		this.schemaResolvers.clear();

		// Cleanup all publishers
		this.publishers.forEach((publisher) => {
			this.pluginsManager.removeAction(publisher.hook);
			if (this.client) {
				try {
					this.client.unadvertise(publisher.channelId);
				} catch (error) {
					console.error(
						`Error unadvertising channel ${publisher.channelId} during cleanup:`,
						error,
					);
				}
			}
		});

		this.publishers.clear();
		this.channels.clear();
	}

	getPublisherCount(): number {
		return this.publishers.size;
	}

	getPublishers(): readonly Publisher[] {
		return Array.from(this.publishers.values());
	}

	/**
	 * Force-trigger channel update to help with schema resolution
	 * This is a workaround for timing issues where channels exist but schemas aren't resolved
	 */
	private triggerChannelUpdate(): void {
		// Re-process current channels to see if any pending schemas can be resolved
		if (this.schemaResolvers.size > 0) {
			const currentChannels = new Map(this.channels.entries());
			this.updateChannels(currentChannels);
		}
	}
	/**
	 * Get the current state of schema resolution for debugging
	 */
	getSchemaResolutionState() {
		return {
			availableSchemas: Array.from(this.channels.values())
				.filter((ch) => ch.schema)
				.map((ch) => ({ channelId: ch.id, schemaName: ch.schemaName })),
			pendingSchemas: Array.from(this.schemaResolvers.keys()),
			channelCount: this.channels.size,
			publisherCount: this.publishers.size,
			allChannels: Array.from(this.channels.values()).map((ch) => ({
				id: ch.id,
				schemaName: ch.schemaName,
				hasSchema: !!ch.schema,
				schemaPreview: ch.schema
					? ch.schema.substring(0, 100) + "..."
					: "none",
			})),
		};
	}

	/**
	 * Force resolve a schema for testing/debugging
	 * WARNING: Only use for testing!
	 */
	debugResolveSchema(schemaName: string, schema: string): boolean {
		if (this.schemaResolvers.has(schemaName)) {
			const resolver = this.schemaResolvers.get(schemaName)!;
			clearTimeout(resolver.timeout);
			resolver.resolve(schema);
			this.schemaResolvers.delete(schemaName);
			return true;
		}
		return false;
	}
}
