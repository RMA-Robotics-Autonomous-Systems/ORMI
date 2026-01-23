/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import {
    Service,
    ServiceCallResponse,
    ServiceCallFailure,
} from "@foxglove/ws-protocol";
import { parse } from "@foxglove/rosmsg";
import { MessageReader, MessageWriter } from "@foxglove/rosmsg2-serialization";

import { FoxgloveDataSourceSettings } from "./types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { useFoxgloveData } from "./foxglove-data-handler";
import {
    RemoteCallDefinition,
    RemoteCallHandle,
    RemoteCallResult,
    RemoteCallStatus,
    RemoteCallOptions,
    setRemoteCalls,
    clearRemoteCallsFromDatasource,
} from "@workspace/ormi-core/datasources";
import { foxgloveIdlToJsonSchema } from "./foxglove-idl-to-jsonschema";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface ServiceManagerProps {
    children: ReactNode;
    settings: FoxgloveDataSourceSettings;
}

interface PendingServiceCall {
    callId: number;
    serviceId: number;
    serviceName: string;
    startTime: number;
    resolve: (result: RemoteCallResult) => void;
    reject: (error: Error) => void;
    reader: MessageReader;
    timeoutId?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Service Manager Component
// ============================================================================

const ServiceManager: React.FC<ServiceManagerProps> = ({ children, settings }) => {
    const { client, addCallback, removeCallback } = useFoxgloveData();
    const pluginsManager = usePluginsManager();

    // State
    const [services, setServices] = useState<Map<number, Service>>(new Map());
    const [isInitialized, setIsInitialized] = useState(false);

    // Refs
    const pendingCallsRef = useRef<Map<number, PendingServiceCall>>(new Map());
    const callIdCounterRef = useRef(1);
    const writersRef = useRef<Map<number, MessageWriter>>(new Map());
    const readersRef = useRef<Map<number, MessageReader>>(new Map());

    const datasource_id = settings.id;
    const available_remote_calls_hook = `${datasource_id}-available-remote-calls`;
    const execute_remote_call_hook = `${datasource_id}-execute-remote-call`;
    const remote_call_definition_hook = `${datasource_id}-remote-call-definition`;

    // ========================================================================
    // Service Discovery
    // ========================================================================

    const handleAdvertiseServices = useCallback((newServices: Service[]) => {
        setServices((prev) => {
            const updated = new Map(prev);
            for (const service of newServices) {
                updated.set(service.id, service);

                // Pre-create message writer/reader for the service
                if (service.request?.schema) {
                    try {
                        const parsedRequest = parse(service.request.schema, { ros2: true });
                        writersRef.current.set(service.id, new MessageWriter(parsedRequest));
                    } catch (err) {
                        console.error(`Failed to create writer for service ${service.name}:`, err);
                    }
                }
                if (service.response?.schema) {
                    try {
                        const parsedResponse = parse(service.response.schema, { ros2: true });
                        readersRef.current.set(service.id, new MessageReader(parsedResponse));
                    } catch (err) {
                        console.error(`Failed to create reader for service ${service.name}:`, err);
                    }
                }
            }
            return updated;
        });

        if (settings.toasts && newServices.length > 0) {
            toast(`Discovered ${newServices.length} service(s)`);
        }
    }, [settings.toasts]);

    const handleUnadvertiseServices = useCallback((removedServiceIds: number[]) => {
        setServices((prev) => {
            const updated = new Map(prev);
            for (const id of removedServiceIds) {
                updated.delete(id);
                writersRef.current.delete(id);
                readersRef.current.delete(id);
            }
            return updated;
        });
    }, []);

    // ========================================================================
    // Service Call Response Handling
    // ========================================================================

    const handleServiceCallResponse = useCallback((response: ServiceCallResponse) => {
        const pending = pendingCallsRef.current.get(response.callId);
        if (!pending) {
            console.warn(`Received response for unknown call ID: ${response.callId}`);
            return;
        }

        // Clear timeout
        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }

        const duration = Date.now() - pending.startTime;

        try {
            // Decode the response data
            const reader = pending.reader;
            const decodedData = reader.readMessage(response.data);

            const result: RemoteCallResult = {
                success: true,
                data: decodedData,
                duration,
                status: "succeeded",
            };

            pending.resolve(result);
        } catch (err) {
            const result: RemoteCallResult = {
                success: false,
                error: `Failed to decode response: ${err instanceof Error ? err.message : String(err)}`,
                duration,
                status: "failed",
            };
            pending.resolve(result);
        }

        pendingCallsRef.current.delete(response.callId);
    }, []);

    const handleServiceCallFailure = useCallback((failure: ServiceCallFailure) => {
        const pending = pendingCallsRef.current.get(failure.callId);
        if (!pending) {
            console.warn(`Received failure for unknown call ID: ${failure.callId}`);
            return;
        }

        // Clear timeout
        if (pending.timeoutId) {
            clearTimeout(pending.timeoutId);
        }

        const duration = Date.now() - pending.startTime;

        const result: RemoteCallResult = {
            success: false,
            error: failure.message,
            duration,
            status: "failed",
        };

        pending.resolve(result);
        pendingCallsRef.current.delete(failure.callId);
    }, []);

