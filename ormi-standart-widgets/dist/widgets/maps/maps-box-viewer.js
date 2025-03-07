"use client";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import Map from 'react-map-gl/maplibre';
import "maplibre-gl/dist/maplibre-gl.css";
import TopicMarker from "./marker-simple";
import { LocalDataSourcesProvider } from "ormi-core/datasources";
import { DatasourceTopicFilter } from "ormi-core/datasources";
import { usePluginsManager } from "ormi-core/plugins";
import { PluginsHooks } from "ormi-core/plugins";
import { Spinner } from "ormi-core/components";
import HeatMarker from "./marker-heat";
import PathMarker from "./marker-path";
import { MapIcon } from "lucide-react";
export default function MapsBoxViewer(props) {
    var _a = useState([4.3930369, 50.843941]), startingLocation = _a[0], setStartingLocation = _a[1]; // brussels default
    var _b = useState(true), isLoading = _b[0], setIsLoading = _b[1];
    var _c = useState(), rasterStyle = _c[0], setRasterStyle = _c[1];
    useEffect(function () {
        setRasterStyle({
            version: 8,
            sources: {
                'raster-tiles': {
                    type: 'raster',
                    tiles: [props.mapUrl],
                },
            },
            layers: [
                {
                    id: 'simple-tiles',
                    type: 'raster',
                    source: 'raster-tiles',
                    minzoom: 0,
                    maxzoom: 22
                },
            ]
        });
        if (props.use3D && props.apiKey) {
            setRasterStyle({
                version: 8,
                sources: {
                    'raster-tiles': {
                        type: 'raster',
                        tiles: [props.mapUrl],
                    },
                    // Add OSM vector tiles source
                    'openmaptiles': {
                        type: 'vector',
                        url: "https://api.maptiler.com/tiles/v3/tiles.json?key=".concat(props.apiKey)
                    }
                },
                layers: [
                    {
                        id: 'simple-tiles',
                        type: 'raster',
                        source: 'raster-tiles',
                        minzoom: 0,
                        maxzoom: 22
                    },
                    // Add 3D building layer using OSM data
                    {
                        'id': '3d-buildings',
                        'source': 'openmaptiles',
                        'source-layer': 'building',
                        'type': 'fill-extrusion',
                        'minzoom': 15,
                        'filter': ['!=', ['get', 'hide_3d'], true],
                        'paint': {
                            'fill-extrusion-color': [
                                'interpolate',
                                ['linear'],
                                ['get', 'render_height'], 0, 'lightgray', 200, 'royalblue', 400, 'lightblue'
                            ],
                            'fill-extrusion-height': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                15,
                                0,
                                16,
                                ['get', 'render_height']
                            ],
                            'fill-extrusion-base': ['case',
                                ['>=', ['get', 'zoom'], 16],
                                ['get', 'render_min_height'], 0
                            ]
                        }
                    },
                ]
            });
        }
        setIsLoading(false);
        if (typeof window !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (position) {
                setStartingLocation([position.coords.longitude, position.coords.latitude]);
                setIsLoading(false);
            }, function () {
                setIsLoading(false);
            });
        }
        else {
            setIsLoading(false);
        }
    }, [props]); // Empty dependency array = run once on mount
    if (isLoading) {
        return _jsx(Spinner, {});
    }
    return (_jsx("div", { className: "h-full w-full", style: { display: "grid" }, children: _jsx(Map, { initialViewState: {
                longitude: startingLocation[0],
                latitude: startingLocation[1],
                zoom: 15, // Increased zoom to better see buildings
                pitch: 45, // Add tilt
                bearing: 0
            }, style: { width: "100%", height: "100%" }, mapStyle: rasterStyle, children: (props.topics || []).length !== 0 && (_jsx(LocalDataSourcesProvider, { SelectedTopics: props.topics.map(function (t) { return t.topic; }), buffersSize: 50, children: props.topics.map(function (t) {
                    if (t.makerType === "simple") {
                        return _jsx(TopicMarker, { topic: t.topic, name: t.name, scale: 1 }, t.name);
                    }
                    else if (t.makerType === "heatmap") {
                        return _jsx(HeatMarker, { topic: t.topic, name: t.name, scale: 1 }, t.name);
                    }
                    else if (t.makerType === "path") {
                        return _jsx(PathMarker, { topic: t.topic, name: t.name, scale: 1 }, t.name);
                    }
                    return null;
                }) })) }) }));
}
export function MapsBoxViewerDefinition() {
    var _this = this;
    var pluginsManager = usePluginsManager();
    return {
        id: 'map-box-viewer',
        name: 'Maps',
        description: 'Display the location of collection of robots',
        titleProp: 'title',
        icon: _jsx(MapIcon, {}),
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                mapUrl: {
                    type: 'string',
                    title: 'Map URL',
                    oneOf: [
                        {
                            const: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                            title: "OpenStreetMap"
                        },
                        // {
                        //     const: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
                        //     title: "OpenStreetMap DE"
                        // },
                        // {
                        //     const: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                        //     title: "OpenTopoMap"
                        // },
                        // {
                        //     const: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
                        //     title: "Stadia Maps"
                        // },
                        // {
                        //     const: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
                        //     title: "Stadia Maps Dark"
                        // },
                        // {
                        //     const: "https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png",
                        //     title: "OPNVKarte"
                        // }
                    ]
                },
                use3D: {
                    type: 'boolean',
                    title: 'Use 3D',
                    default: false
                },
                apiKey: {
                    type: 'string',
                    title: 'API Key',
                },
                topics: {
                    type: 'array',
                    title: 'Topics',
                    items: {
                        type: "object",
                        properties: {
                            name: {
                                "type": "string",
                                "title": "Name",
                            },
                            topic: {
                                "type": "object",
                                "title": "Topic",
                            },
                            makerType: {
                                "type": "string",
                                "title": "Maker Type",
                                "enum": ["simple", "heatmap", "path"],
                                "default": "simple"
                            }
                        },
                        "required": ["topic"]
                    }
                }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                },
                {
                    type: "Control",
                    scope: "#/properties/mapUrl",
                },
                {
                    type: "Control",
                    scope: "#/properties/use3D",
                },
                {
                    type: "Control",
                    scope: "#/properties/apiKey",
                },
                {
                    type: "Control",
                    scope: "#/properties/topics",
                    options: {
                        detail: {
                            type: "Group",
                            elements: [
                                {
                                    type: "Control",
                                    scope: "#/properties/name",
                                },
                                {
                                    type: "Control",
                                    scope: "#/properties/makerType",
                                },
                                {
                                    type: "TopicSelect",
                                    scope: "#/properties/topic",
                                    options: {
                                        asyncFunction: function () { return __awaiter(_this, void 0, void 0, function () {
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /GeolocationPosition/ }))];
                                                    case 1: return [2 /*return*/, _a.sent()];
                                                }
                                            });
                                        }); },
                                    }
                                }
                            ]
                        }
                    }
                }
            ]
        },
        data: {
            title: 'Chart',
            use3D: false,
        },
        Component: function (data) { return (_jsx(MapsBoxViewer, __assign({}, data))); }
    };
}
;
