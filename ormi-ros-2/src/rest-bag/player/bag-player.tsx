import { BagInfo } from "../bags";
import {
    Button,
    Badge,
} from "ormi-core/components";
import { usePluginsManager } from "ormi-core/plugins";
import { PlayIcon, PauseIcon, SquareIcon } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { RestBagClient } from "../rest-bag-client";
import { PlayerPlayRequest } from "../player-types";

interface BagPlayerProps {
    bag: BagInfo;
    datasource_id: string;
    title: string;
}

export function BagPlayer({ bag, datasource_id }: BagPlayerProps) {
    const [playId, setPlayId] = useState<string | null>(null);
    const [status, setStatus] = useState<string>("READY");
    const [error, setError] = useState<string | null>(null);
    const statusPollInterval = useRef<number | null>(null);
    const [client, setClient] = useState<RestBagClient | null>(null);

    const pluginsManager = usePluginsManager();

    // Initialize RestBagClient when datasource changes
    useEffect(() => {
        const new_client = pluginsManager.applyFilter<RestBagClient>(`${datasource_id}-client`, null);
        setClient(new_client);
    }, [datasource_id]);

    // Clean up interval on component unmount
    useEffect(() => {
        return () => {
            if (statusPollInterval.current !== null) {
                clearInterval(statusPollInterval.current);
            }
        };
    }, []);

    // Poll player status when playId exists
    useEffect(() => {
        if (!client || !playId) return;

        const fetchStatus = async () => {
            try {
                const statusResponse = await client.getPlayerStatus(playId);
                setStatus(statusResponse.state?.toUpperCase() || 'UNKNOWN');

                // Auto-stop polling when playback ends
                if (statusResponse.state === 'stopped' || statusResponse.state === 'completed') {
                    clearInterval(statusPollInterval.current!);
                    statusPollInterval.current = null;
                }
            } catch (error) {
                setError(`Error: ${error}`);
            }
        };

        // Start polling
        fetchStatus();
        if (statusPollInterval.current === null) {
            statusPollInterval.current = window.setInterval(fetchStatus, 1000);
        }

        return () => {
            if (statusPollInterval.current !== null) {
                clearInterval(statusPollInterval.current);
                statusPollInterval.current = null;
            }
        };
    }, [client, playId]);

    const playBag = async () => {
        if (!client || !bag) return;

        try {
            const request: PlayerPlayRequest = {
                bag_name: bag.name,
                rate: 1.0,
            };

            const response = await client.startPlayback(request);
            setPlayId(response.play_id);
            setStatus("PLAYING");
            setError(null);
        } catch (error) {
            setError(`Error: ${error}`);
        }
    };

    const pausePlayback = async () => {
        if (!client || !playId) return;

        try {
            await client.pausePlayback(playId);
            setStatus("PAUSED");
        } catch (error) {
            setError(`Error: ${error}`);
        }
    };

    const resumePlayback = async () => {
        if (!client || !playId) return;

        try {
            await client.resumePlayback(playId);
            setStatus("PLAYING");
        } catch (error) {
            setError(`Error: ${error}`);
        }
    };

    const stopPlayback = async () => {
        if (!client || !playId) return;

        try {
            await client.stopPlayback(playId);
            setPlayId(null);
            setStatus("READY");
            setError(null);

            if (statusPollInterval.current !== null) {
                clearInterval(statusPollInterval.current);
                statusPollInterval.current = null;
            }
        } catch (error) {
            setError(`Error: ${error}`);
        }
    };

    if (!bag) {
        return <div>No bag selected</div>;
    }

    return (
        <div className="flex items-center gap-2 p-2">
            <span className="font-medium text-sm">Bag: {bag.name}</span>

            <Badge variant={status === "PLAYING" ? "default" : status === "PAUSED" ? "outline" : "secondary"} className="ml-auto">
                {status}
            </Badge>

            {error && <span className="text-red-500 text-xs">{error}</span>}

            <div className="flex gap-1">
                {!playId ? (
                    <Button size="sm" onClick={playBag}>
                        <PlayIcon className="h-4 w-4" />
                    </Button>
                ) : (
                    <>
                        {status === "PAUSED" ? (
                            <Button size="sm" onClick={resumePlayback}>
                                <PlayIcon className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button size="sm" onClick={pausePlayback}>
                                <PauseIcon className="h-4 w-4" />
                            </Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={stopPlayback}>
                            <SquareIcon className="h-4 w-4" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}