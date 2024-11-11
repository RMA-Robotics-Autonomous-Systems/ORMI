import { Layout } from "react-grid-layout";
import WidgetDefinition from "../widgets/widget-interface";
import DashboardInterface from "./dashboard-interface";


class DashboardManager{

    definition : DashboardInterface
    widgets: Map<string, any> = new Map<string, any>();

    constructor(definition: DashboardInterface, availableWidgets: WidgetDefinition[]){
        this.definition = definition;

        this.widgets = new Map<string, any>();
        for(const widget of availableWidgets){
            this.widgets.set(widget.id, widget);
        }

        this.definition.layouts = {
            "lg": [],
            "md": [],
            "sm": [],
            "xs": [],
            "xxs": []
        }

    }

    addWidget(widget: WidgetDefinition, settings: any){
        //create a unique id for the widget
        const component_id = crypto.randomUUID();

        this.definition.widgets.set(component_id, {
            widget_id: widget.id,
            title: widget.name,
            settings: settings
        });

        const box : Layout = {
            i: component_id,
            x: 0,
            y: 0,
            w: 4,
            h: 4,
            static: false,
            isDraggable: true,
            isResizable: true
        };

        this.definition.layouts.lg.push(box);
        this.definition.layouts.md.push(box);
        this.definition.layouts.sm.push(box);
        this.definition.layouts.xs.push(box);
        this.definition.layouts.xxs.push(box);

        console.log(this.definition);
    }

    getComponents(component_id: string){

        const widget_id = this.definition.widgets.get(component_id).widget_id;
        const settings = this.definition.widgets.get(component_id).settings;

        const widget = this.widgets.get(widget_id);

        if(widget){
            return widget.Component(settings);
        }else{
            throw new Error(`Widget ${widget_id} not found`);
        }
    }

}

export default DashboardManager;