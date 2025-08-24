// Helper type definitions (or import them as needed)
// import { IMU, Movement } from "ormi-core/types/movement";
// ...other necessary imports...

import { Movement, IMU, PointsCloud, Vector3,Color,Image} from "@workspace/ormi-core/types";
import { PluginsManager } from "@workspace/ormi-plugins";


// Modified interface to handle multiple ros2 conversion logics per webapp type.
interface ConverterEntry {
    conversions: {
        [ros2Type: string]: {
            toRos2: (data: any) => any;
            fromRos2: (data: any) => any;
        }
    };
    isPrimitive?: boolean;
}

export class UnifiedConverter {

    static pluginManager: PluginsManager | null = null;

    // Updated mapping: each webapp type now contains a conversion mapping keyed by ros2 type.
    static converters: { [webType: string]: ConverterEntry } = {
        "Movement": {
            conversions: {
                "geometry_msgs/msg/Twist": {
                    toRos2: (data: Movement) => ({
                        linear: { x: data.linear.x, y: data.linear.y, z: data.linear.z },
                        angular: { x: data.angular.x, y: data.angular.y, z: data.angular.z }
                    }),
                    fromRos2: (data: any) => ({
                        linear: { x: data.linear.x, y: data.linear.y, z: data.linear.z },
                        angular: { x: data.angular.x, y: data.angular.y, z: data.angular.z }
                    })
                }
            }
        },
        "GeolocationPosition": {
            conversions: {
                "sensor_msgs/msg/NavSatFix": {
                    toRos2: (data: GeolocationPosition) => ({
                        latitude: data.coords.latitude,
                        longitude: data.coords.longitude,
                        altitude: data.coords.altitude,
                        position_covariance: [
                            data.coords.accuracy, 0,
                            data.coords.altitudeAccuracy, 0, 0,
                            data.coords.heading, 0, 0,
                            data.coords.speed
                        ],
                        header: { stamp: { sec: data.timestamp } }
                    }),
                    fromRos2: (data: any) => ({
                        coords: {
                            latitude: data.latitude,
                            longitude: data.longitude,
                            altitude: data.altitude,
                            accuracy: data.position_covariance[0],
                            altitudeAccuracy: data.position_covariance[2],
                            heading: data.position_covariance[4],
                            speed: data.position_covariance[8],
                            toJSON: function () {
                                return {
                                    latitude: this.latitude,
                                    longitude: this.longitude,
                                    altitude: this.altitude,
                                    accuracy: this.accuracy,
                                    altitudeAccuracy: this.altitudeAccuracy,
                                    heading: this.heading,
                                    speed: this.speed
                                };
                            }
                        },
                        timestamp: data.header.stamp.sec,
                        toJSON: function () {
                            return {
                                coords: this.coords.toJSON(),
                                timestamp: this.timestamp
                            };
                        }
                    })
                }
            }
        },
        "IMU": {
            conversions: {
                "sensor_msgs/msg/Imu": {
                    toRos2: (data: IMU) => ({
                        linear_acceleration: {
                            x: data.linear_acceleration.x,
                            y: data.linear_acceleration.y,
                            z: data.linear_acceleration.z
                        },
                        angular_velocity: {
                            x: data.angular_velocity.x,
                            y: data.angular_velocity.y,
                            z: data.angular_velocity.z
                        },
                        orientation: {
                            x: data.orientation.x,
                            y: data.orientation.y,
                            z: data.orientation.z,
                            w: data.orientation.w
                        }
                    }),
                    fromRos2: (data: any) => ({
                        linear_acceleration: {
                            x: data.linear_acceleration.x,
                            y: data.linear_acceleration.y,
                            z: data.linear_acceleration.z
                        },
                        angular_velocity: {
                            x: data.angular_velocity.x,
                            y: data.angular_velocity.y,
                            z: data.angular_velocity.z
                        },
                        orientation: {
                            x: data.orientation.x,
                            y: data.orientation.y,
                            z: data.orientation.z,
                            w: data.orientation.w
                        }
                    })
                }
            }
        },
        "string": {
            conversions: {
                "std_msgs/msg/String": {
                    toRos2: data => data,
                    fromRos2: data => data.data || data
                }
            },
            isPrimitive: true
        },
        "number": {
            conversions: {
                "std_msgs/msg/Int8": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                },
                "std_msgs/msg/Int16": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                },
                "std_msgs/msg/Int32": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                },
                "std_msgs/msg/Int64": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                },
                "std_msgs/msg/Float64": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                },
                "std_msgs/msg/Float32": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                },
                "std_msgs/msg/UInt32": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                },
                "std_msgs/msg/UInt64": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                }
            },
            isPrimitive: true
        },
        "boolean": {
            conversions: {
                "std_msgs/msg/Bool": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                }
            },
            isPrimitive: true
        },
        "PointsCloud": {
            conversions: {
                "sensor_msgs/msg/PointCloud2": {
                    toRos2: (data: PointsCloud) => ({}),
                    fromRos2: (data): PointsCloud => {

                        const points: Vector3[] = [];
                        const colors: Color[] = [];

                        const fields = data.fields;
                        const point_step = data.point_step;
                        const is_bigendian = data.is_bigendian;
                        const height = data.height;
                        const width = data.width;

                        // Create field lookup map
                        const fieldMap: Record<string, { offset: number, datatype: number }> = {};
                        fields.forEach((field: { name: string | number; offset: any; datatype: any; }) => {
                            fieldMap[field.name] = {
                                offset: field.offset,
                                datatype: field.datatype
                            };
                        });

                        // Get important field offsets
                        const xOffset = fieldMap.x?.offset;
                        const yOffset = fieldMap.y?.offset;
                        const zOffset = fieldMap.z?.offset;

                        if (xOffset === undefined || yOffset === undefined || zOffset === undefined) {
                            console.error("Point cloud missing x, y, or z fields");
                            return { points: [] };
                        }

                        // Handle the binary data properly
                        let totalPoints: number;

                        // Properly access the data buffer - data.data is a Uint8Array
                        const buffer = data.data;
                        totalPoints = Math.min(width * height, Math.floor(buffer.byteLength / point_step));

                        // Create a data view for efficient access - use the buffer property correctly
                        const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
                        const littleEndian = !is_bigendian;

                        // Process all points
                        for (let i = 0; i < totalPoints; i++) {
                            const baseOffset = i * point_step;

                            // Get x, y, z values directly
                            try {
                                const x = dataView.getFloat32(baseOffset + xOffset, littleEndian);
                                const y = dataView.getFloat32(baseOffset + yOffset, littleEndian);
                                const z = dataView.getFloat32(baseOffset + zOffset, littleEndian);

                                // Add valid points (could add filtering here if needed)
                                if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                                    points.push({ x, y, z });
                                }
                            } catch (e) {
                                // Skip points that can't be properly read
                                continue;
                            }
                        }

                        return { points };
                    }
                },
                "livox_ros_driver2/msg/CustomMsg": {
                    toRos2: (data: PointsCloud) => ({}),
                    fromRos2: (data): PointsCloud => {

                        const points: Vector3[] = [];
                        const colors: Color[] = [];

                        // Make sure we have points data
                        if (!data.points || !Array.isArray(data.points)) {
                            console.error("Livox point cloud data missing or invalid");
                            return { points: [] };
                        }

                        // Process each custom point
                        for (const point of data.points) {
                            // Extract basic coordinates
                            if (typeof point.x === 'number' &&
                                typeof point.y === 'number' &&
                                typeof point.z === 'number') {

                                // Add valid point to points array
                                if (!isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z)) {
                                    points.push({
                                        x: point.x,
                                        y: point.y,
                                        z: point.z
                                    });

                                    // Convert reflectivity to color if needed
                                    if (point.reflectivity !== undefined) {
                                        // Simple grayscale based on reflectivity (0-255 -> 0.2 to 1.0)
                                        const intensity = Math.min(Math.max(point.reflectivity / 255, 0.2), 1.0);

                                        colors.push({
                                            r: intensity,
                                            g: intensity,
                                            b: intensity,
                                            a: 1.0
                                        });
                                    }
                                }
                            }
                        }

                        // Return point cloud with additional metadata if available
                        return {
                            points,
                            colors: colors.length > 0 ? colors : undefined,
                        };
                    }
                }
            }
        },
        "Image": {
            conversions: {
                "sensor_msgs/msg/Image": {
                    toRos2: (data: any) => ({
                        height: data.height,
                        width: data.width,
                        encoding: data.encoding,
                        is_bigendian: data.is_bigendian,
                        step: data.step,
                        data: data.data
                    }),
                    fromRos2: (data: any): Image => {
                        // Create ImageData from ROS2 image data
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        if (!ctx) {
                            throw new Error('Could not create canvas context for image conversion');
                        }
                        
                        canvas.width = data.width;
                        canvas.height = data.height;
                        
                        // Create ImageData object
                        const imageData = ctx.createImageData(data.width, data.height);
                        
                        // Convert ROS2 image data based on encoding
                        if (data.encoding === 'rgb8') {
                            // RGB8 format: 3 bytes per pixel
                            for (let i = 0; i < data.width * data.height; i++) {
                                const srcIndex = i * 3;
                                const dstIndex = i * 4;
                                imageData.data[dstIndex] = data.data[srcIndex];     // R
                                imageData.data[dstIndex + 1] = data.data[srcIndex + 1]; // G
                                imageData.data[dstIndex + 2] = data.data[srcIndex + 2]; // B
                                imageData.data[dstIndex + 3] = 255; // A (full opacity)
                            }
                        } else if (data.encoding === 'bgr8') {
                            // BGR8 format: 3 bytes per pixel, BGR order
                            for (let i = 0; i < data.width * data.height; i++) {
                                const srcIndex = i * 3;
                                const dstIndex = i * 4;
                                imageData.data[dstIndex] = data.data[srcIndex + 2];     // R (from B)
                                imageData.data[dstIndex + 1] = data.data[srcIndex + 1]; // G
                                imageData.data[dstIndex + 2] = data.data[srcIndex];     // B (from R)
                                imageData.data[dstIndex + 3] = 255; // A (full opacity)
                            }
                        } else {
                            // For other encodings, copy data as-is or handle specifically
                            imageData.data.set(data.data.slice(0, imageData.data.length));
                        }
                        return {
                            width: data.width,
                            height: data.height,
                            data: imageData
                        };
                    }
                },
                "sensor_msgs/msg/CompressedImage": {
                    toRos2: (data: any) => ({
                        format: data.format,
                        data: data.data
                    }),
                    fromRos2: (data: any) => ({
                        format: data.format,
                        data: data.data
                    })
                }
            }
        }
    };

    // Updated: loops through each ConverterEntry's conversion mapping.
    static getWebappTypeFromROSType(ros2Type: string): string | undefined {

        let allConverters = this.pluginManager?.applyFilter<typeof UnifiedConverter.converters>("ros2-converters", UnifiedConverter.converters) || UnifiedConverter.converters;

        for (const webType in allConverters) {
            if (Object.keys(allConverters[webType]!.conversions).includes(ros2Type)) {
                return webType;
            }
        }
        return undefined;
    }

    // Returns the primary ros2 type (first key) for a given webapp type.
    static getROSTypeFromWebappType(webappType: string): string | undefined {

        let allConverters = this.pluginManager?.applyFilter<typeof UnifiedConverter.converters>("ros2-converters", UnifiedConverter.converters) || UnifiedConverter.converters;

        const conv = allConverters[webappType];
        return conv ? Object.keys(conv.conversions)[0] : undefined;
    }

    // Converts a ros2 object to a webapp object using conversion identified by originalRos2Type.
    static convertToWebapp(rosData: any, targetWebappType: string, originalRos2Type: string): any {

        let allConverters = this.pluginManager?.applyFilter<typeof UnifiedConverter.converters>("ros2-converters", UnifiedConverter.converters) || UnifiedConverter.converters;

        const entry = allConverters[targetWebappType];
        if (!entry || !entry.conversions[originalRos2Type]) {
            // throw new Error(`No conversion mapping found for webapp type: ${targetWebappType} and ros2 type: ${originalRos2Type}`);
            return rosData;
        }
        return entry.conversions[originalRos2Type].fromRos2(rosData);
    }

    // Converts a webapp object to a ros2 object using conversion identified by desiredRos2Type.
    static convertToROS2(webData: any, webappType: string, desiredRos2Type: string): any {

        let allConverters = this.pluginManager?.applyFilter<typeof UnifiedConverter.converters>("ros2-converters", UnifiedConverter.converters) || UnifiedConverter.converters;

        const entry = allConverters[webappType];
        if (!entry || !entry.conversions[desiredRos2Type]) {
            throw new Error(`No conversion mapping found for webapp type: ${webappType} and desired ros2 type: ${desiredRos2Type}`);
        }
        return entry.conversions[desiredRos2Type].toRos2(webData);
    }

    // ...additional helper methods if needed...
}
