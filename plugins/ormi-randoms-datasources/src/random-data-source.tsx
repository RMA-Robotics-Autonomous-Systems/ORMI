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
	createContext,
	useContext,
	ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";

import { RandomDataSourceSettings } from "./index";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { WorkerDatasourceHost } from "@workspace/ormi-core/datasources";
import { Spinner } from "@workspace/ui/components/spinner";

const RandomDataSourceContext = createContext(null);

// Create a provider component
const RandomDataSourceProvider = (
	children: ReactNode,
	props: RandomDataSourceSettings,
) => {
	const pluginsManager = usePluginsManager();
	const hostRef =
		useRef<WorkerDatasourceHost<RandomDataSourceSettings> | null>(null);
	const [initialized, setInitialized] = useState(false);

	useEffect(() => {
		let disposed = false;
		let host: WorkerDatasourceHost<RandomDataSourceSettings> | null = null;

		const worker = new Worker(
			new URL("./random-data-source.worker.js", import.meta.url),
			{
				type: "module",
				name: `datasource:${props.id}`,
			},
		);

		host = new WorkerDatasourceHost({
			worker,
			datasourceId: props.id,
			settings: props,
			pluginsManager,
		});

		hostRef.current = host;
		host.registerHooks();

		host.init()
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
						"[Random Datasource] Failed to initialize worker:",
						errorMessage,
					);
					setInitialized(false);
				}
			});

		return () => {
			disposed = true;
			if (host) host.dispose();
			hostRef.current = null;
		};
	}, [pluginsManager, props.id, props.enable, props.title, props.topics]);

	return (
		<RandomDataSourceContext.Provider value={null}>
			{initialized && children}
			{!initialized && <Spinner />}
		</RandomDataSourceContext.Provider>
	);
};

// Create a custom hook to use the context
const useRandomProvider = () => {
	const context = useContext(RandomDataSourceContext);
	if (context === undefined) {
		throw new Error(
			"useRandomProvider must be used within a RandomDataSourceProvider",
		);
	}
	return context;
};

export { RandomDataSourceProvider, useRandomProvider };
