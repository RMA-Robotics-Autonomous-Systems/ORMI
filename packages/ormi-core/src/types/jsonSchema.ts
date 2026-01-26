import { JSONSchema7 } from "json-schema";

import {
    Vector2,
    Vector3,
    Vector4,
    Quaternion,
    Color,
    PointsCloud,
} from "./common";
import { Movement, IMU } from "./movement";

export const WebTypes: string[] = [
    "Vector2",
    "Vector3",
    "Vector4",
    "Quaternion",
    "Transform",
    "Color",
    "PointsCloud",
    "Movement",
    "IMU",
    "number",
    "string",
    "boolean",
    "Image",
];

export const getSchemaFromStringName = (name: string): JSONSchema7 => {
    switch (name) {
        case "Vector2":
            return {
                type: "object",
                required: ["x", "y"],
                properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                },
            };

        case "Vector3":
            return {
                type: "object",
                required: ["x", "y", "z"],
                properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                    z: { type: "number" },
                },
            };

        case "Vector4":
            return {
                type: "object",
                required: ["x", "y", "z", "w"],
                properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                    z: { type: "number" },
                    w: { type: "number" },
                },
            };

        case "Quaternion":
            return {
                type: "object",
                required: ["x", "y", "z", "w"],
                properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                    z: { type: "number" },
                    w: { type: "number" },
                },
            };

        case "Transform":
            return {
                type: "object",
                required: ["position", "rotation"],
                properties: {
                    position: getSchemaFromStringName("Vector4"),
                    rotation: getSchemaFromStringName("Quaternion"),
                },
            };

        case "Color":
            return {
                type: "object",
                required: ["r", "g", "b", "a"],
                properties: {
                    r: { type: "number" },
                    g: { type: "number" },
                    b: { type: "number" },
                    a: { type: "number" },
                },
            };

        case "PointsCloud":
            return {
                type: "object",
                required: ["points"],
                properties: {
                    points: {
                        type: "array",
                        items: { type: "number" },
                    },
                    colors: {
                        type: "array",
                        items: { type: "number" },
                    },
                    intensities: {
                        type: "array",
                        items: { type: "number" },
                    },
                },
            };

        case "Movement":
            return {
                type: "object",
                required: ["linear", "angular"],
                properties: {
                    linear: getSchemaFromStringName("Vector3"),
                    angular: getSchemaFromStringName("Vector3"),
                },
            };

        case "IMU":
            return {
                type: "object",
                required: [
                    "linear_acceleration",
                    "angular_velocity",
                    "orientation",
                ],
                properties: {
                    linear_acceleration: getSchemaFromStringName("Vector3"),
                    angular_velocity: getSchemaFromStringName("Vector3"),
                    orientation: getSchemaFromStringName("Vector4"),
                },
            };

        default:
            return {
                type: "object",
                properties: {},
            };
    }
};
