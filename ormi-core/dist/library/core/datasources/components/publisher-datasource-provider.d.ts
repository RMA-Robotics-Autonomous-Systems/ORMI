import { ReactNode } from 'react';
import PluginsManager from '../../../../library/core/plugins/plugins-manager';
import { SelectedTopic } from '../datasource-interface';
interface PublisherDataSources {
    publishers: Map<string, Publisher>;
}
interface PublisherDataSourcesProviderProps {
    children: ReactNode;
    SelectedTopics: SelectedTopic[];
}
declare class Publisher {
    topic: SelectedTopic;
    pm: PluginsManager;
    constructor(topic: SelectedTopic, pluginManager: PluginsManager);
    advertise(): Promise<unknown>;
    unadvertise(): void;
    publish<T>(data: T, webtype: string): void;
}
declare const PublisherDataSourcesProvider: (props: PublisherDataSourcesProviderProps) => import("react/jsx-runtime").JSX.Element;
declare const usePublisherDataSource: () => PublisherDataSources;
export { PublisherDataSourcesProvider, usePublisherDataSource };
