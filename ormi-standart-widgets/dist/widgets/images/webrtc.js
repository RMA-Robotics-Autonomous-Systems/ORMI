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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useButtonHolder } from '@/components/advanced/ButtonHolder/button-holder-provider';
import { Button } from '@/components/ui/button';
import { DatasourceTopicFilter } from 'ormi-core/datasources';
import { usePluginsManager, PluginsHooks } from 'ormi-core/plugins';
import { CctvIcon, RotateCcw, RotateCw } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
var getHostFromWSUrl = function (url) {
    var urlParts = url.split('/');
    return urlParts[2].split(':')[0];
};
var WebrtcRos2VideoStream = function (props) {
    var videoRef = useRef(null);
    // check if the topic source is compatible with this widget, it must be coming from ROS2 datasource
    // for that the topic source must be of type RosBridgeSuiteDataSourceSettings
    var isCompatibleWithTopicSource = true;
    var ros2Definition = props.topic.source;
    var _a = useButtonHolder(), setButtonItem = _a.setButtonItem, removeButtonItem = _a.removeButtonItem;
    var host = getHostFromWSUrl(ros2Definition.url);
    var topic = props.topic.topic;
    var _b = React.useState(0), rotation = _b[0], setRotation = _b[1];
    useEffect(function () {
        var _a;
        var pc = new RTCPeerConnection({
            iceServers: (_a = props.iceServersUrls) === null || _a === void 0 ? void 0 : _a.map(function (url) { return ({ urls: url }); })
        });
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.ontrack = function (event) {
            if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0];
            }
        };
        var negotiate = function () { return __awaiter(void 0, void 0, void 0, function () {
            var offer, response, answer, error_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, pc.createOffer()];
                    case 1:
                        offer = _c.sent();
                        return [4 /*yield*/, pc.setLocalDescription(offer)];
                    case 2:
                        _c.sent();
                        // Wait for ICE gathering to complete with a timeout
                        return [4 /*yield*/, new Promise(function (resolve) {
                                var timeout = setTimeout(function () {
                                    console.warn('ICE gathering timed out');
                                    resolve();
                                }, 1000); // Adjust timeout as needed
                                if (pc.iceGatheringState === 'complete') {
                                    clearTimeout(timeout);
                                    resolve();
                                }
                                else {
                                    var checkState_1 = function () {
                                        if (pc.iceGatheringState === 'complete') {
                                            pc.removeEventListener('icegatheringstatechange', checkState_1);
                                            clearTimeout(timeout);
                                            resolve();
                                        }
                                    };
                                    pc.addEventListener('icegatheringstatechange', checkState_1);
                                }
                            })];
                    case 3:
                        // Wait for ICE gathering to complete with a timeout
                        _c.sent();
                        return [4 /*yield*/, fetch("http://".concat(host, ":8080/offer"), {
                                method: 'POST',
                                body: JSON.stringify({
                                    sdp: (_a = pc.localDescription) === null || _a === void 0 ? void 0 : _a.sdp,
                                    type: (_b = pc.localDescription) === null || _b === void 0 ? void 0 : _b.type,
                                    topic: topic,
                                }),
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                            })];
                    case 4:
                        response = _c.sent();
                        if (!response.ok) {
                            throw new Error("Server responded with ".concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 5:
                        answer = _c.sent();
                        return [4 /*yield*/, pc.setRemoteDescription(answer)];
                    case 6:
                        _c.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        error_1 = _c.sent();
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        }); };
        negotiate();
        setButtonItem("webrtc-viewer-widget-rotate-ccw", _jsx(Button, { variant: "ghost", onClick: function () { setRotation(function (r) { return (r - 90) % 360; }); }, children: _jsx(RotateCcw, {}) }));
        setButtonItem("webrtc-viewer-widget-rotate-cw", _jsx(Button, { variant: "ghost", onClick: function () { setRotation(function (r) { return (r + 90) % 360; }); }, children: _jsx(RotateCw, {}) }));
        return function () {
            removeButtonItem("webrtc-viewer-widget");
            pc.close();
        };
    }, [props]);
    return (_jsxs("div", { children: [isCompatibleWithTopicSource && (_jsx("video", { id: "video", autoPlay: true, muted: true, playsInline: true, ref: videoRef, style: { width: '100%', height: 'auto', transform: "rotate(".concat(rotation, "deg)") } })), !isCompatibleWithTopicSource && (_jsxs("div", { children: [_jsx("h3", { children: "Topic source is not compatible with this widget" }), _jsx("p", { children: "Topic must be from ROS2 datasource and have a Webrtc server running" })] }))] }));
};
export default WebrtcRos2VideoStream;
export function WebRtcRos2Definition() {
    var _this = this;
    var pluginsManager = usePluginsManager();
    var title = {
        type: "Control",
        scope: "#/properties/title",
    };
    var topic = {
        type: "TopicSelect",
        scope: "#/properties/topic",
        options: {
            asyncFunction: function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({
                                source_id: /rosbridge-suite-source/
                            }))];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            }); },
            buffer: 1,
        }
    };
    var iceServersUrls = {
        type: "Control",
        scope: "#/properties/iceServersUrls",
    };
    var layout = {
        type: "VerticalLayout",
        elements: [title, topic, iceServersUrls],
    };
    return {
        id: 'webrtc-viewer-widget',
        name: 'WebRTC viewer',
        description: 'Display a video stream from a ROS2 topic',
        titleProp: 'title',
        icon: _jsx(CctvIcon, {}),
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                iceServersUrls: {
                    type: 'array',
                    title: 'ICE Servers URLs',
                    items: {
                        type: 'string'
                    },
                    default: ['stun:stun.l.google.com:19302']
                }
            },
            required: ['title', 'topic']
        },
        uischema: layout,
        data: {
            title: 'WebRTC viewer',
            iceServersUrls: ['stun:stun.l.google.com:19302']
        },
        Component: function (data) { return (_jsx(WebrtcRos2VideoStream, { title: data.title, topic: data.topic })); }
    };
}
