"use client";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useLocalDataSource } from "ormi-core/datasources";
import TopicMaker from "./marker-simple";
import { Layer, Source } from 'react-map-gl/maplibre';
export default function PathMarker(props) {
    var _a = useState([]), locations = _a[0], setLocations = _a[1];
    var sources = useLocalDataSource().sources;
    useEffect(function () {
        var data = sources.get(props.topic.topic);
        if (!data) {
            return;
        }
        try {
            if (data.data.length > 0) {
                var lastData = data.data[data.data.length - 1];
                if (locations.length > 0) {
                    var lastLocation = locations[locations.length - 1];
                    var dist = distance(lastData.coords.latitude, lastData.coords.longitude, lastLocation[0], lastLocation[1]);
                    if (dist > 1) {
                        setLocations(__spreadArray(__spreadArray([], locations, true), [[lastData.coords.latitude, lastData.coords.longitude]], false));
                    }
                }
                else {
                    setLocations([[lastData.coords.latitude, lastData.coords.longitude]]);
                }
            }
        }
        catch (error) {
            console.error("Error parsing data", error, data);
        }
    }, [sources]);
    var distance = function (lat1, lon1, lat2, lon2) {
        var R = 6371e3; // Earth's radius in meters
        function radians(degrees) {
            return degrees * Math.PI / 180;
        }
        var lat1Rad = radians(lat1);
        var lon1Rad = radians(lon1);
        var lat2Rad = radians(lat2);
        var lon2Rad = radians(lon2);
        var dLat = lat2Rad - lat1Rad;
        var dLon = lon2Rad - lon1Rad;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.asin(Math.sqrt(a));
        return R * c;
    };
    return (_jsxs(_Fragment, { children: [_jsx(Source, { id: "path-source-".concat(props.name), type: "geojson", data: {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: locations.map(function (loc) { return [loc[1], loc[0]]; })
                    }
                }, children: _jsx(Layer, { id: "path-layer-".concat(props.name), type: "line", source: "path-source-".concat(props.name), paint: {
                        'line-color': '#888',
                        'line-width': 4
                    } }) }), _jsx(TopicMaker, { topic: props.topic, name: props.name, scale: props.scale })] }));
}
