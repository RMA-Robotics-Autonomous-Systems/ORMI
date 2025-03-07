"use client";
var handleSave = function (newDashboard) {
    // save the dashboard to local storage
    localStorage.setItem("dashboard", JSON.stringify(newDashboard));
};
var handleLoad = function (setLayouts, setWidgets, setLocked, setDatasources) {
    // load the dashboard from the local storage
    var dashboardDefinition = JSON.parse(localStorage.getItem("dashboard") || JSON.stringify({
        layouts: {
            lg: [],
            md: [],
            sm: [],
            xs: [],
            xxs: []
        },
        widgets: new Map()
    }));
    // check that the types are correct
    // if widgets is not a map, convert it to a map
    if (!(dashboardDefinition.widgets instanceof Map)) {
        dashboardDefinition.widgets = new Map(Object.entries(dashboardDefinition.widgets));
    }
    // if datasources is not a map, convert it to a map
    if (!(dashboardDefinition.datasources instanceof Map)) {
        if (dashboardDefinition.datasources) {
            dashboardDefinition.datasources = new Map(Object.entries(dashboardDefinition.datasources));
        }
        else {
            dashboardDefinition.datasources = new Map();
        }
    }
    // update the state
    setLocked(dashboardDefinition.locked);
    setLayouts(dashboardDefinition.layouts);
    setWidgets(dashboardDefinition.widgets);
    setDatasources(dashboardDefinition.datasources);
};
export { handleSave, handleLoad };
