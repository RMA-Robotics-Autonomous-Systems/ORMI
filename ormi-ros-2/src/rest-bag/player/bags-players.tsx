import { ControlElement, VerticalLayout } from "@jsonforms/core"
import { RefreshCwIcon, PlayIcon } from "lucide-react"
import { Datasource } from "ormi-core/datasources"
import { PluginsHooks, usePluginsManager } from "ormi-core/plugins"
import { WidgetDefinition } from "ormi-core/widgets"
import { useEffect, useState } from "react"
// Add shadcn component imports
import { Badge, Alert, AlertDescription, Button, Card, CardContent, Input, useButtonHolder } from "ormi-core/components"
import { BagInfo, BagsResponse, Duration, Timestamp } from "../bags"
import { BagPlayer } from "./bag-player"

// Interfaces for bag data
interface BagListProps {
    datasource_id: string
    title: string
}

const BagsPlayers = (props: BagListProps) => {
    const pluginsManager = usePluginsManager();
    const [apiUrl, setApiUrl] = useState<string>("");
    const [bags, setBags] = useState<BagInfo[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [refreshCounter, setRefreshCounter] = useState<number>(0);

    const { setButtonItem, removeButtonItem } = useButtonHolder();

    useEffect(() => {
        console.log("BagList props:", props);
        const url = pluginsManager.applyFilter<string>(`${props.datasource_id}-api-url`, "");
        console.log(`API URL from filter: ${url}`);
        setApiUrl(url);

        setButtonItem("bag-list-refresh",
            <Button variant="ghost" onClick={() => setRefreshCounter((prev) => (prev + 1) % 10)} title="Refresh bag list">
                <RefreshCwIcon />
            </Button>
        );

        return () => {
            removeButtonItem("bag-list-refresh");
        }

    }, [props.datasource_id, pluginsManager]);

    useEffect(() => {
        if (!apiUrl) {
            console.warn("API URL is empty, cannot fetch bags");
            return;
        }

        const isValidUrl = (url: string) => {
            try {
                new URL(url);
                return true;
            } catch (e) {
                return false;
            }
        };

        if (!isValidUrl(apiUrl)) {
            console.error(`Invalid API URL: ${apiUrl}`);
            setError(`Invalid API URL: ${apiUrl}. URL must include protocol (e.g., http:// or https://)`);
            return;
        }

        console.log(`Attempting to fetch bags from: ${apiUrl}/bags`);

        const fetchBags = async () => {
            setLoading(true);
            setError(null);
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

                const response = await fetch(`${apiUrl}/bags`, {
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log("Fetch response:", response);

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const bagsData = await response.json() as BagsResponse;
                const bagsList: BagInfo[] = [];

                // Extract bags from the nested structure
                Object.values(bagsData).forEach(pathBags => {
                    Object.values(pathBags).forEach(bag => {
                        bagsList.push(bag);
                    });
                });

                setBags(bagsList);
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') {
                    console.error('Request timed out');
                    setError('Request timed out. The server took too long to respond.');
                } else if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
                    console.error('Failed to fetch bags:', err);
                    setError('Network error: Could not connect to the server. Please check if the server is running and accessible.');
                } else {
                    console.error('Failed to fetch bags:', err);
                    setError(`Failed to fetch bags: ${err instanceof Error ? err.message : String(err)}`);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchBags();
    }, [apiUrl, refreshCounter])

    const formatDateTime = (timestamp: Timestamp) => {
        const date = new Date(timestamp.nanoseconds_since_epoch / 1000000);
        return date.toLocaleString();
    };

    const formatDuration = (duration: Duration) => {
        const totalSeconds = duration.nanoseconds / 1000000000;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);

        return `${hours}h ${minutes}m ${seconds}s`;
    };

    // Filter bags based on search query
    const filteredBags = bags.filter(bag =>
        bag.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-3 p-2" style={{ height: '100%', overflow: 'auto' }}>
            <div className="relative">
                <Input
                    placeholder="Search bags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                />
            </div>

            {loading && <p className="text-gray-500">Loading bags...</p>}

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!loading && filteredBags.length === 0 && !error && (
                <p className="text-gray-500">
                    {bags.length === 0 ? "No bags found." : "No bags match your search."}
                </p>
            )}

            {filteredBags.map(bag => (
                <Card key={bag.name} className="shadow-sm">
                    <CardContent>
                        <BagPlayer
                            bag={bag}
                            datasource_id={props.datasource_id}
                            title={props.title}
                        />
                        <div className="mb-2">
                            <div className="flex flex-wrap gap-2 mt-2">
                                <Badge variant="outline">{formatDuration(bag.meta.duration)}</Badge>
                                <Badge variant="outline">{bag.meta.message_count} messages</Badge>
                                <Badge variant="outline">{bag.meta.topics_with_message_count.length} topics</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function BagsPlayersDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    return {
        id: 'ros2-bag-player',
        name: 'ROS2 Bags Players',
        description: 'Allow users to play ROS2 bags from a REST API',
        titleProp: 'title',
        icon: (
            <PlayIcon />
        ),
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                datasource_id: { type: 'string', title: 'Datasources' },
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

                            const datasources = Array.from(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, [])).filter(ds => ds.datasource_id === 'rest-bag-source');

                            const values = Array.from(datasources).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));

                            return values;
                        }
                    }
                } as ControlElement,
            ]
        } as VerticalLayout,
        data: { title: 'ROS2 Bags players' },
        Component: (data: BagListProps) => <BagsPlayers {...data} />
    }
}