    // ========================================================================
    // Convert Service to RemoteCallDefinition
    // ========================================================================

    const serviceToRemoteCallDefinition = useCallback((service: Service): RemoteCallDefinition => {
        // Parse schemas to JSON Schema
        let requestSchema;
        let responseSchema;

        if (service.request?.schema) {
            try {
                // First parse the IDL string, then convert to JSON Schema
                const parsedRequest = parse(service.request.schema, { ros2: true });
                requestSchema = foxgloveIdlToJsonSchema(parsedRequest);
            } catch (err) {
                console.warn(`Failed to parse request schema for ${service.name}:`, err);
            }
        }

        if (service.response?.schema) {
            try {
                // First parse the IDL string, then convert to JSON Schema
                const parsedResponse = parse(service.response.schema, { ros2: true });
                responseSchema = foxgloveIdlToJsonSchema(parsedResponse);
            } catch (err) {
                console.warn(`Failed to parse response schema for ${service.name}:`, err);
            }
        }

        return {
            name: service.name,
            datasource_id: datasource_id,
            source: settings,

            requestType: service.request?.schemaName || service.type + "_Request",
            rawRequestType: service.request?.schemaName || service.type + "_Request",
            requestSchema,

            responseType: service.response?.schemaName || service.type + "_Response",
            rawResponseType: service.response?.schemaName || service.type + "_Response",
            responseSchema,

            // Foxglove services don't have feedback (they're not actions)
            feedbackType: undefined,
            rawFeedbackType: undefined,
            feedbackSchema: undefined,

            // Foxglove services are not cancelable
            cancelable: false,

            description: `Service type: ${service.type}`,
        };
    }, [datasource_id, settings]);

    // ========================================================================
    // Execute Remote Call
    // ========================================================================

    const executeRemoteCall = useCallback(async (
        definition: RemoteCallDefinition,
        request: any,
        options?: RemoteCallOptions
    ): Promise<RemoteCallHandle> => {
        // Find the service
        const service = Array.from(services.values()).find(s => s.name === definition.name);
        if (!service) {
            throw new Error(`Service not found: ${definition.name}`);
        }

        if (!client) {
            throw new Error("Foxglove client not connected");
        }

        const writer = writersRef.current.get(service.id);
        const reader = readersRef.current.get(service.id);

        if (!writer) {
            throw new Error(`No writer available for service: ${definition.name}`);
        }
        if (!reader) {
            throw new Error(`No reader available for service: ${definition.name}`);
        }

        const callId = callIdCounterRef.current++;
        const startTime = Date.now();

        // Status tracking
        let currentStatus: RemoteCallStatus = "pending";
        const statusCallbacks: ((status: RemoteCallStatus) => void)[] = [];

        const updateStatus = (newStatus: RemoteCallStatus) => {
            currentStatus = newStatus;
            statusCallbacks.forEach(cb => cb(newStatus));
        };

        // Create the result promise
        const resultPromise = new Promise<RemoteCallResult>((resolve, reject) => {
            // Encode the request
            let encodedRequest: Uint8Array;
            try {
                encodedRequest = writer.writeMessage(request);
            } catch (err) {
                const result: RemoteCallResult = {
                    success: false,
                    error: `Failed to encode request: ${err instanceof Error ? err.message : String(err)}`,
                    duration: 0,
                    status: "failed",
                };
                updateStatus("failed");
                resolve(result);
                return;
            }

            // Create pending call entry
            const pendingCall: PendingServiceCall = {
                callId,
                serviceId: service.id,
                serviceName: service.name,
                startTime,
                resolve: (result) => {
                    updateStatus(result.status);
                    resolve(result);
                },
                reject,
                reader,
            };

            // Setup timeout if specified
            if (options?.timeout && options.timeout > 0) {
                pendingCall.timeoutId = setTimeout(() => {
                    const duration = Date.now() - startTime;
                    const result: RemoteCallResult = {
                        success: false,
                        error: `Service call timed out after ${options.timeout}ms`,
                        duration,
                        status: "failed",
                    };
                    updateStatus("failed");
                    resolve(result);
                    pendingCallsRef.current.delete(callId);
                }, options.timeout);
            }

            pendingCallsRef.current.set(callId, pendingCall);

            // Send the service call request
            updateStatus("executing");
            client.sendServiceCallRequest({
                serviceId: service.id,
                callId,
                encoding: service.request?.encoding || "cdr",
                data: encodedRequest,
            });
        });

        // Return the handle
        const handle: RemoteCallHandle = {
            id: String(callId),
            status: currentStatus,
            result: resultPromise,
            onStatusChange: (callback) => {
                statusCallbacks.push(callback);
                return () => {
                    const index = statusCallbacks.indexOf(callback);
                    if (index > -1) {
                        statusCallbacks.splice(index, 1);
                    }
                };
            },
            // Foxglove services don't support feedback
            onFeedback: undefined,
            // Foxglove services are not cancelable
            cancel: undefined,
        };

        return handle;
    }, [client, services]);

