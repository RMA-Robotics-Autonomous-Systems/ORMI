"use client"

import { useEffect, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import Image from "next/image";
import { SelectedTopic, useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";

export default function TopicMarker(props: { topic: SelectedTopic, name: string, scale?: number, isChild?: boolean }) {

    const [location, setLocation] = useState<[number, number]>([50.843941, 4.3930369]);
    const [hasData, setHasData] = useState(false);
    const { sources } = useLocalDataSource();

    const { setButtonItem, removeButtonItem } = useButtonHolder();
    const [show, setShow] = useState(true);

    useEffect(() => {

        const data = sources.get(props.topic.topic);
        if (!data) {
            return;
        }

        try {
            if (data.data.length === 0) {
                return;
            }

            const lastData = data.data[data.data.length - 1] as GeolocationPosition;
            setHasData(true);
            setLocation([lastData.coords.latitude, lastData.coords.longitude]);
        } catch (error) {
            console.error("Error parsing data", error, data);
        }

        if (!props.isChild) {
            setButtonItem(props.topic.topic,
                <Button variant={"ghost"} onClick={() => {
                    setShow(!show);
                }}>
                    {show ? <EyeIcon className="h-4 w-4" /> : <EyeClosedIcon className="h-4 w-4" />}
                </Button>,
                1
            );
        }
        return () => {
            if (!props.isChild) {
                removeButtonItem(props.topic.topic);
            }
        };

    }, [sources, props]);

    return (
        hasData && show && (
            <Marker longitude={location[1]} latitude={location[0]}>
                <div>
                    <Image
                        width={32}
                        height={32}
                        src={`https://api.dicebear.com/9.x/bottts/svg?seed=${props.name}`}
                        alt={`Marker for ${props.name}`}
                    />
                    <p style={{ textAlign: "center" }}>{props.name}</p>
                </div>
            </Marker>
        )
    );
}