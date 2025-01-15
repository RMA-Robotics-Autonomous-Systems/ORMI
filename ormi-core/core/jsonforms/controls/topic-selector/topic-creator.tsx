import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Datasource } from "@/core/datasources/datasource-interface";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

export default function TopicCreator(props: { value: string, handleTopic: (source: Datasource, topic: string, type: string) => void }) {

    const pluginsManager = usePluginsManager();

    const [datasources, setDatasources] = useState<Datasource[]>([]);

    const [selectedDatasource, setSelectedDatasource] = useState<string>('');
    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const [selectedType, setSelectedType] = useState<string>('');

    const [availableTypes, setAvailableTypes] = useState<string[]>([]);

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

    const handleValidate = () => {

        const datasource = datasources.find(ds => ds.settings.id === selectedDatasource);

        if (!datasource) {
            return;
        }

        props.handleTopic(datasource, selectedTopic, selectedType);
    }

    return (
        <div className='p-2 items-center gap-2 justify-between w-full' style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto" }}>
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
            <Select onValueChange={handleTypeChange}>
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
            <Button onClick={handleValidate}>
                <CheckIcon />
            </Button>
        </div>
    )


}