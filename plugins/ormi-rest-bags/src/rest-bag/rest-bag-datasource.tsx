"use client";

import React, { ReactNode, useEffect, useState } from "react";
import { RestBagClient } from "./rest-bag-client";
import { usePluginsManager } from "@workspace/ormi-plugins";
import {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "@workspace/ormi-core/datasources";
import { Spinner } from "@workspace/ui/components/spinner";

interface RestBagDatasourceSettings extends DatasourceProviderSettings {
	url: string;
}

/**
 * Lifecycle component for REST bag datasource.
 * Registers API URL and client filters via PluginsManager.
 */
const RestBagDataSourceProvider = (
	children: ReactNode,
	props: RestBagDatasourceSettings,
) => {
	const pluginsManager = usePluginsManager();
	const { url, id } = props;
	const [initialized, setInitialized] = useState(false);

	const [bagClient] = useState(new RestBagClient(url));

	useEffect(() => {
		pluginsManager.addFilter(`${id}-api-url`, {
			id: `${id}-api-url`,
			priority: 10,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			filter: (_api_url: string) => {
				return url;
			},
		});

		pluginsManager.addFilter(`${id}-client`, {
			id: `${id}-client`,
			priority: 10,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			filter: (__client: RestBagClient) => {
				return bagClient;
			},
		});

		setInitialized(true);

		return () => {
			pluginsManager.removeFilter(`${id}-api-url`);
			pluginsManager.removeFilter(`${id}-client`);
		};
	}, []);

	return (
		<>
			{initialized && children}
			{!initialized && <Spinner />}
		</>
	);
};

export { RestBagDataSourceProvider };

export const RestBagDatasourceDefinition = {
	id: "rest-bag-source",
	name: "RestBag API",
	description: "Connect to a RestBag API",

	schema: {
		title: "RestBag API",
		type: "object",
		properties: {
			title: { type: "string", title: "Title" },
			enable: { type: "boolean", title: "Enable" },
			url: {
				type: "string",
				title: "URL",
			},
		},
	},

	data: {
		id: "",
		title: "",
		enable: true,
		url: "http://localhost:8000/",
	},

	Provider: ({ children, props }) =>
		RestBagDataSourceProvider(children, props),
} as DatasourceDefinition<RestBagDatasourceSettings>;
