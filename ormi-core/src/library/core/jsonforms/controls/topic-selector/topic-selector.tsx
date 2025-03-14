import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, uiTypeIs, JsonSchema, ControlElement } from '@jsonforms/core';

import React, { useEffect, useState } from 'react';
import { cn } from "@/library/lib/utils"



import { Label } from '@/library/components/ui/label';
import { usePluginsManager } from '@/library/core/plugins/components/plugins-provider';
import { Datasource, DatasourceTopic, SelectedTopic } from '@/library/core/datasources/datasource-interface';
import { toast } from '@/library/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/library/components/ui/popover';
import { Button } from '@/library/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/library/components/ui/command';
import { generateTreeView } from '@/library/core/utils/json-schema-to-tree-view';
import TopicCreator from './topic-creator';
import { Check, ChevronsUpDown } from 'lucide-react';
import { CommandSeparator } from 'cmdk';
import { Input } from '@/library/components/ui/input';

import style from "@/library/core/jsonforms/utils/renderer.module.css";
import { TreeView, TreeDataItem } from '@/library/components/tree-view';


const AsyncTopicControl = (props: ControlProps) => {
    // Destructure props for clarity
    const { data, handleChange, path, uischema, label } = props;

    const [open, setOpen] = useState(false);
    const [topics, setTopics] = useState<DatasourceTopic[]>([]);
    const [topicProps, setTopicProps] = useState<TreeDataItem[]>([]);
    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const [selectedTopicObject, setSelectedTopicObject] = useState<SelectedTopic | undefined>(undefined);
    const pluginsManager = usePluginsManager();
    const [cmd, setCmd] = useState<string>('');

    const getTopicByName = (name: string) => topics.find(topic => topic.topic === name);

    // Helper function to retrieve topic definition and update tree view items.
    const fetchTopicDefinition = async (topic: DatasourceTopic, currentData?: SelectedTopic) => {
        const topicDef = await pluginsManager.applyFilterAsync<JsonSchema>(`${topic?.source.id}-definition`, {}, topic);
        if (!topicDef.properties) {
            // Validate type if topic definition is primitive.
            if (!uischema.options?.propertyType) return;
            if (topicDef.type !== uischema.options.propertyType) {
                toast({
                    title: "Error",
                    description: `The topic type is not equal to the property type: ${uischema.options.propertyType}`,
                    variant: "destructive"
                });
                return;
            }
            return;
        }
        setTopicProps(generateTreeView(topicDef, handleItemSelect));
    };

    const handleTopicChange = async (topicIdentifier: string) => {
        const topicName = topicIdentifier.split('@')[0];
        const topic = getTopicByName(topicName);
        setTopicProps([]);
        setOpen(false);
        setSelectedTopic(topicName);
        const newTopicObj = topic ? { ...topic, property: '' } : undefined;
        setSelectedTopicObject(newTopicObj);
        handleChange(path, {
            topic: topic?.topic,
            source: topic?.source,
            property: '',
            type: topic?.type,
            rawType: topic?.rawType, // Include rawType property
            bufferSize: topic?.bufferSize || uischema.options?.buffer || 1
        } as SelectedTopic);
        if (topic) await fetchTopicDefinition(topic);
    };

    const handleCustomTopics = (source: Datasource, topic: string, type: string) => {
        setSelectedTopic(topic);
        setSelectedTopicObject(prev => prev ? {
            ...prev,
            topic,
            rawType: prev.rawType,
            source: source.settings,
            type,
            property: prev.property || '',
            bufferSize: prev.bufferSize || uischema.options?.buffer || 1
        } : prev);
        handleChange(path, {
            topic,
            source: source.settings,
            property: '',
            type,
            rawType: type, // Include rawType property
            bufferSize: 1
        } as SelectedTopic);
        setOpen(false);
    };

    const handleBufferChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(event.target.value);
        const updated = selectedTopicObject ? { ...selectedTopicObject, bufferSize: value } : undefined;
        setSelectedTopicObject(updated);
        if (updated) handleChange(path, updated);
    };

    const handleItemSelect = (itemId: string) => {
        if (!selectedTopicObject) return;
        const updated = { ...selectedTopicObject, property: itemId };
        setSelectedTopicObject(updated);
        handleChange(path, updated);
    };

    useEffect(() => {
        const asyncFunction = uischema.options?.asyncFunction;
        if (asyncFunction) {
            asyncFunction().then(async (result: DatasourceTopic[]) => {
                setTopics(result);
                const value = data as SelectedTopic | undefined;
                if (value) {
                    setSelectedTopic(value.topic);
                    setSelectedTopicObject(value);
                    const topic = getTopicByName(value.topic);
                    if (topic) await fetchTopicDefinition(topic, value);
                }
            });
        }
    }, []);  // run once on mount

    return (
        <div className={style.cell}>
            <Label>{label}</Label>
            <div className='flex flex-col gap-2 w-full'>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild className="w-full">
                        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
                            {selectedTopic || 'Select a topic'}
                            <ChevronsUpDown className="opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent>
                        <Command>
                            <CommandInput onValueChange={setCmd} placeholder="Search topic..." />
                            <TopicCreator value={cmd} handleTopic={handleCustomTopics} />
                            <CommandSeparator />
                            <CommandList>
                                <CommandGroup>
                                    {topics.map(topic => (
                                        <CommandItem
                                            key={`${topic.topic}-${topic.source.id}`}
                                            value={`${topic.topic}@${topic.source.id}`}
                                            onSelect={handleTopicChange}
                                        >
                                            <small className="text-gray-500">{topic.source.title}</small>
                                            <small className="text-gray-500">{topic.type || `${topic.rawType}*`}</small>
                                            {topic.topic}
                                            <Check className={cn("ml-auto", (selectedTopic === topic.topic && selectedTopicObject?.source.id === topic.source.id) ? "opacity-100" : "opacity-0")} />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                <div>{topicProps.length > 0 && <TreeView data={topicProps} />}</div>
                {!uischema.options?.buffer && (
                    <div className='flex flex-row gap-2'>
                        <label className="text-gray-500">Buffer size (optional)</label>
                        <Input type="number" defaultValue={selectedTopicObject?.bufferSize} onChange={handleBufferChange} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default withJsonFormsControlProps(AsyncTopicControl);

// Define a tester that checks for a specific option in uischema
const asyncTopicTester = rankWith(
    10, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        uiTypeIs('TopicSelect'), // Check if uischema is of type 'Control'
    )
);

export { asyncTopicTester };

export interface AsyncTopicControlType extends Omit<ControlElement, 'type'> {
    type: 'TopicSelect';
}