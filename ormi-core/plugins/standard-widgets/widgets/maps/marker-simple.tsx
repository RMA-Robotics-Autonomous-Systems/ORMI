"use client"

import { Marker, Popup, useMap } from "react-leaflet"

import { useEffect, useState } from "react";
import L, { LatLng } from "leaflet";
import { SelectedTopic } from "@/core/datasources/datasource-interface";
import { useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";

export default function TopicMaker(props: { topic: SelectedTopic, name: string, scale?: number }) {

    const [location, setLocation] = useState([50.843941, 4.3930369]);
    const { sources } = useLocalDataSource();


    useEffect(() => {

        const data = sources.get(props.topic.topic);
        if (!data) {
            return;
        }

        // data should be GeolocationPosition

        try {
            const lastData = data.data[data.data.length - 1] as GeolocationPosition;

            setLocation([lastData.coords.latitude, lastData.coords.longitude]);
        } catch (error) {
            console.error("Error parsing data", error, data);
        }


    }, [sources]);

    // useEffect(() => {

    //     if (data.length > 0) {
    //         const lastData = data[data.length - 1].ros;
    //         setLocation([lastData.latitude, lastData.longitude]);
    //     }

    //     if (location[0] > map.getBounds().getNorth() || location[0] < map.getBounds().getSouth() || location[1] > map.getBounds().getEast() || location[1] < map.getBounds().getWest()) {
    //         map.panTo(new LatLng(location[0], location[1]), { animate: true, duration: 1 });
    //     }

    // }, [data]);

    return (
        <Marker icon={L.icon({ iconUrl: "https://api.dicebear.com/8.x/bottts/svg?seed=" + props.name, iconSize: [30 * (props.scale || 1), 30 * (props.scale || 1)] })} position={new LatLng(location[0], location[1])} >
            <Popup>
                <p>{props.name}</p>
            </Popup>
        </Marker>
    );
}