/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
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

import React, { ReactNode, useEffect, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';

import { Channel, FoxgloveClient } from '@foxglove/ws-protocol';

import { Spinner } from '@workspace/ui/components/spinner';
import { WebSocketStatusOverlay } from '@workspace/utils';
import { toast } from 'sonner';

import { FoxgloveDataHandler, useFoxgloveData } from './foxglove-data-handler';
import { SubscriptionManager } from './subscription-manager';
import { PublisherManager } from './publisher-manager';
import { TransformTreeManager } from './transform-tree-manager';
import { TypeSystemManager } from './type-system-manager';
import { FoxgloveDataSourceSettings, Subscriber, PendingSubscription, Publisher } from './types';


const FoxgloveSourceProvider = (children: ReactNode, props: FoxgloveDataSourceSettings) => {
    const [clientConnected, setClientConnected] = React.useState(false);
    const [reconnectAttempt, setReconnectAttempt] = React.useState(0);
    const [connectionError, setConnectionError] = React.useState<string | null>(null);
    const [showOverlay, setShowOverlay] = React.useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // Prevent hydration issues by only showing content after mount
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const { lastMessage, sendMessage, readyState, getWebSocket } = useWebSocket(
        props.url,
        {
            protocols: [FoxgloveClient.SUPPORTED_SUBPROTOCOL, "foxglove.sdk.v1"],
            shouldReconnect: () => true,
            reconnectAttempts: 10,
            reconnectInterval: props.reconnectTimeout * 1000 || 3000,
            onOpen: () => {
                if (props.toasts) {
                    toast('Connected to Foxglove server');
                }
                setClientConnected(true);
                setReconnectAttempt(0);
                setConnectionError(null);
                setShowOverlay(false);
            },
            onClose: (event) => {
                if (props.toasts && !event.wasClean) {
                    toast('Disconnected from Foxglove server');
                }
                setClientConnected(false);
                setShowOverlay(true);

                // If it's not a clean close, we'll be reconnecting
                if (!event.wasClean) {
                    setReconnectAttempt(prev => prev + 1);
                }
            },
            onError: (event) => {
                const errorMessage = `Foxglove connection error: ${event.type}`;
                if (props.toasts) {
                    toast(errorMessage);
                }
                console.error('Foxglove WebSocket error:', event);
                setConnectionError(errorMessage);
                setShowOverlay(true);
            },
            onReconnectStop: (numAttempts) => {
                const errorMessage = `Failed to reconnect after ${numAttempts} attempts`;
                setConnectionError(errorMessage);
                setShowOverlay(true);
                if (props.toasts) {
                    toast(errorMessage);
                }
            },
        }
    );

    React.useEffect(() => {
        setClientConnected(readyState === ReadyState.OPEN);

        // Show overlay when not connected, except when cleanly closed without reconnection
        if (readyState === ReadyState.OPEN) {
            setShowOverlay(false);
        } else {
            setShowOverlay(true);
        }
    }, [readyState]);

    // Don't render anything until mounted to prevent hydration mismatch
    if (!isMounted) {
        return null;
    }

    return (
        <>
            <WebSocketStatusOverlay
                readyState={readyState}
                reconnectAttempt={reconnectAttempt}
                maxReconnectAttempts={10}
                error={connectionError}
                isVisible={showOverlay}
            />

            {clientConnected &&
                <FoxgloveDataHandler settings={props} webSocket={getWebSocket()}>
                    <TypeSystemManager settings={props}>
                        <SubscriptionManager settings={props}>
                            <PublisherManager settings={props}>
                                <TransformTreeManager settings={props}>
                                    {children}
                                </TransformTreeManager>
                            </PublisherManager>
                        </SubscriptionManager>
                    </TypeSystemManager>
                </FoxgloveDataHandler>}
        </>
    );
};


export { FoxgloveSourceProvider };
export type { FoxgloveDataSourceSettings };

// Hook to use the Foxglove context
export const useFoxgloveSource = () => {
    return useFoxgloveData();
};