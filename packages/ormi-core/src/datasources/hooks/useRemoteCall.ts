"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useAtomValue } from "jotai";
import { usePluginsManager } from "@workspace/ormi-plugins";
import {
    RemoteCallDefinition,
    RemoteCallHandle,
    RemoteCallResult,
    RemoteCallStatus,
    RemoteCallOptions,
} from "../remote-call-interface";
import {
    allRemoteCallsAtom,
    remoteCallsAtom,
    remoteCallCountAtom,
} from "../remote-call-atoms";

// ============================================================================
// Hook State Interface
// ============================================================================

interface UseRemoteCallState<TFeedback> {
    /** Current status of the call */
    status: RemoteCallStatus;
    /** Whether a call is currently executing */
    isExecuting: boolean;
    /** Latest feedback received (only for calls with feedbackType) */
    feedback: TFeedback | null;
    /** Error message if the last call failed */
    error: string | null;
    /** Duration of the last call in ms */
    lastDuration: number | null;
}

interface UseRemoteCallReturn<
    TRequest,
    TResponse,
    TFeedback,
> extends UseRemoteCallState<TFeedback> {
    /** Execute the remote call with the given request */
    execute: (
        request: TRequest,
        options?: RemoteCallOptions,
    ) => Promise<RemoteCallResult<TResponse>>;
    /** Cancel the current call (only available if call.cancelable is true) */
    cancel: (() => Promise<boolean>) | undefined;
    /** Reset the hook state */
    reset: () => void;
    /** The call definition */
    definition: RemoteCallDefinition;
}

// ============================================================================
// useRemoteCall Hook
// ============================================================================

/**
 * React hook for executing remote calls (services/actions).
 *
 * @example
 * ```tsx
 * // Simple service call
 * const { execute, isExecuting, error } = useRemoteCall<SetBoolRequest, SetBoolResponse>(
 *   serviceDefinition
 * );
 *
 * const handleClick = async () => {
 *   const result = await execute({ data: true });
 *   if (result.success) {
 *     console.log('Response:', result.data);
 *   }
 * };
 * ```
 *
 * @example
 * ```tsx
 * // Action with feedback
 * const { execute, cancel, feedback, status } = useRemoteCall<
 *   NavigateGoal,
 *   NavigateResult,
 *   NavigateFeedback
 * >(actionDefinition);
 *
 * useEffect(() => {
 *   if (feedback) {
 *     console.log('Distance remaining:', feedback.distance_remaining);
 *   }
 * }, [feedback]);
 * ```
 */
function useRemoteCall<
    TRequest = unknown,
    TResponse = unknown,
    TFeedback = unknown,
