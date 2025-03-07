import { jsx as _jsx } from "react/jsx-runtime";
import { useLocalDataSource } from "ormi-core/datasources";
import PointsCloudWebGL from './points-cloud-webgl';
export default function PointsCloudCompWebGL(props) {
    var _a, _b;
    var maxPoints = (_a = props.maxPoints) !== null && _a !== void 0 ? _a : 100;
    var sources = useLocalDataSource().sources;
    var sources_keys = Array.from(sources.keys());
    var value = sources_keys.length > 0 ? sources.get(sources_keys[sources_keys.length - 1]) : { data: [] };
    var last_value = ((_b = value === null || value === void 0 ? void 0 : value.data) === null || _b === void 0 ? void 0 : _b[0]) || { points: [] };
    var rawPoints = (last_value.points && last_value.points.length)
        ? last_value.points
        : [];
    var pointsArray = rawPoints.slice(0, maxPoints);
    var pointsColors = last_value.colors && last_value.colors.length >= pointsArray.length
        ? last_value.colors.slice(0, pointsArray.length)
        : undefined;
    return (_jsx("div", { style: { width: '100%', height: '100%' }, children: _jsx(PointsCloudWebGL, { points: pointsArray, colors: pointsColors }) }));
}
