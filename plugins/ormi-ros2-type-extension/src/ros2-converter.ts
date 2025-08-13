import { or } from "@jsonforms/core";
import { Color, IMU, Movement, PointsCloud, Quaternion, Vector3 } from "@workspace/ormi-core/types";

interface ConverterEntry {
    conversions: {
        [ros2Type: string]: {
            toRos2: (data: any) => any;
            fromRos2: (data: any) => any;
        }
    };
    isPrimitive?: boolean;
}


class Converters{
        // Updated mapping: each webapp type now contains a conversion mapping keyed by ros2 type.
    static converters: { [webType: string]: ConverterEntry } = {
        "number": {
            conversions: {
                "sensor_msgs/msg/Temperature": {
                    toRos2: data => ({ temperature: data, variance: 0 }),
                    fromRos2: data => data.temperature || 0
                },
                "sensor_msgs/msg/FluidPressure": {
                    toRos2: data => ({ fluid_pressure: data, variance: 0 }),
                    fromRos2: data => data.fluid_pressure || 0
                }
            },
            isPrimitive: true
        },
        "IMU": {
            conversions: {
                "sensor_msgs/msg/MagneticField": {  // mag is encoded in IMU linear_acceleration
                    toRos2: (data: IMU) => ({
                        magnetic_field: data.linear_acceleration

                    }),
                    fromRos2: (data: any) => {
                        
                        function eulerToQuaternion(x: number, y: number, z: number): { x: number; y: number; z: number; w: number } {
                            const cy = Math.cos(z * 0.5);
                            const sy = Math.sin(z * 0.5);
                            const cp = Math.cos(y * 0.5);
                            const sp = Math.sin(y * 0.5);
                            const cr = Math.cos(x * 0.5);
                            const sr = Math.sin(x * 0.5);

                            return {
                                w: cr * cp * cy + sr * sp * sy,
                                x: sr * cp * cy - cr * sp * sy,
                                y: cr * sp * cy + sr * cp * sy,
                                z: cr * cp * sy - sr * sp * cy
                            };
                        }

                        const mag = data.magnetic_field;    // in Tesla

                        // Convert magnetic field to heading (assuming sensor is perfectly level)
                        // Heading = atan2(mag_y, mag_x) in radians
                        const heading = Math.atan2(mag.y, mag.x);
                        
                        // Convert heading to quaternion (rotation around Z-axis)
                        const orientation = eulerToQuaternion(0, 0, heading);

                        return ({
                            linear_acceleration: data.magnetic_field || { x: 0, y: 0, z: 0 },
                            angular_velocity: { x: 0, y: 0, z: 0 },
                            orientation: orientation
                        });
                    }
                }
            }
        },
        "Vector3": {
            conversions: {
                "geometry_msgs/msg/Vector3Stamped": {
                    toRos2: (data: Vector3) => ({
                        vector: {
                            x: data.x,
                            y: data.y,
                            z: data.z
                        }
                    }),
                    fromRos2: (data: any) => {
                        return {
                            x: data.vector?.x || 0,
                            y: data.vector?.y || 0,
                            z: data.vector?.z || 0
                        };
                    }
                },
                "geometry_msgs/msg/Vector3": {
                    toRos2: (data: Vector3) => ({
                        vector: {
                            x: data.x,
                            y: data.y,
                            z: data.z
                        }
                    }),
                    fromRos2: (data: any) => {
                        return {
                            x: data.vector?.x || 0,
                            y: data.vector?.y || 0,
                            z: data.vector?.z || 0
                        };
                    }
                }
            }
        },
        "Transform": {
            conversions: {
                // "geometry_msgs/msg/TransformStamped": {
                //     toRos2: (data: { position: Vector3; rotation: Quaternion }) => ({
                //         transform: {
                //             translation: {
                //                 x: data.position.x,
                //                 y: data.position.y,
                //                 z: data.position.z
                //             },
                //             rotation: {
                //                 x: data.rotation.x,
                //                 y: data.rotation.y,
                //                 z: data.rotation.z,
                //                 w: data.rotation.w
                //             }
                //         }
                //     }),
                //     fromRos2: (data: any) => ({
                //         position: {
                //             x: data.transform?.translation?.x || 0,
                //             y: data.transform?.translation?.y || 0,
                //             z: data.transform?.translation?.z || 0
                //         },
                //         rotation: {
                //             x: data.transform?.rotation?.x || 0,
                //             y: data.transform?.rotation?.y || 0,
                //             z: data.transform?.rotation?.z || 0,
                //             w: data.transform?.rotation?.w || 1
                //         }
                //     })
                // },
                // "tf2_msgs/msg/TFMessage": {
                //     toRos2: (data: { id: string; parentId: string; transform: { position: Vector3; rotation: Quaternion } }) => ({
                //         transforms: [{
                //             header: {
                //                 stamp: { sec: 0, nanosec: 0 },
                //                 frame_id: data.parentId
                //             },
                //             child_frame_id: data.id,
                //             transform: {
                //                 translation: {
                //                     x: data.transform.position.x,
                //                     y: data.transform.position.y,
                //                     z: data.transform.position.z
                //                 },
                //                 rotation: {
                //                     x: data.transform.rotation.x,
                //                     y: data.transform.rotation.y,
                //                     z: data.transform.rotation.z,
                //                     w: data.transform.rotation.w
                //                 }
                //             }
                //         }]
                //     }),
                //     fromRos2: (data: any) => {
                //         if (!data.transforms || data.transforms.length === 0) {
                //             return { id: "", parentId: "", transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } };
                //         }
                //         const transform = data.transforms[0];
                //         return {
                //             id: transform.child_frame_id || "",
                //             parentId: transform.header.frame_id || "",
                //             transform: {
                //                 position: {
                //                     x: transform.transform.translation.x || 0,
                //                     y: transform.transform.translation.y || 0,
                //                     z: transform.transform.translation.z || 0
                //                 },
                //                 rotation: {
                //                     x: transform.transform.rotation.x || 0,
                //                     y: transform.transform.rotation.y || 0,
                //                     z: transform.transform.rotation.z || 0,
                //                     w: transform.transform.rotation.w || 1
                //                 }
                //             }
                //         };
                //     }
                // }
            }
        },
    };
}

export const ConverterFilterFunction = (converters: { [webType: string]: ConverterEntry }) => {
    
    // apply additional filters or modifications to the converters if needed

    let converterEntries: { [webType: string]: ConverterEntry } = {};

    for (const webType in converters) {
        const entry = converters[webType];
        if (entry && Object.keys(entry.conversions).length > 0) {
            converterEntries[webType] = entry;
        }
    }

    // add the new converters to the existing ones
    for (const webType in Converters.converters) {
        if (!converterEntries[webType]) {
            const converter = Converters.converters[webType];
            if (converter) {
                converterEntries[webType] = converter;
            }
        } else {

            const converter = Converters.converters[webType];
            if (converter && converter.conversions) {
                Object.assign(converterEntries[webType].conversions, converter.conversions);
            }
        }
    }

    return converterEntries;
};