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
import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useLocalDataSource } from "ormi-core/datasources";
import { Layer, Source } from "react-map-gl/maplibre";
export default function HeatMarker(props) {
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
    var geojson = {
        type: 'FeatureCollection',
        features: locations.map(function (loc) { return ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [loc[1], loc[0]]
            }
        }); })
    };
    return (_jsx(Source, { id: "heatmap", type: "geojson", data: geojson, children: _jsx(Layer, { id: "heatmap-layer", type: "heatmap", paint: {
                'heatmap-radius': 10,
                'heatmap-opacity': 0.8,
                'heatmap-weight': 1,
                'heatmap-intensity': 1,
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(33,102,172,0)',
                    0.2, 'rgb(103,169,207)',
                    0.4, 'rgb(209,229,240)',
                    0.6, 'rgb(253,219,199)',
                    0.8, 'rgb(239,138,98)',
                    1, 'rgb(178,24,43)'
                ]
            } }) }));
}
