"use client"

import { WidgetDefinition } from 'ormi-core/widgets';
import { HeadingDefinition } from './indicators/heading/heading';
import { AirspeedDefinition } from './indicators/airspeed/airspeed';
import { LevelDefinition } from './indicators/level/level';



const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push(HeadingDefinition());
    widgets.push(AirspeedDefinition());
    widgets.push(LevelDefinition());

    return widgets;
}

export default WidgetExport;