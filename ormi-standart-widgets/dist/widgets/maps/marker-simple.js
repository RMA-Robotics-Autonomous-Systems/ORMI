"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useLocalDataSource } from "ormi-core/datasources";
import { Marker } from "react-map-gl/maplibre";
import Image from "next/image";
export default function TopicMarker(props) {
    var _a = useState([50.843941, 4.3930369]), location = _a[0], setLocation = _a[1];
    var _b = useState(false), hasData = _b[0], setHasData = _b[1];
    var sources = useLocalDataSource().sources;
    useEffect(function () {
        var data = sources.get(props.topic.topic);
        if (!data) {
            return;
        }
        try {
            if (data.data.length === 0) {
                return;
            }
            var lastData = data.data[data.data.length - 1];
            setHasData(true);
            setLocation([lastData.coords.latitude, lastData.coords.longitude]);
        }
        catch (error) {
            console.error("Error parsing data", error, data);
        }
    }, [sources, props]);
    return (hasData && (_jsx(Marker, { longitude: location[1], latitude: location[0], children: _jsxs("div", { children: [_jsx(Image, { width: 32, height: 32, src: "https://api.dicebear.com/9.x/bottts/svg?seed=".concat(props.name), alt: "Marker for ".concat(props.name) }), _jsx("p", { style: { textAlign: "center" }, children: props.name })] }) })));
}
var ICON = "M20.2,15.7L20.2,15.7c1.1-1.6,1.8-3.6,1.8-5.7c0-5.6-4.5-10-10-10S2,4.5,2,10c0,2,0.6,3.9,1.6,5.4c0,0.1,0.1,0.2,0.2,0.3\n  c0,0,0.1,0.1,0.1,0.2c0.2,0.3,0.4,0.6,0.7,0.9c2.6,3.1,7.4,7.6,7.4,7.6s4.8-4.5,7.4-7.5c0.2-0.3,0.5-0.6,0.7-0.9\n  C20.1,15.8,20.2,15.8,20.2,15.7z";
var pinStyle = {
    cursor: 'pointer',
    fill: '#d00',
    stroke: 'none'
};
function Pin(_a) {
    var _b = _a.size, size = _b === void 0 ? 20 : _b;
    return (_jsx("svg", { height: size, viewBox: "0 0 24 24", style: pinStyle, children: _jsx("path", { d: ICON }) }));
}
