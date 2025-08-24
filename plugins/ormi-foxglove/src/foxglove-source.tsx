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

import { Channel, FoxgloveClient } from '@foxglove/ws-protocol';

import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from 'sonner';

import { WebSocketProvider, useWebSocket } from '@workspace/utils';
import { FoxgloveDataHandler, useFoxgloveData } from './foxglove-data-handler';
import { SubscriptionManager } from './subscription-manager';
import { PublisherManager } from './publisher-manager';
import { TransformTreeManager } from './transform-tree-manager';
import { TypeSystemManager } from './type-system-manager';
import { FoxgloveDataSourceSettings, Subscriber, PendingSubscription, Publisher } from './types';


const FoxgloveSourceProvider = (children: ReactNode, props: FoxgloveDataSourceSettings) => {
    const [clientConnected, setClientConnected] = React.useState(false);

    return (
        <WebSocketProvider
            url={props.url}
            protocols={[FoxgloveClient.SUPPORTED_SUBPROTOCOL, "foxglove.sdk.v1"]}
            reconnectAttempts={10}
            reconnectInterval={props.reconnectTimeout * 1000 || 3000}
            onError={(error) => {
                if (props.toasts) {
                    toast(`Foxglove connection error: ${error.message}`);
                }
                console.error('Foxglove WebSocket error:', error);
            }}
            onOpen={(event) => {
                if (props.toasts) {
                    toast('Connected to Foxglove server');
                }
                setClientConnected(true);
            }}
            onClose={(event) => {
                if (props.toasts && !event.wasClean) {
                    toast('Disconnected from Foxglove server');
                }
                setClientConnected(false);
            }}
        >
            {clientConnected &&
                <FoxgloveDataHandler settings={props}>
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

            {!clientConnected && <Spinner />}
        </WebSocketProvider>
    );
};


export { FoxgloveSourceProvider };
export type { FoxgloveDataSourceSettings };

// Hook to use the Foxglove context
export const useFoxgloveSource = () => {
    return useFoxgloveData();
};