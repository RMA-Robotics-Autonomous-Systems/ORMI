"use client"

import { DatasourceDefinition } from 'ormi-core/datasources';

import { TelloSourceProvider, TelloSourceSettings } from './tello-datasource';
import { WidgetDefinition } from 'ormi-core';
import { TelloCommandsControlDefinition } from './widgets/command';

const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {

    datasources.push({
        id: 'tello-data-source',
        name: 'Tello',
        description: 'Tello data source',

        schema: {
            title: "Tello Data Source",
            type: 'object',
            properties: {
                title: { type: "string", title: "Title" },
                enable: { type: "boolean", title: "Enable" },
                ip: { type: "string", title: "IP" },
            }
        },

        data: {

            id: '',
            title: 'Tello',
            enable: true,
            ip: '192.168.10.1'

        } as TelloSourceSettings,

        Provider: ({ children, props }) => TelloSourceProvider(children, props)

    } as DatasourceDefinition<TelloSourceSettings>)

    return datasources;
};

export { dataSourceExport };


const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(TelloCommandsControlDefinition());


    return widgets;
}

export { WidgetExport };