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

import React, { ReactNode } from 'react';
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
            },
            onClose: (event) => {
                if (props.toasts && !event.wasClean) {
                    toast('Disconnected from Foxglove server');
                }
                setClientConnected(false);
            },
            onError: (event) => {
                const errorMessage = `Foxglove connection error: ${event.type}`;
                if (props.toasts) {
                    toast(errorMessage);
                }
                console.error('Foxglove WebSocket error:', event);
                setConnectionError(errorMessage);
            },
            onReconnectStop: (numAttempts) => {
                setConnectionError(`Failed to reconnect after ${numAttempts} attempts`);
            },
        }
    );

    React.useEffect(() => {
        setClientConnected(readyState === ReadyState.OPEN);
    }, [readyState]);

    // Track reconnection attempts by monitoring state changes
    React.useEffect(() => {
        if (readyState === ReadyState.CONNECTING && clientConnected === false) {
            setReconnectAttempt(prev => prev + 1);
        }
    }, [readyState, clientConnected]);

    return (
        <>
            <WebSocketStatusOverlay
                readyState={readyState}
                reconnectAttempt={reconnectAttempt}
                maxReconnectAttempts={10}
                error={connectionError}
                isVisible={!clientConnected}
            />

            {clientConnected &&
                <FoxgloveDataHandler settings={props} webSocket={getWebSocket()}>
                    <TypeSystemManager settings={props}>
                        {/* <SubscriptionManager settings={props}>
                            <PublisherManager settings={props}>
                                <TransformTreeManager settings={props}>
                                    {children}
                                </TransformTreeManager>
                            </PublisherManager>
                        </SubscriptionManager> */}
                        {children}
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