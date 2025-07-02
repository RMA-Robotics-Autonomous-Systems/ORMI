"use client"
/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/


import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { TransformTree } from '../types';
import { PluginsHooks, usePluginsManager } from '@workspace/ormi-plugins';


interface TransformSources {
    transformsTrees: Map<string, TransformTree>;
}

interface TransformSourcesProviderProps {
    children: ReactNode;
    updateRate: number; // in hz
}

// Helper function to check if two transform trees are different
const areTransformTreesDifferent = (
    treeA: Map<string, TransformTree>,
    treeB: Map<string, TransformTree>
): boolean => {
    if (treeA.size !== treeB.size) return true;

    // Using Array.from and forEach for better ES5 compatibility
    Array.from(treeA.entries()).forEach(entry => {
        const key = entry[0];
        const valueA = entry[1];

        if (!treeB.has(key)) return true;
        const valueB = treeB.get(key);

        // Deep comparison of TransformTree objects
        if (JSON.stringify(valueA) !== JSON.stringify(valueB)) {
            return true;
        }
    });

    return false;
};

const TransformSourcesContext = createContext<TransformSources>({
    transformsTrees: new Map<string, TransformTree>()
});

const TransformSourcesProvider = (props: TransformSourcesProviderProps) => {

    const { children } = props;

    const pluginsManager = usePluginsManager();

    const [transformsTrees, setTransformsTrees] = useState<Map<string, TransformTree>>(new Map<string, TransformTree>());
    const currentTreesRef = useRef<Map<string, TransformTree>>(new Map<string, TransformTree>());

    useEffect(() => {
        // create a random id for the local datasource

        // Set up an interval to fetch transform trees
        const intervalId = setInterval(async () => {
            try {
                const newTrees = await pluginsManager.applyFilterAsync<Map<string, TransformTree>>(
                    PluginsHooks.TRANSFORM_TREE,
                    new Map<string, TransformTree>()
                );

                if (newTrees && areTransformTreesDifferent(newTrees, currentTreesRef.current)) {
                    setTransformsTrees(newTrees);
                    currentTreesRef.current = newTrees;
                }
            } catch (error) {
                console.error("Error fetching transform trees:", error);
            }
        }, 1000 / props.updateRate); // Convert Hz to milliseconds

        // Initial fetch
        (async () => {
            try {
                const newTrees = await pluginsManager.applyFilterAsync<Map<string, TransformTree>>(
                    PluginsHooks.TRANSFORM_TREE,
                    new Map<string, TransformTree>()
                );

                if (newTrees && areTransformTreesDifferent(newTrees, currentTreesRef.current)) {
                    setTransformsTrees(newTrees);
                    currentTreesRef.current = newTrees;
                }
            } catch (error) {
                console.error("Error in initial transform trees fetch:", error);
            }
        })();

        // Cleanup function to clear the interval when component unmounts
        return () => {
            clearInterval(intervalId);
            setTransformsTrees(new Map<string, TransformTree>());
            currentTreesRef.current = new Map<string, TransformTree>();
        };

    }, []);

    return (
        <TransformSourcesContext.Provider value={{ transformsTrees }}>
            {children}
        </TransformSourcesContext.Provider>
    );
};

const useTransformSource = () => {
    const context = useContext(TransformSourcesContext);
    if (!context) {
        throw new Error('useTransformSource must be used within a GlobalDataSourcesProvider');
    }

    return context;
};

export { TransformSourcesProvider, useTransformSource };