

import React, { useEffect, useState } from "react";

import { CheckIcon, Edit, ListIcon } from "lucide-react";

import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@workspace/ui/components/select";
import { Toggle } from "@workspace/ui/components/toggle";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { Datasource } from "../datasources";
import { WebTypes } from "../types";




export default function TopicCreator(props: { value: string, handleTopic: (source: Datasource, topic: string, webtype: string, rawType: string) => void }) {

    const pluginsManager = usePluginsManager();

    const [datasources, setDatasources] = useState<Datasource[]>([]);

    const [selectedDatasource, setSelectedDatasource] = useState<string>('');
    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const [selectedWebType, setSelectedWebType] = useState<string>('');
    const [selectedRawType, setSelectedRawType] = useState<string>('');

    const [availableTypes, setAvailableTypes] = useState<string[]>([]);
    const [manualTypeEntry, setManualTypeEntry] = useState<boolean>(false);

    useEffect(() => {
        setDatasources(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, []));
    }, [])

    const setTypes = async (datasource_id: string) => {
        // get the types for this datasource
        // `${datasource_id}-available-types`;

        const types = await pluginsManager.applyFilterAsync<string[]>(`${datasource_id}-available-types`, []);
        setAvailableTypes(types);
    }

    const handleDatasourceChange = (datasource_id: string) => {
        setSelectedDatasource(datasource_id);

        setTypes(datasource_id);
    }

    const handleTopicChange = (topic: string) => {
        setSelectedTopic(topic);
    }

    const handleRawTypeChange = (type: string) => {
        setSelectedRawType(type);
    }

    const handleWebTypeChange = (type: string) => {
        setSelectedWebType(type);
    }

    const toggleTypeEntryMode = () => {
        setManualTypeEntry(!manualTypeEntry);
    }

    const handleValidate = () => {
        const datasource = datasources.find(ds => ds.settings.id === selectedDatasource);

        if (!datasource) {
            return;
        }

        props.handleTopic(datasource, selectedTopic, selectedWebType, selectedRawType);
    }

    return (
        <div className='p-2 items-center gap-2 justify-between w-full' style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto auto" }}>
            <Select onValueChange={handleDatasourceChange}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Datasource" />
                </SelectTrigger>
                <SelectContent>
                    {datasources.map((datasource: Datasource) => (
                        <SelectItem key={datasource.settings.id} value={datasource.settings.id}>
                            {datasource.title}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Input placeholder="Topic name" defaultValue={props.value} onChange={(e) => handleTopicChange(e.target.value)} />
            <Select onValueChange={handleWebTypeChange}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Webtype" />
                </SelectTrigger>
                <SelectContent>
                    {WebTypes.map((webtype: string) => (
                        <SelectItem key={webtype} value={webtype}>
                            {webtype}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <div className="flex gap-1" style={{ alignItems: "center" }}>
                {manualTypeEntry ? (
                    <Input
                        placeholder="Enter type manually"
                        value={selectedRawType}
                        onChange={(e) => handleRawTypeChange(e.target.value)}
                        className="flex-grow"
                    />
                ) : (
                    <Select onValueChange={handleRawTypeChange} value={selectedRawType}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="RawType" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {type}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Toggle
                            pressed={manualTypeEntry}
                            onPressedChange={toggleTypeEntryMode}
                            aria-label="Toggle manual type entry"
                        >
                            {manualTypeEntry ? <ListIcon className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                        </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                        {manualTypeEntry ? "Switch to dropdown selection" : "Switch to manual entry"}
                    </TooltipContent>
                </Tooltip>
            </div>

            <Button onClick={handleValidate}>
                <CheckIcon />
            </Button>
        </div>
    )
}