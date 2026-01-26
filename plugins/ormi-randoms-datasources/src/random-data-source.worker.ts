import {
    createDatasourceWorker,
    DatasourceErrorHandler,
    ErrorCategory,
    ErrorSeverity,
} from "@workspace/ormi-core/datasources/worker";
import type {
    DatasourceTopic,
    SelectedTopic,
} from "@workspace/ormi-core/datasources";
import type {
    RemoteCallDefinition,
    RemoteCallOptions,
    RemoteCallResult,
} from "@workspace/ormi-core/datasources";
import type { RandomDataSourceSettings } from "./index";
import type {
    IMU,
    Movement,
    PointsCloud,
    Vector3,
} from "@workspace/ormi-core/types";

createDatasourceWorker<RandomDataSourceSettings>((context) => {
    const intervals = new Map<string, ReturnType<typeof setInterval>>();
    const subscribersCount = new Map<string, number>();
    let settings: RandomDataSourceSettings;
    let callCounter = 0;
    let errorHandler: DatasourceErrorHandler | null = null;

    const getTopicDefinition = (topicName: string) =>
        settings.topics.find((topic) => topic.topic === topicName);

    const getTopicFrequency = (topicName: string) =>
        getTopicDefinition(topicName)?.frequency ?? 30;

    const generateInterval = (topic: SelectedTopic) => {
        const freq = getTopicFrequency(topic.topic);

        switch (topic.type) {
            case "GeolocationPosition": {
                const walker = {
                    latitude: 50.8503,
                    longitude: 4.3517,
                    altitude: 100,
                    accuracy: 5,
                    altitudeAccuracy: 5,
                    heading: 0,
                    speed: 0,
                };

                return setInterval(() => {
                    walker.latitude += (Math.random() - 0.5) * 0.0001;
                    walker.longitude += (Math.random() - 0.5) * 0.0001;
                    walker.altitude += (Math.random() - 0.5) * 0.0005;
                    walker.heading += Math.random() * 1;
                    walker.speed = Math.abs((Math.random() - 0.5) * 0.2);

                    context.publish(
                        topic.topic,
                        { coords: { ...walker } } as GeolocationPosition,
                        Date.now(),
                    );
                }, 1000 / freq);
            }

            case "IMU":
                return setInterval(() => {
                    const time = Date.now() / 1000;
                    const stepFrequency = 2;
                    const stepAmplitude = 0.5;

                    const imuData = {
                        linear_acceleration: {
                            x:
                                stepAmplitude *
                                Math.sin(2 * Math.PI * stepFrequency * time),
                            y: Math.abs(
                                stepAmplitude *
                                    Math.sin(
                                        4 * Math.PI * stepFrequency * time,
                                    ),
                            ),
                            z:
                                stepAmplitude *
                                Math.cos(2 * Math.PI * stepFrequency * time) *
                                0.3,
                        },
                        angular_velocity: {
                            x:
                                stepAmplitude *
                                Math.cos(2 * Math.PI * stepFrequency * time) *
                                0.2,
                            y:
                                stepAmplitude *
                                Math.sin(2 * Math.PI * stepFrequency * time) *
                                0.1,
                            z:
                                stepAmplitude *
                                Math.sin(4 * Math.PI * stepFrequency * time) *
                                0.15,
                        },
                        orientation: {
                            x:
                                Math.sin(2 * Math.PI * stepFrequency * time) *
                                0.1,
                            y:
                                Math.cos(2 * Math.PI * stepFrequency * time) *
                                0.1,
                            z:
                                Math.sin(4 * Math.PI * stepFrequency * time) *
                                0.05,
                            w: 1.0,
                        },
                    } as IMU;

                    context.publish(topic.topic, imuData, Date.now());
                }, 1000 / freq);

            case "number": {
                let oldValue = Math.random();
                return setInterval(() => {
                    const value = oldValue + Math.random() * 0.1 - 0.05;
                    oldValue = value;
                    context.publish(topic.topic, value, Date.now());
                }, 1000 / freq);
            }

            case "Movement": {
                const data = {
                    linear: {
                        x: Math.random() * 2 - 1,
                        y: Math.random() * 2 - 1,
                        z: Math.random() * 2 - 1,
                    } as Vector3,
                    angular: {
                        x: Math.random() * 2 - 1,
                        y: Math.random() * 2 - 1,
                        z: Math.random() * 2 - 1,
                    } as Vector3,
                } as Movement;

                return setInterval(() => {
                    data.linear.x += Math.random() * 0.1 - 0.05;
                    data.linear.y += Math.random() * 0.1 - 0.05;
                    data.linear.z += Math.random() * 0.1 - 0.05;

                    data.angular.x += Math.random() * 0.1 - 0.05;
                    data.angular.y += Math.random() * 0.1 - 0.05;
                    data.angular.z += Math.random() * 0.1 - 0.05;

                    context.publish(topic.topic, data, Date.now());
                }, 1000 / freq);
            }

            case "boolean": {
                let timeOfChange = Date.now();
                let value = Math.random() > 0.5;

                return setInterval(() => {
                    const now = Date.now();
                    const elapsed = now - timeOfChange;
                    const probability = Math.min(1, elapsed / 5000);
                    if (Math.random() < probability) {
                        value = !value;
                        timeOfChange = now;
                    }
                    context.publish(topic.topic, value, now);
                }, 1000 / freq);
            }

            case "PointsCloud": {
                const numPoints = 100000;
                const basePoints = Array.from({ length: numPoints }, () => ({
                    x: (Math.random() - 0.5) * 2,
                    y: (Math.random() - 0.5) * 2,
                    z: (Math.random() - 0.5) * 2,
                }));
                const phases = Array.from({ length: numPoints }, () => ({
                    x: Math.random() * Math.PI * 2,
                    y: Math.random() * Math.PI * 2,
                    z: Math.random() * Math.PI * 2,
                }));
                const baseColors = new Float32Array(numPoints * 3);
                for (let i = 0; i < numPoints; i++) {
                    const idx = i * 3;
                    baseColors[idx] = Math.random();
                    baseColors[idx + 1] = Math.random();
                    baseColors[idx + 2] = Math.random();
                }

                return setInterval(() => {
                    const t = Date.now() / 1000;
                    const amplitude = 0.05;
                    const positions = new Float32Array(numPoints * 3);
                    for (let i = 0; i < numPoints; i++) {
                        const basePoint = basePoints[i]!;
                        const phase = phases[i]!;
                        const idx = i * 3;

                        positions[idx] =
                            basePoint.x + Math.sin(t + phase.x) * amplitude;
                        positions[idx + 1] =
                            basePoint.y + Math.sin(t + phase.y) * amplitude;
                        positions[idx + 2] =
                            basePoint.z + Math.sin(t + phase.z) * amplitude;
                    }
                    context.publish(
                        topic.topic,
                        {
                            points: positions,
                            colors: baseColors,
                        } as PointsCloud,
                        Date.now(),
                        undefined,
                        [positions.buffer],
                    );
                }, 1000 / freq);
            }

            default:
                return setInterval(() => {
                    context.publish(topic.topic, Math.random(), Date.now());
                }, 1000 / freq);
        }
    };

    const listTopics = async (): Promise<DatasourceTopic[]> => {
        return settings.topics.map((topic) => ({
            topic: topic.topic,
            datasource_id: settings.id,
            source: settings,
            type: topic.type,
            rawType: topic.type,
        }));
    };

    return {
        init: async (newSettings) => {
            settings = newSettings;
            errorHandler = new DatasourceErrorHandler(newSettings.id);
            context.setRemoteCalls([]);
        },
        listTopics,
        subscribe: async (topic) => {
            const topicDef = getTopicDefinition(topic.topic);
            if (!topicDef) {
                return;
            }

            const count = subscribersCount.get(topic.topic) ?? 0;
            subscribersCount.set(topic.topic, count + 1);

            if (intervals.has(topic.topic)) {
                return;
            }

            const interval = generateInterval({
                ...topic,
                type: topicDef.type,
            });
            intervals.set(topic.topic, interval);
        },
        unsubscribe: async (topic, ignoreCount = false) => {
            const interval = intervals.get(topic.topic);

            if (ignoreCount && interval) {
                clearInterval(interval);
                intervals.delete(topic.topic);
                return;
            }

            const count = subscribersCount.get(topic.topic) ?? 0;
            const newCount = count - 1;
            subscribersCount.set(topic.topic, newCount);

            if (newCount <= 0 && interval) {
                clearInterval(interval);
                intervals.delete(topic.topic);
            }
        },
        executeRemoteCall: async (
            _definition: RemoteCallDefinition,
            _request: unknown,
            _options?: RemoteCallOptions,
        ) => {
            const callId = `random-${Date.now()}-${callCounter++}`;
            const result: RemoteCallResult = {
                success: false,
                error: "Remote calls are not supported by random datasource",
                duration: 0,
                status: "failed",
            };
            context.emitRemoteCallStatus(callId, "executing");
            context.emitRemoteCallResult(callId, result);
            return {
                callId,
                status: "failed",
            };
        },
        cancelRemoteCall: async () => false,
        shutdown: async () => {
            intervals.forEach((interval) => clearInterval(interval));
            intervals.clear();
            subscribersCount.clear();
        },
    };
});

// Global error handler for uncaught errors in worker
self.addEventListener("error", (event) => {
    console.error("[Random Datasource Worker] Uncaught error:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
    console.error(
        "[Random Datasource Worker] Unhandled promise rejection:",
        event.reason,
    );
});
