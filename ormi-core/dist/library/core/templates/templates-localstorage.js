"use client";
export var temphandleLoad = function () {
    var templates = localStorage.getItem("ormi_templates");
    if (!templates) {
        return new Map();
    }
    // templates is an object, convert it to Map
    return new Map(Object.entries(JSON.parse(templates)));
};
export var temphandleSave = function (templates) {
    // convert to object to save to local storage
    var obj = Object.fromEntries(templates);
    localStorage.setItem("ormi_templates", JSON.stringify(obj));
};
