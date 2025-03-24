import { ControlElement, VerticalLayout } from "@jsonforms/core"
import { RefreshCwIcon, VideotapeIcon } from "lucide-react"
import { Datasource } from "ormi-core/datasources"
import { PluginsHooks, usePluginsManager } from "ormi-core/plugins"
import { WidgetDefinition } from "ormi-core/widgets"
import { useEffect, useState } from "react"
import { Badge, Alert, AlertDescription, Button, Card, CardContent, Input, Label, useButtonHolder } from "ormi-core/components"
import { RestBagClient } from "../rest-bag-client"
import ROSLIB from "roslib"
import { RecordingStatus } from "../recording-types"
import { Recorder } from "./recorder"
import { RecorderCreator } from "./recorder-creator"

interface RecorderListProps {
    title: string;
    api_datasource_id: string;
    ros_datasource_id: string;
}

// Main component
const BagsRecorders = (props: RecorderListProps) => {
    const pluginsManager = usePluginsManager();

    // Service state
    const [client, setClient] = useState<RestBagClient | null>(null);
    const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);

    const { setButtonItem, removeButtonItem } = useButtonHolder();

    const [refreshCounter, setRefreshCounter] = useState<number>(0);
    const [recordings, setRecordings] = useState<RecordingStatus[]>([]);

    // Initialize clients and connections
    useEffect(() => {
        const new_client = pluginsManager.applyFilter<RestBagClient>(`${props.api_datasource_id}-client`, null);
        setClient(new_client);

        const new_ros = pluginsManager.applyFilter<ROSLIB.Ros>(`${props.ros_datasource_id}-ros-2-connection`, null)
        setRoslib(new_ros);

        setButtonItem("bag-list-refresh",
            <Button variant="ghost" onClick={() => setRefreshCounter((prev) => (prev + 1) % 10)} title="Refresh bag list">
                <RefreshCwIcon />
            </Button>
        );



        return () => {
            removeButtonItem("bag-list-refresh");
        }

    }, [props, pluginsManager, refreshCounter]);

    useEffect(() => {
        if (client) {
            setTimeout(async () => {
                const recs = await client!.getRecordings();
                setRecordings(recs);
            }, (100));
        }

        if (roslib && client) {
            setButtonItem("bag-creator",
                <RecorderCreator client={client!} rosclient={roslib!} />
            );
        }
        return () => {
            removeButtonItem("bag-creator");
        }
    }, [client, roslib, refreshCounter]);


    return (
        <div className="p-3">
            {recordings && recordings.length > 0 && recordings.map((rec) => (
                <Recorder key={rec.recording_id} recorder={rec} client={client!} />
            ))}
        </div>
    )

};


export function BagRecorderDefinition(): WidgetDefinition {
    const pluginsManager = usePluginsManager();


    return {
        id: 'ros2-bag-recorder',
        name: 'ROS2 Bags recorders',
        description: 'Allows to record ROS2 bags',
        titleProp: 'title',
        icon: <VideotapeIcon />,
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                api_datasource_id: { type: 'string', title: 'API Datasource ID' },
                ros_datasource_id: { type: 'string', title: 'ROS Datasource ID' }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                { type: "Control", scope: "#/properties/title" } as ControlElement,
                {
                    type: "Control", scope: "#/properties/api_datasource_id", options: {
                        async: true,
                        asyncFunction: async () => {

                            const datasources = Array.from(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, [])).filter(ds => ds.datasource_id === 'rest-bag-source');

                            const values = Array.from(datasources).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));

                            return values;
                        }
                    }
                } as ControlElement,
                {
                    type: "Control", scope: "#/properties/ros_datasource_id", options: {
                        async: true,
                        asyncFunction: async () => {

                            const datasources = Array.from(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, [])).filter(ds => ds.datasource_id === 'rosbridge-suite-source');

                            const values = Array.from(datasources).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));

                            return values;
                        }
                    }
                } as ControlElement
            ]
        } as VerticalLayout,
        data: { title: 'ROS2 Bags recorders' },

        Component: (data: RecorderListProps) => <BagsRecorders {...data} />
    }
}