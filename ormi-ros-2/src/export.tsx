"use client"

import { DatasourceDefinition } from 'ormi-core/datasources';

import { RosBridgeSuiteDataSourceSettings, RosBridgeSuiteSourceProvider } from './rosbridge-suite-source';
import { WidgetDefinition } from 'ormi-core/widgets';
import { Ros2ConvertionGraphDefinition } from './ros2/convertion-graph';
import { RQTGraphDefinition } from './ros2/rqt-graph';

export const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {

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

        Provider: ({ children, props }) => RosBridgeSuiteSourceProvider(children, props)

    } as DatasourceDefinition<RosBridgeSuiteDataSourceSettings>);

    return datasources;
};


export const widgetsExport = (widgets: WidgetDefinition[]) => {

    widgets.push(Ros2ConvertionGraphDefinition());
    widgets.push(RQTGraphDefinition());

    return widgets;
}