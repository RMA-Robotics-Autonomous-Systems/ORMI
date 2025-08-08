import { SelectedTopic, useLocalDataSource } from "@workspace/ormi-core/datasources";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { MapRef } from "react-map-gl/maplibre";
import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent } from "@workspace/ui/components/card";
import Image from "next/image";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";

export function TopicListOverlay({ topics, mapRef }: {
    topics: { name: string, topic: SelectedTopic, makerType: "simple" | "heatmap" | "path" | "multipoints" }[],
    mapRef?: React.RefObject<MapRef>
}) {
    const { sources } = useLocalDataSource();
    const { items } = useButtonHolder();


    const handleTopicClick = (topic: { name: string, topic: SelectedTopic, makerType: "simple" | "heatmap" | "path" | "multipoints" }) => {
        if (!mapRef?.current) return;

        // Get the data source for this topic
        const data = sources.get(topic.topic.topic);

        if (!data || data.data.length === 0) return;

        try {
            if (topic.makerType === "simple") {
                // For simple markers, center on the latest position
                const lastData = data.data[data.data.length - 1] as GeolocationPosition;
                mapRef.current.flyTo({
                    center: [lastData.coords.longitude, lastData.coords.latitude],
                    zoom: 16,
                    duration: 1000
                });
            } else if (topic.makerType === "heatmap" || topic.makerType === "path" || topic.makerType === "multipoints") {
                // For heatmap and path, calculate bounds of all points
                const coordinates: [number, number][] = [];

                data.data.forEach((item: GeolocationPosition) => {
                    coordinates.push([item.coords.longitude, item.coords.latitude]);
                });

                if (coordinates.length === 1) {
                    // Single point, just center on it
                    mapRef.current.flyTo({
                        center: coordinates[0],
                        zoom: 16,
                        duration: 1000
                    });
                } else if (coordinates.length > 1) {
                    // Multiple points, fit bounds
                    const bounds: [[number, number], [number, number]] = [
                        [
                            Math.min(...coordinates.map(c => c[0])),
                            Math.min(...coordinates.map(c => c[1]))
                        ],
                        [
                            Math.max(...coordinates.map(c => c[0])),
                            Math.max(...coordinates.map(c => c[1]))
                        ]
                    ];

                    mapRef.current.fitBounds(bounds, {
                        padding: 50,
                        duration: 1000
                    });
                }
            }
        } catch (error) {
            console.error("Error centering on topic:", error);
        }
    };

    return (
        <div className="absolute top-2 left-2 max-w-48 z-10">
            {topics.map((topic) => {
                return (
                    <div
                        key={topic.name}
                        className={cn(
                            "flex items-center space-x-1.5 p-1 rounded cursor-pointer transition-colors",
                            "hover:bg-muted/50"
                        )}
                    >
                        <Badge
                            variant={"secondary"}
                            className="text-[10px] px-1 py-0 flex-shrink-0"
                            onClick={() => handleTopicClick(topic)}
                        >
                            <Image
                                width={32}
                                height={32}
                                src={`https://api.dicebear.com/9.x/bottts/svg?seed=${topic.name}`}
                                alt={`Marker for ${topic.name}`}
                            />
                            <span>
                                {topic.name}
                            </span>
                            <small className="ml-1">
                                {topic.makerType}
                            </small>

                        </Badge>
                        {items.has(topic.topic.topic) && (
                            <small>
                                {items.get(topic.topic.topic)?.component}
                            </small>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
