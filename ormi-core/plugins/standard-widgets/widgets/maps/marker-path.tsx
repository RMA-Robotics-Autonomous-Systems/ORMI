import { Polyline } from "react-leaflet";
import { useEffect, useState } from "react";
import { SelectedTopic } from "@/core/datasources/datasource-interface";
import { useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import TopicMaker from "./marker-simple";

export default function PathMarker(props: { topic: SelectedTopic, name: string, scale?: number }) {
    const [locations, setLocations] = useState<any>([]);
    const { sources } = useLocalDataSource();


    useEffect(() => {

        const data = sources.get(props.topic.topic);
        if (!data) {
            return;
        }

        // data should be GeolocationPosition

        try {
            if (data.data.length > 0) {
                const lastData = data.data[data.data.length - 1] as GeolocationPosition;

                if (locations.length > 0) {
                    const lastLocation = locations[locations.length - 1];
                    const dist = distance(lastData.coords.altitude!, lastData.coords.longitude!, lastLocation[0], lastLocation[1]);
                    if (dist > 1) {
                        setLocations([...locations, [lastData.coords.latitude, lastData.coords.longitude]]);
                    }
                } else {
                    setLocations([...locations, [lastData.coords.latitude, lastData.coords.longitude]]);
                }
            }

        } catch (error) {
            console.error("Error parsing data", error, data);
        }


    }, [sources]);


    const distance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371e3; // Earth's radius in meters

        function radians(degrees: number) {
            return degrees * Math.PI / 180;
        }

        // Convert decimal degrees to radians
        const lat1Rad = radians(lat1);
        const lon1Rad = radians(lon1);
        const lat2Rad = radians(lat2);
        const lon2Rad = radians(lon2);

        const dLat = lat2Rad - lat1Rad;
        const dLon = lon2Rad - lon1Rad;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.asin(Math.sqrt(a));

        return R * c;
    }

    return (
        <>
            <Polyline positions={locations} />
            <TopicMaker topic={props.topic} name={props.name} scale={props.scale} />
        </>
    );
}