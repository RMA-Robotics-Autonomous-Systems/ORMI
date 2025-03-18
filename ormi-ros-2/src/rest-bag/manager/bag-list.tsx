import { ControlElement, VerticalLayout } from "@jsonforms/core"
import { ListIcon, Download, Trash2, Check, X, RefreshCwIcon, InfoIcon } from "lucide-react"
import { Datasource } from "ormi-core/datasources"
import { PluginsHooks, usePluginsManager } from "ormi-core/plugins"
import { WidgetDefinition } from "ormi-core/widgets"
import { useEffect, useState } from "react"
// Add shadcn component imports
import { Badge, Alert, AlertDescription, Button, Card, CardContent, CardHeader, CardTitle, Input, useButtonHolder } from "ormi-core/components"
import { BagInfo, BagsResponse, Duration, Timestamp } from "../bags"
import { BagViewer } from "./bag-viewer"

// Interfaces for bag data
import { RestBagClient } from "../rest-bag-client"

interface BagListProps {
    datasource_id: string
    title: string
}

const BagList = (props: BagListProps) => {
    const pluginsManager = usePluginsManager();
    const [bags, setBags] = useState<BagInfo[]>([]);
    const [client, setClient] = useState<RestBagClient | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [refreshCounter, setRefreshCounter] = useState<number>(0);

    const { setButtonItem, removeButtonItem } = useButtonHolder();

    useEffect(() => {
        const new_client = pluginsManager.applyFilter<RestBagClient>(`${props.datasource_id}-client`, null);
        setClient(new_client);

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
        if (!client) {
            console.warn("Client is not available, cannot fetch bags");
            return;
        }

        const fetchBags = async () => {
            setLoading(true);
            setError(null);
            try {
                const bagsList = await client.getBags();
                const bags: BagInfo[] = [];

                for (const path in bagsList) {
                    for (const bagName in bagsList[path]) {
                        bags.push(bagsList[path][bagName]);
                    }
                }

                setBags(bags);

            } catch (err: unknown) {
                console.error('Failed to fetch bags:', err);
                setError(`Failed to fetch bags: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
                setLoading(false);
            }
        };

        fetchBags();
    }, [client, refreshCounter])

    const handleDownload = async (bagName: string) => {
        if (!client) {
            setError('Client is not available. Cannot download bag.');
            return;
        }
        const blob = await client.downloadBag(bagName);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = bagName;
        a.click();

        URL.revokeObjectURL(url);
    };

    const handleDelete = async (bagName: string) => {
        if (!client) {
            setError('Client is not available. Cannot delete bag.');
            return;
        }

        try {
            await client.deleteBag(bagName);
            // Refresh the bag list after deletion
            setBags(bags.filter(bag => bag.name !== bagName));
        } catch (err) {
            console.error('Failed to delete bag:', err);
            setError('Failed to delete bag. Please try again later.');
        } finally {
            setDeleteConfirm(null);
        }
    };

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
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <CardTitle>{bag.name}</CardTitle>
                            <div className="flex space-x-2">
                                {deleteConfirm === bag.name ? (
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm text-red-500">Confirm?</span>
                                        <Button
                                            onClick={() => handleDelete(bag.name)}
                                            variant="destructive"
                                            size="icon"
                                        >
                                            <Check size={18} />
                                        </Button>
                                        <Button
                                            onClick={() => setDeleteConfirm(null)}
                                            variant="outline"
                                            size="icon"
                                        >
                                            <X size={18} />
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <BagViewer bag={bag} trigger={
                                            <Button variant="outline" title="View bag details" size="icon">
                                                <InfoIcon />
                                            </Button>
                                        } />

                                        <Button
                                            onClick={() => handleDownload(bag.name)}
                                            variant="outline"
                                            size="icon"
                                            title="Download bag"
                                        >
                                            <Download size={18} />
                                        </Button>
                                        <Button
                                            onClick={() => setDeleteConfirm(bag.name)}
                                            variant="outline"
                                            size="icon"
                                            className="text-red-600 hover:bg-red-100"
                                            title="Delete bag"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-600">Path: {bag.path}</p>
                        <p className="text-sm text-gray-600">
                            Start time: {formatDateTime(bag.meta.starting_time)}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline">{formatDuration(bag.meta.duration)}</Badge>
                            <Badge variant="outline">{bag.meta.message_count} messages</Badge>
                            <Badge variant="outline">{bag.meta.topics_with_message_count.length} topics</Badge>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function BagListDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    return {
        id: 'ros2-bag-list',
        name: 'ROS2 Bag List',
        description: 'List of ROS2 Bags',
        titleProp: 'title',
        icon: (
            <ListIcon />
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
        data: { title: 'ROS2 Bag List' },
        Component: (data: BagListProps) => <BagList {...data} />
    }
}