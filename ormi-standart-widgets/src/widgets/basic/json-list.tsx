import { LocalDataSourcesProvider, useLocalDataSource, DatasourceTopic, SelectedTopic } from "ormi-core/datasources";
import { AsyncTopicControlType } from "ormi-core/jsonforms";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { WidgetDefinition } from "ormi-core/widgets";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { FileIcon, ChevronDown, ChevronUp, ArrowDown } from "lucide-react";
import { useState, useRef, useEffect, useMemo, memo } from "react";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
    Button
} from "ormi-core/components"

interface JsonListProps {
    title: string;
    topic: SelectedTopic;
}

// Memoized Card component for better performance
const MemoizedJsonCard = memo(({ topic, dataItem, timestamp, itemId }: {
    topic: SelectedTopic;
    dataItem: any;
    timestamp: string;
    itemId: string;
}) => (
    <Card key={itemId} className="m-2">
        <CardHeader>
            <CardTitle>{topic.topic}</CardTitle>
            <CardDescription>
                {topic.type} - {timestamp}
            </CardDescription>
        </CardHeader>
        <Collapsible className="w-full">
            <CollapsibleTrigger asChild className="p-3 cursor-pointer flex items-center w-full">
                <Button variant="ghost"> Open/Hide </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <CardContent>
                    <pre className="shadow-inner-md rounded-md m-3 p-1" style={{ boxShadow: "5px 5px 16px 0px rgba(0,0,0,0.1) inset", backgroundColor: "darkslategrey", color: "white" }}>
                        {JSON.stringify(dataItem, null, 2)}
                    </pre>
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    </Card>
));

function JsonList(props: JsonListProps) {
    const { sources } = useLocalDataSource();
    const containerRef = useRef<HTMLDivElement>(null);
    const prevDataLengthRef = useRef(0);
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
    const [isAtBottom, setIsAtBottom] = useState(true);

    // Process the data only when sources change
    const processedData = useMemo(() => {
        const result: Array<{
            dataItem: any;
            timestamp: string;
            itemId: string;
        }> = [];

        Array.from(sources.values()).forEach((source, sourceIndex) => {
            source.data.forEach((dataItem, dataIndex) => {
                result.push({
                    dataItem,
                    timestamp: dataItem.timestamp || new Date().toISOString(),
                    itemId: `${sourceIndex}-${dataIndex}`
                });
            });
        });

        return result;
    }, [sources]);

    // Track total number of data items for auto-scrolling detection
    const totalDataItems = processedData.length;

    // Auto scroll to bottom when new data is received (with smooth scrolling)
    useEffect(() => {
        if (isAutoScrollEnabled && totalDataItems > prevDataLengthRef.current && containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
        prevDataLengthRef.current = totalDataItems;
    }, [totalDataItems, isAutoScrollEnabled]);

    // Handle manual scrolling - if user scrolls up, disable auto-scroll
    const handleScroll = () => {
        if (!containerRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        // Consider "at bottom" when within 100px of the bottom
        const atBottom = scrollTop + clientHeight >= scrollHeight - 100;

        setIsAtBottom(atBottom);
        if (atBottom) {
            setIsAutoScrollEnabled(true);
        } else {
            setIsAutoScrollEnabled(false);
        }
    };

    // Function to scroll to bottom
    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTo({
                top: containerRef.current.scrollHeight,
                behavior: 'smooth'
            });
            setIsAutoScrollEnabled(true);
            setIsAtBottom(true);
        }
    };

    // Simple virtualization - only render items that might be visible
    const renderVirtualizedItems = () => {
        // If small number of items, render all
        if (processedData.length < 50) {
            return processedData.map(item => (
                <MemoizedJsonCard
                    key={item.itemId}
                    topic={props.topic}
                    dataItem={item.dataItem}
                    timestamp={item.timestamp}
                    itemId={item.itemId}
                />
            ));
        }

        // Otherwise, render just the last 50 items for better performance
        // This is a simple approach - a full virtual list library would be better for very large datasets
        return processedData.slice(-50).map(item => (
            <MemoizedJsonCard
                key={item.itemId}
                topic={props.topic}
                dataItem={item.dataItem}
                timestamp={item.timestamp}
                itemId={item.itemId}
            />
        ));
    };

    return (
        <div className="relative h-full">
            <div
                ref={containerRef}
                style={{ height: "100%", overflow: "auto", display: "flex", flexDirection: "column" }}
                className="p-3 gap-3"
                onScroll={handleScroll}
            >
                {renderVirtualizedItems()}
            </div>

            {/* Fixed position button that appears when not at bottom */}
            {!isAtBottom && (
                <Button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 right-4 rounded-full p-2 shadow-lg"
                    size="icon"
                    variant="secondary"
                >
                    <ArrowDown size={20} />
                </Button>
            )}
        </div>
    );
}

export function JsonListDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    return {
        id: 'json-List-widget',
        name: 'Json List',
        description: 'Display a json List',
        titleProp: 'title',
        icon: <FileIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },

        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title"
                } as ControlElement,
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, []);
                        },
                        buffer: 1000,
                        canSelectProperty: true,
                    }
                } as AsyncTopicControlType

            ],
        } as VerticalLayout,

        data: {
            title: 'Json List'
        },
        Component: (data: JsonListProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1000} >
                <JsonList {...data} />
            </LocalDataSourcesProvider >
        )

    } as WidgetDefinition;
}