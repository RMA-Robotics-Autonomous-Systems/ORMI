"use client"
import React, { JSX, useEffect, useRef, useState } from 'react';
import { WidgetDefinition } from "ormi-core/widgets";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import ROSLIB from 'roslib';
import { usePluginsManager } from 'ormi-core/plugins';
import { ListIcon } from 'lucide-react';
import { PluginsHooks } from 'ormi-core/plugins';
import { Datasource } from 'ormi-core/datasources';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "ormi-components";

interface Ros2TopicListProps {
    title: string;
    datasource_id: string;
    poolingRateHz: number;
}

interface ROS2Topic {
    topic: string;
    type: string;
}

function Ros2TopicList(props: Ros2TopicListProps): JSX.Element {

    const pluginsManager = usePluginsManager();


    const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);
    const [timer, setTimer] = useState<ReturnType<typeof setInterval> | null>(null);

    const [topics, setTopics] = useState<ROS2Topic[]>([]);

    // Establish ROSLIB connection
    useEffect(() => {
        const to = setTimeout(() => {
            setRoslib(pluginsManager.applyFilter(`${props.datasource_id}-ros-2-connection`, null));
        }, 500);

        return () => {
            clearTimeout(to);
            if (timer) {
                clearInterval(timer);
            }
        }
    }, [pluginsManager, props]);

    useEffect(() => {
        const refreshTimer = setInterval(() => {
            if (!roslib) {
                return;
            }

            roslib.getTopics((result: { topics: string[]; types: string[]; }) => {
                const newTopics = result.topics.map((topic, i) => ({ topic, type: result.types[i] }));
                setTopics(newTopics);
            });

        }, 1000 / props.poolingRateHz);

        setTimer(refreshTimer);

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        }
    }, [roslib, props.poolingRateHz]);

    return (
        <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Topic</TableHead>
                        <TableHead>Type</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {topics.map((topic, i) => (
                        <TableRow key={i}>
                            <TableCell className="font-medium">{topic.topic}</TableCell>
                            <TableCell>{topic.type}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export function Ros2TopicListDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    return {
        id: 'ros2-topic-list',
        name: 'ROS2 Topic List',
        description: 'Real-time ROS2 topic list',
        titleProp: 'title',
        icon: (
            <ListIcon />
        ),
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                datasource_id: { type: 'string', title: 'Datasources' },
                poolingRateHz: { type: 'number', title: 'Pooling Rate' },
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                { type: "Control", scope: "#/properties/title" } as ControlElement,
                {
                    type: "Control", scope: "#/properties/datasource_id", options: {
                        async: true,
                        asyncFunction: async () => {

                            const datasources = Array.from(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, [])).filter(ds => ds.datasource_id === 'rosbridge-suite-source');

                            const values = Array.from(datasources).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));

                            return values;
                        }
                    }
                } as ControlElement,
                { type: "Control", scope: "#/properties/poolingRateHz" } as ControlElement
            ]
        } as VerticalLayout,
        data: { title: 'ROS2 topics', datasource_id: '', poolingRateHz: 5 },
        Component: (data: Ros2TopicListProps) => <Ros2TopicList {...data} />
    }
}