import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, uiTypeIs, JsonSchema, ControlElement } from '@jsonforms/core';

import React, { useEffect, useState } from 'react';



import { Check, ChevronsUpDown } from 'lucide-react';


import TopicCreator from './topic-creator';
import { usePluginsManager } from '@workspace/ormi-plugins';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Popover, PopoverTrigger, PopoverContent } from '@workspace/ui/components/popover';
import { TooltipProvider } from '@workspace/ui/components/tooltip';
import { TreeDataItem, TreeView } from '@workspace/ui/components/tree-view';
import { cn } from '@workspace/ui/lib/utils';
import { toast } from 'sonner';
import { DatasourceTopic, SelectedTopic, Datasource } from '../datasources';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@workspace/ui/components/command';
import { generateTreeView } from './json-schema-to-tree-view';


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

    const canSelectProperty = uischema.options?.canSelectProperty !== undefined ? uischema.options.canSelectProperty : true;

    const getTopicByNameAndSourceId = (topicName: string, sourceId: string = "") => topics.find(topic => topic.topic === topicName && topic.source.id === sourceId);

    // Helper function to retrieve topic definition and update tree view items.
    const fetchTopicDefinition = async (topic: DatasourceTopic, currentData?: SelectedTopic) => {
        const topicDef = await pluginsManager.applyFilterAsync<JsonSchema>(`${topic?.source.id}-definition`, {}, topic);
        if (!topicDef.properties && canSelectProperty) {
            // Validate type if topic definition is primitive.
            if (!uischema.options?.propertyType) return;
            if (topicDef.type !== uischema.options.propertyType) {
                toast("Error: The topic type is not equal to the property type: " + uischema.options.propertyType);
                return;
            }
            return;
        }
        setTopicProps(generateTreeView(topicDef, handleItemSelect));
    };

    const handleTopicChange = async (topicIdentifier: string) => {
        const topicName = topicIdentifier.split('@')[0]!;
        const sourceId = topicIdentifier.split('@')[1] || '';
        const topic = getTopicByNameAndSourceId(topicName, sourceId);


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

    const handleCustomTopics = (source: Datasource, topic: string, webtype: string, rawType: string) => {
        setSelectedTopic(topic);
        setSelectedTopicObject(prev => prev ? {
            ...prev,
            topic,
            rawType: prev.rawType,
            source: source.settings,
            webtype,
            property: prev.property || '',
            bufferSize: prev.bufferSize || uischema.options?.buffer || 1
        } : prev);
        handleChange(path, {
            topic,
            source: source.settings,
            property: '',
            type: webtype,
            rawType: rawType, // Include rawType property
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
                    const topic = getTopicByNameAndSourceId(value.topic, value.source.id);
                    if (topic) await fetchTopicDefinition(topic, value);
                }
            });
        }
    }, []);  // run once on mount

    return (
        <div >
            <Label>{label}</Label>
            <div className='flex flex-col gap-2 w-full'>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild className="w-full">
                        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
                            {selectedTopic || 'Select a topic'}
                            <ChevronsUpDown className="opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full max-h-[400px] overflow-y-auto">
                        <Command>
                            <CommandInput onValueChange={setCmd} placeholder="Search topic..." />
                            <TooltipProvider>
                                <TopicCreator value={cmd} handleTopic={handleCustomTopics} />
                            </TooltipProvider>
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
                <div>{topicProps.length > 0 && canSelectProperty && <TreeView data={topicProps} />}</div>
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