import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, optionIs, uiTypeIs, UISchemaElement, Labelable, Scoped, LabelDescription, Internationalizable, ControlElement, JsonSchema } from '@jsonforms/core';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';

import React, { useEffect, useState } from 'react';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from '@/components/ui/label';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { DatasourceTopic } from '@/core/datasources/datasource-interface';
import { TreeViewBaseItem } from '@mui/x-tree-view/models/items';
import { toast } from '@/hooks/use-toast';


const AsyncTopicControl = (props: ControlProps) => {
    const { data, handleChange, path, uischema, label } = props;

    const [topics, setTopics] = useState<DatasourceTopic[]>([]);
    const [topicProps, setTopicProps] = useState<TreeViewBaseItem[]>([]);

    const [selectedTopic, setSelectedTopic] = useState<string>('');
    const [selectedTopicObject, setSelectedTopicObject] = useState<DatasourceTopic | undefined>(undefined);

    const pluginsManager = usePluginsManager();


    const getTopicByName = (topic_name: string) => {
        return topics.find(topic => topic.topic === topic_name);
    }

    const generateTreeView = (topic_msg_def: JsonSchema, parentId: string = '') => {

        const treeViewItems: TreeViewBaseItem[] = [];

        for (const key in topic_msg_def.properties) {
            const prop = topic_msg_def.properties[key];
            const uniqueId = parentId ? `${parentId}-${key}` : key;

            const item: TreeViewBaseItem = {
                id: uniqueId,
                label: key,

                children: []
            }

            if (prop.type === 'object') {
                item.children = generateTreeView(prop, uniqueId);
            }

            treeViewItems.push(item);
        }

        return treeViewItems;

    }

    const handleTopicChange = (topic_name: string) => {

        const topic = getTopicByName(topic_name);
        setTopicProps([]);

        setSelectedTopic(topic_name);
        setSelectedTopicObject(topic);

        handleChange(path, JSON.stringify({ topic: topic?.topic, source: topic?.source, property: '' }));

        if (!topic?.definitionHook) {
            return;
        }

        // represents the topic definition in json
        const topic_msg_def = pluginsManager.applyFilter<JsonSchema>(topic?.definitionHook, {});


        // if the topic definition is a primitive type, we can't create a tree view,
        // check if the type is equal to 'optionIs('property_type', type)'
        // the topic is a primitive type if 'properties' is not defined
        if (!topic_msg_def.properties) {

            if (!uischema.options?.propertyType) {
                throw new Error('propertyType is not defined in the uischema options');
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

        // using the topic definition to create the tree view

        const treeViewItems = generateTreeView(topic_msg_def);
        setTopicProps(treeViewItems);

        //handleChange(path, value);
    }

    const handlePropertyChange = (event: React.MouseEvent<Element>, itemId: string) => {
        if (!selectedTopicObject) {
            return;
        }
        handleChange(path, JSON.stringify({ topic: selectedTopicObject.topic, source: selectedTopicObject.source, property: itemId }));
    }


    useEffect(() => {

        const asyncFunction = uischema.options?.asyncFunction;

        if (asyncFunction) {
            asyncFunction().then((result: DatasourceTopic[]) => {
                setTopics(result);

                const value = data ? JSON.parse(data) : { topic: '', source: '', property: '' } as SelectedTopic;
                const topic = result.find(topic => topic.topic === value.topic);

                setSelectedTopic(value.topic);
                setSelectedTopicObject(topic);

                // if the property is not empty, we need to set the tree view as and the selected property
                if (!topic?.definitionHook) {
                    return;
                }

                const topic_msg_def = pluginsManager.applyFilter<JsonSchema>(topic?.definitionHook, {});
                const treeViewItems = generateTreeView(topic_msg_def);
                setTopicProps(treeViewItems);
            });
        }
    }, []);

    return (
        <div style={{ marginBottom: "1rem" }} className='flex gap-2 items-center'>
            <Label>{label}</Label>
            <div className='flex flex-col gap-2 w-full'>
                <Select value={selectedTopic} onValueChange={handleTopicChange}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                        {topics.map((topic: DatasourceTopic) => (
                            <SelectItem key={topic.topic} value={topic.topic}>
                                {topic.topic}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {(topicProps) && (topicProps.length > 0) && (<RichTreeView onItemClick={handlePropertyChange} items={topicProps} />)}
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

export interface SelectedTopic {
    topic: string;
    source: string;
    property: string;
}

/*

        <select value={data} onChange={event => handleChange(path, event.target.value)}>
            <option value="">Select an option</option>
            {options.map((option: { value: string; label: string }) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>

*/