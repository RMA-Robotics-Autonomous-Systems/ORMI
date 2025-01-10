"use client";

import { DatasourceDefinition } from '@/core/datasources/datasource-interface';

import { RandomDataSourceProvider } from './random-data-source';
import { RandomIMUSourceProvider } from './random-imu-source';
import { RosBridgeSuiteDataSourceSettings, RosBridgeSuiteSourceProvider } from './rosbridge-suite-source';
import { RandomDataSourceSettings } from '.';

const dataSourceExport = (current_datasource_type: DatasourceDefinition<any>[]) => {

    current_datasource_type.push({
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

    current_datasource_type.push({
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

    current_datasource_type.push({
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
                }
            }
        },

        data: {
            id: '',
            title: '',
            enable: true,
            url: '',
            reconnectTimeout: 2,
        },

        Provider: RosBridgeSuiteSourceProvider

    } as DatasourceDefinition<RosBridgeSuiteDataSourceSettings>);

    return current_datasource_type;
};

export default dataSourceExport;