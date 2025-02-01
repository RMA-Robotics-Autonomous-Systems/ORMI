"use client"

import { WidgetDefinition } from '@/core/widgets/widget-interface';
import { HeadingDefinition } from './indicators/heading/heading';
import { AirspeedDefinition } from './indicators/airspeed/airspeed';



const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(HeadingDefinition());
    widgets.push(AirspeedDefinition());

    return widgets;
}

export default WidgetExport;