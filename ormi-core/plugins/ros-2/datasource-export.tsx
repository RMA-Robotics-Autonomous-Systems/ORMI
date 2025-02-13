"use client"

import { DatasourceDefinition } from '@/core/datasources/datasource-interface';

import { RosBridgeSuiteDataSourceSettings, RosBridgeSuiteSourceProvider } from './rosbridge-suite-source';

const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {

    datasources.push({
        id: 'rosbridge-suite-source',
        name: 'ROS',
        description: 'ROS data source',

        schema: {
            title: "ROS Bridge Suite",
            type: 'object',
            properties: {
                title: { type: "string", title: "Title" },
                enable: { type: "boolean", title: "Enable" },

                url: {
                    type: 'string',
                    title: 'URL'
                },
                reconnectTimeout: {
                    type: 'number',
                    title: 'Reconnect Timeout (s)'
                },
                toasts: {
                    type: 'boolean',
                    title: 'Display Toasts'
                }

            }
        },

        data: {
            id: '',
            title: '',
            enable: true,
            toasts: false,
            url: '',
            reconnectTimeout: 2,
        },

        Provider: RosBridgeSuiteSourceProvider

    } as DatasourceDefinition<RosBridgeSuiteDataSourceSettings>);

    return datasources;
};

export default dataSourceExport;