"use client"

import { DatasourceDefinition } from '@/core/datasources/datasource-interface';

import { RandomDataSourceProvider } from './random-data-source';
import { RandomIMUSourceProvider } from './random-imu-source';
import { RandomDataSourceSettings } from '.';

const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {

    datasources.push({
        id: 'random-data-source',
        name: 'Random',
        description: 'Random data source',

        schema: {
            title: "Random Data Source",
            type: 'object',
            properties: {
                title: { type: "string", title: "Title" },
                enable: { type: "boolean", title: "Enable" },

                topics: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            topic: {
                                type: 'string',
                                title: 'Topic'
                            },
                            frequency: {
                                type: 'number',
                                title: 'Frequency'
                            }
                        },
                        required: ['topic', 'frequency']
                    }
                }
            }
        },

        data: {
            id: '',
            title: '',
            enable: true,
            topics: [],
        },

        Provider: RandomDataSourceProvider

    } as DatasourceDefinition<RandomDataSourceSettings>)

    datasources.push({
        id: 'imu-data-source',
        name: 'IMU',
        description: 'IMU data source',

        schema: {
            title: "IMU Data Source",
            type: 'object',
            properties: {
                title: { type: "string", title: "Title" },
                enable: { type: "boolean", title: "Enable" },

                topics: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            topic: {
                                type: 'string',
                                title: 'Topic'
                            },
                            frequency: {
                                type: 'number',
                                title: 'Frequency'
                            }
                        },
                        required: ['topic', 'frequency']
                    }
                }
            }
        },

        data: {
            id: '',
            title: '',
            enable: true,
            topics: [],
        },

        Provider: RandomIMUSourceProvider

    } as DatasourceDefinition<RandomDataSourceSettings>);

    return datasources;
};

export default dataSourceExport;