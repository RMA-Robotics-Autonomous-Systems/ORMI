import { SelectedTopic } from "../jsonforms/topic-selector/topic-selector";

export function generateUniqueID(): string {
    const timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    const random = Math.random().toString(16).substring(2);

    return `${timestamp}-${random}`;
}
/*
    parse : {"topic":"/cmd_vel","source":"rosbridge-suite-source","property":""}
    to : SelectedTopic
*/
export function parseSelectedTopicJSON(topic: string): SelectedTopic {
    return JSON.parse(topic) as SelectedTopic;
}