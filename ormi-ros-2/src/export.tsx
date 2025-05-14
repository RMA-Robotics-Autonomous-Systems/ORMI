"use client"

import { Datasource, DatasourceDefinition } from 'ormi-core/datasources';

import { RosBridgeSuiteDataSourceSettings, RosBridgeSuiteSourceProvider } from './rosbridge-suite-source';
import { WidgetDefinition } from 'ormi-core/widgets';
import { Ros2ConvertionGraphDefinition } from './ros2/convertion-graph';
import { RQTGraphDefinition } from './ros2/rqt-graph';
import { WebRtcRos2Definition } from './ros2/images/webrtc';
import { RestBagDatasourceDefinition } from './rest-bag/rest-bag-datasource';
import { BagListDefinition } from './rest-bag/manager/bag-list';
import { Ros2TopicListDefinition } from './ros2/topic-list';
import { BagRecorderDefinition } from './rest-bag/recorder/records-list';

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
                },
                transformTreeTopics: {
                    type: 'array',
                    title: 'Transform Tree Topics',
                    items: {
                        type: 'string'
                    }
                }

            }
        },

        data: {
            id: '',
            title: '',
            enable: true,
            toasts: false,
            transformTreeTopics: ["/tf", "/tf_static"],
            url: 'ws://localhost:9090',
            reconnectTimeout: 2,
        },

        Provider: ({ children, props }) => RosBridgeSuiteSourceProvider(children, props)

    } as DatasourceDefinition<RosBridgeSuiteDataSourceSettings>);

    datasources.push(RestBagDatasourceDefinition);

    return datasources;
};


export const widgetsExport = (widgets: WidgetDefinition[]) => {

    widgets.push(Ros2ConvertionGraphDefinition());
    widgets.push(RQTGraphDefinition());
    widgets.push(WebRtcRos2Definition());
    widgets.push(BagListDefinition());
    // widgets.push(Ros2TopicListDefinition());
    widgets.push(BagRecorderDefinition());

    return widgets;
}

export const widgetFilters = (widgets: WidgetDefinition[], datasources: Datasource[]) => {

    const widget_that_requires_rosbridge = [
        "ros2-convertion-graph",
        "rqt-graph",
    ];

    const widget_that_requires_bag = [
        "ros2-bag-list",
        "ros2-bag-recorder"
    ];

    const has_bag = datasources.find((datasource) => {
        return datasource.datasource_id === "rest-bag-source" && datasource.settings.enable;
    });
    const has_rosbridge = datasources.find((datasource) => {
        return datasource.datasource_id === "rosbridge-suite-source" && datasource.settings.enable;
    });

    if (!has_rosbridge) {
        widgets = widgets.filter((widget) => {
            return !widget_that_requires_rosbridge.includes(widget.id);
        });
    }

    if (!has_bag) {
        widgets = widgets.filter((widget) => {
            return !widget_that_requires_bag.includes(widget.id);
        });
    }

    return widgets;
}