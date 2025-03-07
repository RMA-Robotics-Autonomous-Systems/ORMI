import { ReactNode } from 'react';
import PluginsManager from '../plugins-manager';
import { PluginClientSide } from '../plugins-types';
interface PluginsProviderProps {
    children: ReactNode;
    pluginsLoader: Map<string, PluginClientSide>;
}
declare const PluginsProvider: (props: PluginsProviderProps) => import("react/jsx-runtime").JSX.Element;
declare const usePluginsManager: () => PluginsManager;
export { PluginsProvider, usePluginsManager };
