import React from 'react';
import { Layouts } from "react-grid-layout";
import { Datasource } from "../../datasources/datasource-interface";
import { Widget } from "../../widgets/widget-interface";
declare const handleSave: (newDashboard: any) => void;
declare const handleLoad: (setLayouts: React.Dispatch<React.SetStateAction<Layouts>>, setWidgets: React.Dispatch<React.SetStateAction<Map<string, Widget>>>, setLocked: React.Dispatch<React.SetStateAction<boolean>>, setDatasources: React.Dispatch<React.SetStateAction<Map<string, Datasource>>>) => void;
export { handleSave, handleLoad };
