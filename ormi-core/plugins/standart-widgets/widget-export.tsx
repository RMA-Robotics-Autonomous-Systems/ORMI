"use client";


const WidgetExport = (widgets: WidgetDefinition[]) => {

    widgets.push({
        id: "export",
        name: "Export",
        description: "Export data to csv",
        image: 'https://api.dicebear.com/9.x/bottts/png',
    });

    // create 50 random widgets
    for (let i = 0; i < 50; i++) {

        widgets.push({
            id: `widget-${i}`,
            name: `Widget ${i}`,
            description: `Description of widget ${i}`,
            image: 'https://api.dicebear.com/9.x/bottts/png?seed=' + i,
        });
    }


    return widgets;
}

export default WidgetExport;