    // ========================================================================
    // Effect: Setup Client Event Listeners
    // ========================================================================

    useEffect(() => {
        if (!client) return;

        // Register event handlers
        const advertiseHandler = (newServices: Service[]) => handleAdvertiseServices(newServices);
        const unadvertiseHandler = (removedIds: number[]) => handleUnadvertiseServices(removedIds);
        const responseHandler = (response: ServiceCallResponse) => handleServiceCallResponse(response);
        const failureHandler = (failure: ServiceCallFailure) => handleServiceCallFailure(failure);

        client.on("advertiseServices", advertiseHandler);
        client.on("unadvertiseServices", unadvertiseHandler);
        client.on("serviceCallResponse", responseHandler);
        client.on("serviceCallFailure", failureHandler);

        setIsInitialized(true);

        return () => {
            client.off("advertiseServices", advertiseHandler);
            client.off("unadvertiseServices", unadvertiseHandler);
            client.off("serviceCallResponse", responseHandler);
            client.off("serviceCallFailure", failureHandler);

            // Clean up pending calls
            pendingCallsRef.current.forEach((pending) => {
                if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                }
                pending.reject(new Error("Service manager cleanup"));
            });
            pendingCallsRef.current.clear();
        };
    }, [client, handleAdvertiseServices, handleUnadvertiseServices, handleServiceCallResponse, handleServiceCallFailure]);

    // ========================================================================
    // Effect: Sync Services to Atoms
    // ========================================================================

    useEffect(() => {
        if (!isInitialized) return;

        // Convert services to RemoteCallDefinitions and push to atoms
        const remoteCallDefs = Array.from(services.values()).map(serviceToRemoteCallDefinition);
        setRemoteCalls(datasource_id, remoteCallDefs);

        // Cleanup: Remove this datasource's remote calls when unmounting
        return () => {
            clearRemoteCallsFromDatasource(datasource_id);
        };
    }, [isInitialized, services, serviceToRemoteCallDefinition, datasource_id]);

    // ========================================================================
    // Effect: Register Plugin Hooks
    // ========================================================================

    useEffect(() => {
        if (!isInitialized) return;

        // Register available remote calls filter
        pluginsManager.addFilter(PluginsHooks.AVAILABLE_REMOTE_CALLS, {
            id: available_remote_calls_hook,
            priority: 100,
            filter: (calls: RemoteCallDefinition[]) => {
                const foxgloveCalls = Array.from(services.values()).map(serviceToRemoteCallDefinition);
                return [...calls, ...foxgloveCalls];
            },
        });

        // Register execute remote call filter
        pluginsManager.addFilter(execute_remote_call_hook, {
            id: execute_remote_call_hook,
            priority: 100,
            filter: async (
                _initialResult: RemoteCallHandle | null,
                definition: RemoteCallDefinition,
                request: any,
                options?: RemoteCallOptions
            ) => {
                // Only handle calls for this datasource
                if (definition.datasource_id !== datasource_id) {
                    return _initialResult;
                }

                try {
                    return await executeRemoteCall(definition, request, options);
                } catch (err) {
                    console.error("Failed to execute remote call:", err);
                    // Return a failed handle
                    const errorResult: RemoteCallResult = {
                        success: false,
                        error: err instanceof Error ? err.message : String(err),
                        duration: 0,
                        status: "failed",
                    };
                    return {
                        id: "error",
                        status: "failed" as RemoteCallStatus,
                        result: Promise.resolve(errorResult),
                        onStatusChange: () => () => {},
                    } as RemoteCallHandle;
                }
            },
        });

        // Register remote call definition filter
        pluginsManager.addFilter(PluginsHooks.REMOTE_CALL_DEFINITION, {
            id: remote_call_definition_hook,
            priority: 100,
            filter: (
                current: RemoteCallDefinition | null,
                targetDatasourceId: string,
                callName: string
            ) => {
                if (targetDatasourceId !== datasource_id) {
                    return current;
                }

                const service = Array.from(services.values()).find(s => s.name === callName);
                if (service) {
                    return serviceToRemoteCallDefinition(service);
                }

                return current;
            },
        });

        return () => {
            pluginsManager.removeFilter(available_remote_calls_hook);
            pluginsManager.removeFilter(execute_remote_call_hook);
            pluginsManager.removeFilter(remote_call_definition_hook);
        };
    }, [
        isInitialized,
        services,
        datasource_id,
        pluginsManager,
        serviceToRemoteCallDefinition,
        executeRemoteCall,
        available_remote_calls_hook,
        execute_remote_call_hook,
        remote_call_definition_hook,
    ]);

    return <>{children}</>;
};

export { ServiceManager };
