'use client';
import { usePluginsManager } from "@/core/plugins/plugins-provider";


const TestPluginsList = () => {


    const plugins = usePluginsManager().plugins_loader;

    // cmp is a JSX.Element
    // add it to the render

    // const elem = cmp.Widgets.get("TestComponent").component("qsd");

    const Widgets = []; // for each prop in plugins, create a widget
    for (const prop in plugins) {
        console.log(prop);

        console.log(plugins[prop].Widgets);
        const widget_map = plugins[prop].Widgets;   // this is a Map

        for (const [key, value] of widget_map) {
            console.log(key);
            console.log(value);

            Widgets.push(value);
        }


    }

    return (
        <div>
            <h1>Widget List</h1>
            <ul>
                {Widgets.map((widget, index) => (
                    
                    <li key={index}>
                        {widget.name}
                    </li>
                ))}
            </ul>
        </div>
    );
}


export default TestPluginsList;