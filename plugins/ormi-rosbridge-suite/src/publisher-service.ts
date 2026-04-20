/* eslint-disable @typescript-eslint/no-explicit-any */

import * as ROSLIB from "roslib";
import { toast } from "sonner";
import type { PluginsManager } from "@workspace/ormi-plugins";
import { UnifiedConverter } from "./ros2/unified-converter";
import type { RosBridgeSuiteDataSourceSettings } from "./types";
import type {
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";

interface PublisherEntry {
	topic: ROSLIB.Topic<any>;
	counter: number;
	/** Plugin action hook name used to publish messages on this topic. */
	hook: string;
}

/**
 * RosbridgePublisherService encapsulates the ref-counted advertise/unadvertise
 * logic for ROSLIB.Topic publishers.  Promise serialization prevents race
 * conditions when the same topic is advertised/unadvertised concurrently.
 */
export class RosbridgePublisherService {
	private readonly ros: ROSLIB.Ros;
	private readonly pluginsManager: PluginsManager;
	private readonly settings: RosBridgeSuiteDataSourceSettings;
	private readonly datasourceId: string;

	private readonly publishers = new Map<string, PublisherEntry>();
	private readonly advertisingPromises = new Map<string, Promise<boolean>>();
	private readonly unadvertisingPromises = new Map<string, Promise<void>>();

	constructor(
		ros: ROSLIB.Ros,
		pluginsManager: PluginsManager,
		settings: RosBridgeSuiteDataSourceSettings,
	) {
		this.ros = ros;
		this.pluginsManager = pluginsManager;
		this.settings = settings;
		this.datasourceId = settings.id;
	}

	async advertise(topicDef: SelectedTopic): Promise<boolean> {
		const topicName = topicDef.topic;
		const rawType = topicDef.rawType;

		if (this.advertisingPromises.has(topicName)) {
			return await this.advertisingPromises.get(topicName)!;
		}

		const advertisePromise = (async (): Promise<boolean> => {
			try {
				if (this.publishers.has(topicName)) {
					this.publishers.get(topicName)!.counter++;
					return true;
				}

				const publisher = new ROSLIB.Topic({
					ros: this.ros,
					name: topicName,
					messageType: rawType,
				});

				const hook = `${this.datasourceId}-${topicName}-publish`;
				this.publishers.set(topicName, {
					topic: publisher,
					counter: 1,
					hook,
				});

				this.pluginsManager.removeAction(hook);
				this.pluginsManager.addAction(hook, {
					id: hook,
					action: async (
						_selected_topic: SelectedTopic,
						message: any,
						webtype: any,
					) => {
						const entry = this.publishers.get(topicName);
						if (!entry) return;
						try {
							const converted = UnifiedConverter.convertToROS2(
								message,
								webtype,
								rawType,
							);
							entry.topic.publish(converted);
						} catch (error) {
							console.error(
								`Failed to publish on ${topicName}:`,
								error,
							);
						}
					},
					priority: 100,
				});

				return true;
			} catch (error) {
				if (this.publishers.has(topicName)) {
					const hook = this.publishers.get(topicName)?.hook;
					if (hook) this.pluginsManager.removeAction(hook);
					this.publishers.delete(topicName);
				}
				if (this.settings.toasts) {
					toast(
						"Error advertising topic " +
							topicName +
							": " +
							(error instanceof Error
								? error.message
								: String(error)),
					);
				}
				return false;
			} finally {
				this.advertisingPromises.delete(topicName);
			}
		})();

		this.advertisingPromises.set(topicName, advertisePromise);
		return await advertisePromise;
	}

	async unadvertise(
		topic: DatasourceTopic,
		ignoreCount = false,
	): Promise<void> {
		const topicName = topic.topic;

		if (this.unadvertisingPromises.has(topicName)) {
			await this.unadvertisingPromises.get(topicName)!;
			return;
		}

		const unadvertisePromise = (async (): Promise<void> => {
			try {
				// Wait for any in-progress advertise to settle first.
				if (this.advertisingPromises.has(topicName)) {
					try {
						await this.advertisingPromises.get(topicName);
					} catch {
						// ignore advertise failure during unadvertise
					}
				}

				const entry = this.publishers.get(topicName);
				if (!entry) {
					this.pluginsManager.removeAction(
						`${this.datasourceId}-${topicName}-publish`,
					);
					return;
				}

				if (ignoreCount) {
					entry.counter = 0;
				} else if (entry.counter > 0) {
					entry.counter--;
				}

				if (entry.counter <= 0) {
					try {
						entry.topic.unadvertise();
					} catch {
						// ignore unadvertise errors
					}
					this.publishers.delete(topicName);
					this.pluginsManager.removeAction(entry.hook);
				}
			} catch (error) {
				if (this.settings.toasts) {
					toast(
						"Error unadvertising topic " +
							topicName +
							": " +
							(error instanceof Error
								? error.message
								: String(error)),
					);
				}
			} finally {
				this.unadvertisingPromises.delete(topicName);
			}
		})();

		this.unadvertisingPromises.set(topicName, unadvertisePromise);
		await unadvertisePromise;
	}

	/** Force-unadvertise all active publishers and remove their action hooks. */
	cleanup(): void {
		this.advertisingPromises.clear();
		this.unadvertisingPromises.clear();
		this.publishers.forEach((entry) => {
			try {
				entry.topic.unadvertise();
			} catch {
				// ignore unadvertise errors during cleanup
			}
			this.pluginsManager.removeAction(entry.hook);
		});
		this.publishers.clear();
	}
}