>(
    definition: RemoteCallDefinition,
): UseRemoteCallReturn<TRequest, TResponse, TFeedback> {
    const pluginsManager = usePluginsManager();

    // State
    const [status, setStatus] = useState<RemoteCallStatus>("pending");
    const [isExecuting, setIsExecuting] = useState(false);
    const [feedback, setFeedback] = useState<TFeedback | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastDuration, setLastDuration] = useState<number | null>(null);

    // Current call handle ref (for cancellation)
    const handleRef = useRef<RemoteCallHandle<TFeedback, TResponse> | null>(
        null,
    );
    const feedbackUnsubscribeRef = useRef<(() => void) | null>(null);
    const statusUnsubscribeRef = useRef<(() => void) | null>(null);

    /**
     * Reset hook state
     */
    const reset = useCallback(() => {
        setStatus("pending");
        setIsExecuting(false);
        setFeedback(null);
        setError(null);
        setLastDuration(null);
        handleRef.current = null;

        // Cleanup subscriptions
        if (feedbackUnsubscribeRef.current) {
            feedbackUnsubscribeRef.current();
            feedbackUnsubscribeRef.current = null;
        }
        if (statusUnsubscribeRef.current) {
            statusUnsubscribeRef.current();
            statusUnsubscribeRef.current = null;
        }
    }, []);

    /**
     * Execute the remote call
     */
    const execute = useCallback(
        async (
            request: TRequest,
            options?: RemoteCallOptions,
        ): Promise<RemoteCallResult<TResponse>> => {
            // Reset state for new call
            setError(null);
            setFeedback(null);
            setIsExecuting(true);
            setStatus("pending");

            // Cleanup previous subscriptions
            if (feedbackUnsubscribeRef.current) {
                feedbackUnsubscribeRef.current();
                feedbackUnsubscribeRef.current = null;
            }
            if (statusUnsubscribeRef.current) {
                statusUnsubscribeRef.current();
                statusUnsubscribeRef.current = null;
            }

            const startTime = Date.now();

            try {
                // The hook pattern for remote calls:
                // {datasource_id}-execute-remote-call
                const executeHook = `${definition.datasource_id}-execute-remote-call`;

                // Execute the call through the datasource's registered filter
                // The filter returns a RemoteCallHandle
                const handle =
                    await pluginsManager.applyFilterAsync<RemoteCallHandle<
                        TFeedback,
                        TResponse
                    > | null>(executeHook, null, definition, request, options);

                if (!handle) {
                    const duration = Date.now() - startTime;
                    const errorResult: RemoteCallResult<TResponse> = {
                        success: false,
                        error: `No handler found for remote call: ${definition.name}`,
                        duration,
                        status: "failed",
                    };
                    setError(errorResult.error!);
                    setStatus("failed");
                    setIsExecuting(false);
                    setLastDuration(duration);
                    return errorResult;
                }

                handleRef.current = handle;

                // Subscribe to status changes
                statusUnsubscribeRef.current = handle.onStatusChange(
                    (newStatus) => {
                        setStatus(newStatus);
                    },
                );

                // Subscribe to feedback if available
                if (handle.onFeedback && definition.feedbackType) {
                    feedbackUnsubscribeRef.current = handle.onFeedback((fb) => {
                        setFeedback(fb);
                    });
                }

                setStatus("executing");

                // Wait for result
                const result = await handle.result;

                setStatus(result.status);
                setIsExecuting(false);
                setLastDuration(result.duration);

                if (!result.success) {
                    setError(result.error || "Unknown error");
                }

                // Cleanup subscriptions after completion
                if (feedbackUnsubscribeRef.current) {
                    feedbackUnsubscribeRef.current();
                    feedbackUnsubscribeRef.current = null;
                }
                if (statusUnsubscribeRef.current) {
                    statusUnsubscribeRef.current();
                    statusUnsubscribeRef.current = null;
                }

                return result;
            } catch (err) {
                const duration = Date.now() - startTime;
                const errorMessage =
                    err instanceof Error ? err.message : String(err);

                const errorResult: RemoteCallResult<TResponse> = {
                    success: false,
                    error: errorMessage,
                    duration,
                    status: "failed",
                };

                setError(errorMessage);
                setStatus("failed");
                setIsExecuting(false);
                setLastDuration(duration);

                if (options?.throwOnError) {
                    throw err;
                }

                return errorResult;
            }
        },
        [definition, pluginsManager],
    );

    /**
     * Cancel the current call
     */
    const cancel = useCallback(async (): Promise<boolean> => {
        if (!handleRef.current?.cancel) {
            return false;
        }

        try {
            const result = await handleRef.current.cancel();
            if (result) {
                setStatus("canceled");
                setIsExecuting(false);
            }
            return result;
        } catch (err) {
            console.error("Failed to cancel remote call:", err);
            return false;
        }
    }, []);

    return {
        execute,
        cancel: definition.cancelable ? cancel : undefined,
        reset,
        status,
        isExecuting,
        feedback: definition.feedbackType ? feedback : null,
        error,
        lastDuration,
        definition,
    };
}

// ============================================================================
// useAvailableRemoteCalls Hook
// ============================================================================

interface UseAvailableRemoteCallsFilter {
    datasource_id?: string;
    hasFeedback?: boolean;
    cancelable?: boolean;
}

/**
 * React hook to get all available remote calls from all datasources.
 * Uses Jotai atoms for event-driven updates - no polling needed.
 *
 * @example
 * ```tsx
 * const { calls, count, byDatasource } = useAvailableRemoteCalls();
 *
 * // Filter to only actions (calls with feedback)
 * const actions = calls.filter(c => c.feedbackType);
 * ```
 */
function useAvailableRemoteCalls(filter?: UseAvailableRemoteCallsFilter) {
    // Subscribe to the atoms - automatic re-render when they change
    const allCalls = useAtomValue(allRemoteCallsAtom);
    const callsByDatasource = useAtomValue(remoteCallsAtom);
    const count = useAtomValue(remoteCallCountAtom);

    // Apply local filters
    const filteredCalls = useMemo(() => {
        let result = allCalls;

        if (filter?.datasource_id) {
            result = result.filter(
                (c) => c.datasource_id === filter.datasource_id,
            );
        }

        if (filter?.hasFeedback !== undefined) {
            result = result.filter((c) =>
                filter.hasFeedback
                    ? c.feedbackType !== undefined
                    : c.feedbackType === undefined,
            );
        }

        if (filter?.cancelable !== undefined) {
            result = result.filter((c) => c.cancelable === filter.cancelable);
        }

        return result;
    }, [
        allCalls,
        filter?.datasource_id,
        filter?.hasFeedback,
        filter?.cancelable,
    ]);

    return {
        /** Filtered list of remote calls */
        calls: filteredCalls,
        /** Total count of all remote calls (unfiltered) */
        count,
        /** Remote calls grouped by datasource ID */
        byDatasource: callsByDatasource,
        /** Check if any remote calls are available */
        isEmpty: count === 0,
    };
}

// ============================================================================
// Exports
// ============================================================================

export { useRemoteCall, useAvailableRemoteCalls };
export type { UseRemoteCallState, UseRemoteCallReturn };
