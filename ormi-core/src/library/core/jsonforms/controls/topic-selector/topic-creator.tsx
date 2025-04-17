import { Button } from "@/library/components/ui/button";
import { Input } from "@/library/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/library/components/ui/select";
import { Datasource } from "@/library/core/datasources/datasource-interface";
import { usePluginsManager } from "@/library/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/library/core/plugins/plugins-types";
import { CheckIcon, Edit, ListIcon } from "lucide-react";
import React from "react";
import { useEffect, useState } from "react";
import { Toggle } from "@/library/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/library/components/ui/tooltip";

export default function TopicCreator(props: { value: string, handleTopic: (source: Datasource, topic: string, type: string) => void }) {

    const pluginsManager = usePluginsManager();

    const [datasources, setDatasources] = useState<Datasource[]>([]);

    const [selectedDatasource, setSelectedDatasource] = useState<string>('');
    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const [selectedType, setSelectedType] = useState<string>('');

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

    const handleTypeChange = (type: string) => {
        setSelectedType(type);
    }

    const toggleTypeEntryMode = () => {
        setManualTypeEntry(!manualTypeEntry);
    }

    const handleValidate = () => {
        const datasource = datasources.find(ds => ds.settings.id === selectedDatasource);

        if (!datasource) {
            return;
        }

        props.handleTopic(datasource, selectedTopic, selectedType);
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

            <div className="flex gap-1" style={{ alignItems: "center" }}>
                {manualTypeEntry ? (
                    <Input
                        placeholder="Enter type manually"
                        value={selectedType}
                        onChange={(e) => handleTypeChange(e.target.value)}
                        className="flex-grow"
                    />
                ) : (
                    <Select onValueChange={handleTypeChange} value={selectedType}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Type" />
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