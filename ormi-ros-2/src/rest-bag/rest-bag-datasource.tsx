"use client"

import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { DatasourceProviderSettings, DatasourceDefinition } from 'ormi-core/datasources';
import { Spinner } from 'ormi-core/components';
import { usePluginsManager } from 'ormi-core/plugins';
import { RestBagClient } from './rest-bag-client';


const RestBagDataSourceContext = createContext(null);

interface RestBagDatasourceSettings extends DatasourceProviderSettings {
    url: string;
}

// Create a provider component
const RestBagDataSourceProvider = (children: ReactNode, props: RestBagDatasourceSettings) => {
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
                return url
            }
        });

        pluginsManager.addFilter(`${id}-client`, {
            id: `${id}-client`,
            priority: 10,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            filter: (__client: RestBagClient) => {
                return bagClient;
            }
        });

        setInitialized(true);

        return () => {
            pluginsManager.removeFilter(`${id}-api-url`);
            pluginsManager.removeFilter(`${id}-client`);
        }
    }, []);

    return (
        <RestBagDataSourceContext.Provider value={null}>
            {initialized && children}
            {!initialized && <Spinner />}
        </RestBagDataSourceContext.Provider>
    );
};

// Create a custom hook to use the context
const useRestBagProvider = () => {
    const context = useContext(RestBagDataSourceContext);
    if (context === null) {
        throw new Error('useRestBagProvider must be used within a RestBagDataSourceProvider');
    }
    return context;
};

export { RestBagDataSourceProvider, useRestBagProvider };

export const RestBagDatasourceDefinition = {
    id: 'rest-bag-source',
    name: 'RestBag API',
    description: 'Connect to a RestBag API',

    schema: {
        title: "RestBag API",
        type: 'object',
        properties: {
            title: { type: "string", title: "Title" },
            enable: { type: "boolean", title: "Enable" },
            url: {
                type: 'string',
                title: 'URL'
            },
        }
    },

    data: {
        id: '',
        title: '',
        enable: true,
        url: '',
    },

    Provider: ({ children, props }) => RestBagDataSourceProvider(children, props)

} as DatasourceDefinition<RestBagDatasourceSettings>;