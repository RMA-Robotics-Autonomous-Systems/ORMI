"use client"

import { WidgetDefinition } from 'ormi-core/widgets';
import { HeadingDefinition } from './indicators/heading/heading';
import { AirspeedDefinition } from './indicators/airspeed/airspeed';



const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(HeadingDefinition());
    widgets.push(AirspeedDefinition());

    return widgets;
}

export default WidgetExport;