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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { style } from "ormi-core/jsonforms";
import { KeyboardIcon, LockIcon, UnlockIcon } from "lucide-react";
import { DatasourceTopicFilter, PublisherDataSourcesProvider, usePublisherDataSource } from "ormi-core/datasources";
import { usePluginsManager, PluginsHooks } from "ormi-core/plugins";
import { toast } from "@/hooks/use-toast";
export function KeyBoardControl(props) {
    var _a = useState(false), forward = _a[0], setForward = _a[1];
    var _b = useState(false), backward = _b[0], setBackward = _b[1];
    var _c = useState(false), left = _c[0], setLeft = _c[1];
    var _d = useState(false), right = _d[0], setRight = _d[1];
    var _e = useState(props.startingSpeed || 50), speed = _e[0], setSpeed = _e[1];
    var _f = useState(false), unlock = _f[0], setUnlock = _f[1];
    var _g = useState(false), speedkeyInc = _g[0], setSpeedKeyInc = _g[1];
    var _h = useState(false), speedkeyDec = _h[0], setSpeedKeyDec = _h[1];
    var publishers = usePublisherDataSource().publishers;
    useEffect(function () {
        var publish_freq = props.publicationFrequency || 30; // default to 30Hz
        var publish_period_ms = 1000 / publish_freq;
        var selectedTopic = props.topic;
        var publisher = publishers.get(selectedTopic.topic);
        if (!publisher) {
            toast({
                title: 'Error',
                description: "Publisher for topic ".concat(props.topic, " not found"),
                variant: 'destructive',
            });
        }
        var swtichToggle = function (press) {
            if (props.unlocktoggle && press) {
                setUnlock(function (prev) { return !prev; });
            }
            else if (!props.unlocktoggle) {
                setUnlock(press);
            }
        };
        var keyPressEvent = function (event) {
            if (event.key.toLowerCase() === props.forward.toLowerCase()) {
                setForward(true);
            }
            if (event.key.toLowerCase() === props.backward.toLowerCase()) {
                setBackward(true);
            }
            if (event.key.toLowerCase() === props.left.toLowerCase()) {
                setLeft(true);
            }
            if (event.key.toLowerCase() === props.right.toLowerCase()) {
                setRight(true);
            }
            if (event.key.toLowerCase() === props.incSpeed.toLowerCase()) {
                setSpeed(function (prev) { return prev + 10; });
                setSpeedKeyInc(true);
            }
            if (event.key.toLowerCase() === props.decSpeed.toLowerCase()) {
                setSpeed(function (prev) {
                    if (prev - 10 < 0) {
                        return 0;
                    }
                    return prev - 10;
                });
                setSpeedKeyDec(true);
            }
            if (event.key.toLowerCase() === props.unlock.toLowerCase()) {
                swtichToggle(true);
            }
        };
        var KeyUpEvent = function (event) {
            if (event.key.toLowerCase() === props.forward.toLowerCase()) {
                setForward(false);
            }
            if (event.key.toLowerCase() === props.backward.toLowerCase()) {
                setBackward(false);
            }
            if (event.key.toLowerCase() === props.left.toLowerCase()) {
                setLeft(false);
            }
            if (event.key.toLowerCase() === props.right.toLowerCase()) {
                setRight(false);
            }
            if (event.key.toLowerCase() === props.unlock.toLowerCase()) {
                swtichToggle(false);
            }
            if (event.key.toLowerCase() === props.incSpeed.toLowerCase()) {
                setSpeedKeyInc(false);
            }
            if (event.key.toLowerCase() === props.decSpeed.toLowerCase()) {
                setSpeedKeyDec(false);
            }
        };
        var movementFunction = function () {
            // only do anything if the keyboard is unlock (we don't want to move de robot by accident)
            if (!unlock) {
                return;
            }
            var movement = {
                linear: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                angular: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            };
            if (forward) {
                movement.linear.x += speed / 100;
            }
            if (backward) {
                movement.linear.x -= speed / 100;
            }
            if (left) {
                movement.angular.z += speed / 100;
            }
            if (right) {
                movement.angular.z -= speed / 100;
            }
            if (right || left || forward || backward) {
                publisher.publish(movement, "Movement");
            }
        };
        var publishInterval = setInterval(movementFunction, publish_period_ms);
        document.addEventListener('keydown', keyPressEvent);
        document.addEventListener('keyup', KeyUpEvent);
        return function () {
            clearInterval(publishInterval);
            document.removeEventListener('keydown', keyPressEvent);
            document.removeEventListener('keyup', KeyUpEvent);
        };
    }, [props, publishers, forward, backward, left, right, speed, unlock, speedkeyInc, speedkeyDec]);
    return (_jsx("div", { className: "flex justify-center items-center", style: { padding: "1rem", height: "100%" }, children: _jsxs("div", { className: "gap-3", style: { width: "100%", height: "100%", gap: "1rem", gridTemplateColumns: "1fr 1fr 1fr", display: "grid", gridTemplateRows: "1fr 1fr" }, children: [_jsxs("span", { "data-active": unlock, className: style.key, children: [" ", !unlock && _jsx(LockIcon, {}) || unlock && _jsx(UnlockIcon, {})] }), _jsx("span", { "data-active": forward, className: style.key, children: "Z" }), _jsxs("span", { "data-active": speedkeyInc || speedkeyDec, className: style.key, children: [" ", speed, "% "] }), _jsx("span", { "data-active": left, className: style.key, children: "Q" }), _jsx("span", { "data-active": backward, className: style.key, children: "S" }), _jsx("span", { "data-active": right, className: style.key, children: "D" })] }) }));
}
export function KeyboardControlDefinition() {
    var _this = this;
    var pluginsManager = usePluginsManager();
    return {
        id: 'keyboard-cmd-vel-widget',
        name: 'Keyboard control',
        description: 'Allow user to control the robot with the keyboard',
        titleProp: 'title',
        icon: _jsx(KeyboardIcon, {}),
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                forward: {
                    type: 'string',
                    title: 'Forward'
                },
                backward: {
                    type: 'string',
                    title: 'Backward'
                },
                left: {
                    type: 'string',
                    title: 'Left'
                },
                right: {
                    type: 'string',
                    title: 'Right'
                },
                startingSpeed: {
                    type: 'number',
                    title: 'Starting Speed',
                    default: 50
                },
                incSpeed: {
                    type: 'string',
                    title: 'Increase Speed'
                },
                decSpeed: {
                    type: 'string',
                    title: 'Decrease Speed'
                },
                unlock: {
                    type: 'string',
                    title: 'Unlock'
                },
                unlocktoggle: {
                    type: 'boolean',
                    title: 'Unlock Toggle'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                publicationFrequency: {
                    type: 'number',
                    title: 'Publication Frequency (Hz)',
                    default: 30
                }
            },
            required: ['title', 'topic']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                },
                {
                    type: "Key",
                    scope: "#/properties/forward",
                },
                {
                    type: "Key",
                    scope: "#/properties/backward",
                },
                {
                    type: "Key",
                    scope: "#/properties/left",
                },
                {
                    type: "Key",
                    scope: "#/properties/right",
                },
                {
                    type: "Control",
                    scope: "#/properties/startingSpeed",
                },
                {
                    type: "Key",
                    scope: "#/properties/incSpeed",
                },
                {
                    type: "Key",
                    scope: "#/properties/decSpeed",
                },
                {
                    type: "Key",
                    scope: "#/properties/unlock",
                },
                {
                    type: "Control",
                    scope: "#/properties/unlocktoggle",
                },
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        asyncFunction: function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, pluginsManager.applyFilterAsync(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({ type: /Movement/ }))];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); },
                        buffer: 1,
                    }
                },
                {
                    type: "Control",
                    scope: "#/properties/publicationFrequency",
                }
            ],
        },
        data: {
            title: 'Control the robot'
        },
        Component: function (data) { return (_jsx(PublisherDataSourcesProvider, { SelectedTopics: [data.topic], children: _jsx(KeyBoardControl, __assign({}, data)) })); }
    };
}
