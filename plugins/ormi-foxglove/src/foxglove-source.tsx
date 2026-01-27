/* eslint-disable @typescript-eslint/no-explicit-any */
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

import React, {
  ReactNode,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { ReadyState } from "react-use-websocket";

import { Spinner } from "@workspace/ui/components/spinner";
import { WebSocketStatusOverlay } from "@workspace/utils";
import { toast } from "sonner";

import { TransformTreeManager } from "./transform-tree-manager";
import { FoxgloveWorkerHost } from "./foxglove-worker-host";
import { FoxgloveDataSourceSettings } from "./types";
import { usePluginsManager } from "@workspace/ormi-plugins";

const FoxgloveSourceProvider = (
  children: ReactNode,
  props: FoxgloveDataSourceSettings,
) => {
  const pluginsManager = usePluginsManager();
  const hostRef = useRef<FoxgloveWorkerHost<FoxgloveDataSourceSettings> | null>(
    null,
  );
  const [initialized, setInitialized] = useState(false);
  const [readyState, setReadyState] = useState(ReadyState.CONNECTING);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);

  // Memoize connection status handler to prevent recreating on every render
  const handleConnectionStatus = useCallback(
    (status: {
      connected: boolean;
      error?: string;
      reconnectAttempt?: number;
    }) => {
      if (status.connected) {
        setReadyState(ReadyState.OPEN);
        setShowOverlay(false);
        setConnectionError(null);
        if (props.toasts) {
          toast.success("Connected to Foxglove server");
        }
      } else if (status.reconnectAttempt && status.reconnectAttempt > 0) {
        setReadyState(ReadyState.CONNECTING);
        setShowOverlay(true);
        setConnectionError(status.error ?? null);
      } else {
        setReadyState(ReadyState.CLOSED);
        setShowOverlay(true);
        setConnectionError(status.error ?? null);
        if (status.error && props.toasts) {
          toast.error(status.error);
        }
      }
      setReconnectAttempt(status.reconnectAttempt ?? 0);
    },
    [props.toasts],
  );

  useEffect(() => {
    let disposed = false;
    let host: FoxgloveWorkerHost<FoxgloveDataSourceSettings> | null = null;
    let unsubscribe: (() => void) | null = null;

    const worker = new Worker(
      new URL("./foxglove-source.worker.js", import.meta.url),
      {
        type: "module",
        name: `datasource:${props.id}`,
      },
    );

    host = new FoxgloveWorkerHost({
      worker,
      datasourceId: props.id,
      settings: props,
      pluginsManager,
    });

    hostRef.current = host;
    host.registerHooks();

    unsubscribe = host.onConnectionStatus((status) => {
      if (disposed) return;
      handleConnectionStatus(status);
    });

    // Initialize worker asynchronously
    host
      .init()
      .then(() => {
        if (!disposed) {
          setInitialized(true);
        }
      })
      .catch((error) => {
        if (!disposed) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            "[Foxglove] Failed to initialize worker:",
            errorMessage,
          );

          // Batch state updates for better performance
          setConnectionError(errorMessage);
          setShowOverlay(true);
          setInitialized(false);

          if (props.toasts) {
            toast.error("Failed to initialize Foxglove datasource");
          }
        }
      });

    return () => {
      disposed = true;
      if (unsubscribe) unsubscribe();
      if (host) host.dispose();
      hostRef.current = null;
    };
  }, [
    pluginsManager,
    props.id,
    props.url,
    props.reconnectTimeout,
    props.toasts,
    props.enable,
    props.title,
    props.transformTreeTopics,
    handleConnectionStatus,
  ]);

  return (
    <>
      <WebSocketStatusOverlay
        readyState={readyState}
        reconnectAttempt={reconnectAttempt}
        maxReconnectAttempts={10}
        error={connectionError}
        isVisible={showOverlay}
      />

      {initialized && (
        <TransformTreeManager settings={props}>{children}</TransformTreeManager>
      )}
    </>
  );
};

export { FoxgloveSourceProvider };
export type { FoxgloveDataSourceSettings };

// Hook to use the Foxglove context (deprecated)
export const useFoxgloveSource = () => {
  throw new Error("useFoxgloveSource is deprecated after worker migration");
};
