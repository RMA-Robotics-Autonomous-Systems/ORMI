"use client"

import { WidgetDefinition } from '@/core/widgets/widget-interface';
import { HeadingDefinition } from './indicators/heading/heading';



const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(HeadingDefinition());

    return widgets;
}

export default WidgetExport;