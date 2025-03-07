import { ReactNode } from 'react';
import { SelectedTopic } from '../datasource-interface';
interface LocalDataSources {
    sources: Map<string, Source<any>>;
}
interface Source<T> {
    data: T[];
    times: number[];
}
interface LocalDataSourcesProviderProps {
    children: ReactNode;
    SelectedTopics: SelectedTopic[];
    buffersSize: number;
}
declare const LocalDataSourcesProvider: (props: LocalDataSourcesProviderProps) => import("react/jsx-runtime").JSX.Element;
declare const useLocalDataSource: () => LocalDataSources;
export { LocalDataSourcesProvider, useLocalDataSource };
