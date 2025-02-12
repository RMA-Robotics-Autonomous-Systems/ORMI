import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, uiTypeIs, JsonSchema, ControlElement } from '@jsonforms/core';

import React, { useEffect, useState } from 'react';
import { cn } from "@/lib/utils"



import { Label } from '@/components/ui/label';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { Datasource, DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { generateTreeView } from '@/core/utils/tree-view';
import TopicCreator from './topic-creator';
import { Check, ChevronsUpDown } from 'lucide-react';
import { CommandSeparator } from 'cmdk';
import { Input } from '@/components/ui/input';

import style from "@/core/jsonforms/utils/renderer.module.css";
import { TreeView, TreeDataItem } from '@/components/tree-view';


const AsyncTopicControl = (props: ControlProps) => {
    const { data, handleChange, path, uischema, label } = props;

    const [open, setOpen] = useState(false)

    const [topics, setTopics] = useState<DatasourceTopic[]>([]);
    const [topicProps, setTopicProps] = useState<TreeDataItem[]>([]);

    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const [selectedTopicObject, setSelectedTopicObject] = useState<SelectedTopic | undefined>(undefined);

    const pluginsManager = usePluginsManager();

    const [cmd, setCmd] = useState<string>('');


    const getTopicByName = (topic_name: string) => {
        return topics.find(topic => topic.topic === topic_name);
    }

    const handleTopicChange = async (topic_name: string) => {

        topic_name = topic_name.split('@')[0];

        const topic = getTopicByName(topic_name);
        setTopicProps([]);
        setOpen(false);

        setSelectedTopic(topic_name);
        setSelectedTopicObject(topic ? { ...topic, property: '' } : undefined);

        handleChange(path, ({ topic: topic?.topic, source: topic?.source, property: '', type: topic?.type, bufferSize: topic?.bufferSize || uischema.options?.buffer || 1 } as SelectedTopic));


        // represents the topic definition in json
        const topic_msg_def = await pluginsManager.applyFilterAsync<JsonSchema>(`${topic?.source.id}-definition`, {}, topic);

        // if the topic definition is a primitive type, we can't create a tree view,
        // check if the type is equal to 'optionIs('property_type', type)'
        // the topic is a primitive type if 'properties' is not defined
        if (!topic_msg_def.properties) {

            if (!uischema.options?.propertyType) {
                // throw new Error('propertyType is not defined in the uischema options');
                return;
            }

            const propertyType = uischema.options.propertyType;
            if (topic_msg_def.type !== propertyType) {
                toast({
                    title: "Error",
                    description: `The topic type is not equal to the property type: ${propertyType}`,
                    variant: "destructive"
                })
                return;
            }

            return;
        }

        const treeViewItems = generateTreeView(topic_msg_def, handleItemSelect);
        setTopicProps(treeViewItems);
    }

    const handleCustomTopics = (source: Datasource, topic: string, type: string) => {

        setSelectedTopic(topic);

        setSelectedTopicObject((prev) => {
            if (!prev) {
                return prev;
            }

            return { topic: topic, source: source.settings, type: type, property: prev.property, bufferSize: prev.bufferSize || uischema.options?.buffer || 1 };
        })

        handleChange(path, { topic: topic, source: source.settings, property: '', type: type, bufferSize: 1 } as SelectedTopic);
        setOpen(false);
    }

    const handleBufferChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;

        setSelectedTopicObject((prev) => {
            if (!prev) {
                return prev;
            }

            return { ...prev, bufferSize: parseInt(value) };
        })

        handleChange(path, { topic: selectedTopic, source: selectedTopicObject!.source, property: selectedTopicObject!.property || "", type: selectedTopicObject!.type, bufferSize: parseInt(value) } as SelectedTopic);
    }

    const handleItemSelect = (itemId: string) => {

        if (!selectedTopicObject) return;

        const updatedTopic = {
            ...selectedTopicObject,
            property: itemId
        };

        setSelectedTopicObject(updatedTopic);
        handleChange(path, updatedTopic);
    };

    useEffect(() => {
        const asyncFunction = uischema.options?.asyncFunction;

        if (asyncFunction) {
            asyncFunction().then(async (result: DatasourceTopic[]) => {
                setTopics(result);

                const value = data as SelectedTopic | undefined;
                if (!value) {
                    return;
                }

                setSelectedTopic(value.topic);
                setSelectedTopicObject(value);

                const topic_msg_def = await pluginsManager.applyFilterAsync<JsonSchema>(`${value?.source.id}-definition`, {}, value);
                const treeViewItems = generateTreeView(topic_msg_def, handleItemSelect);
                setTopicProps(treeViewItems);
            });
        }
    }, [selectedTopicObject]);

    return (
        <div className={style.cell}>
            <Label>{label}</Label>
            <div>
                <div className='flex flex-col gap-2 w-full'>
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild className="w-full">
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={open}
                                className="w-full justify-between"
                            >
                                {selectedTopic || 'Select a topic'}

                                <ChevronsUpDown className="opacity-50" />
                            </Button>
                        </PopoverTrigger>

                        <PopoverContent>
                            <Command>
                                <CommandInput onValueChange={(value: string) => setCmd(value)} placeholder="Search topic..." />
                                <TopicCreator value={cmd} handleTopic={handleCustomTopics} />
                                <CommandSeparator />
                                <CommandList>
                                    <CommandGroup>
                                        {topics.map((topic: DatasourceTopic) => (
                                            <CommandItem
                                                key={topic.topic + "-" + topic.source.id}
                                                value={topic.topic + "@" + topic.source.id}
                                                onSelect={handleTopicChange}
                                            >
                                                <small className="text-gray-500">{topic.source.title}</small>
                                                <small className="text-gray-500">{topic.type}</small>
                                                {topic.topic}
                                                <Check
                                                    className={cn(
                                                        "ml-auto",
                                                        (selectedTopic === topic.topic && selectedTopicObject?.source.id === topic.source.id) ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>

                            {/* {topics.map((topic: DatasourceTopic) => (
                            <SelectItem key={topic.topic} value={topic.topic}>
                                {topic.topic}
                            </SelectItem>
                        ))} */}
                        </PopoverContent>
                    </Popover>
                    <div>
                        {(topicProps) && (topicProps.length > 0) && (<TreeView data={topicProps} />)}
                    </div>
                    {!uischema.options?.buffer && (
                        <div className='flex flex-row gap-2'>
                            <label className="text-gray-500">Buffer size (optional)</label>
                            {<Input type="number" defaultValue={selectedTopicObject?.bufferSize} onChange={handleBufferChange} />}
                        </div>
                    )}
                </div>
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