"use client";

import { DatasourceDefinition } from '@/core/datasources/datasource-interface';

import { RandomDataSourceProvider } from './random-data-source';

const dataSourceExport = (current_datasource_type: DatasourceDefinition[]) => {

    const layout = {
        type: 'VerticalLayout',
        elements: []
    }


    current_datasource_type.push({
        id: 'random-data-source',
        name: 'Random',
        description: 'Random data source',

        schema: {
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
            }
        },

        uischema: layout,

        data: {
            topic: '',
            frequency: 1
        },

        Provider: RandomDataSourceProvider

    });

    return current_datasource_type;
};

export default dataSourceExport;