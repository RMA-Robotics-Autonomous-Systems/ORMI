// Helper type definitions (or import them as needed)
// import { IMU, Movement } from "@/core/types/movement";
// ...other necessary imports...

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
                "string": {
                    toRos2: data => data,
                    fromRos2: data => data.data || data
                }
            }
        },
        "number": {
            conversions: {
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
                "bool": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                }
            },
            isPrimitive: true
        }
    };

	// Updated: loops through each ConverterEntry's conversion mapping.
	static getWebappTypeFromROSType(ros2Type: string): string | undefined {
		for (const webType in UnifiedConverter.converters) {
			if (Object.keys(UnifiedConverter.converters[webType].conversions).includes(ros2Type)) {
				return webType;
			}
		}
		return undefined;
	}

	// Returns the primary ros2 type (first key) for a given webapp type.
	static getROSTypeFromWebappType(webappType: string): string | undefined {
		const conv = UnifiedConverter.converters[webappType];
		return conv ? Object.keys(conv.conversions)[0] : undefined;
	}

	// Converts a ros2 object to a webapp object using conversion identified by originalRos2Type.
	static convertToWebapp(rosData: any, targetWebappType: string, originalRos2Type: string): any {
		const entry = UnifiedConverter.converters[targetWebappType];
		if (!entry || !entry.conversions[originalRos2Type]) {
			throw new Error(`No conversion mapping found for webapp type: ${targetWebappType} and ros2 type: ${originalRos2Type}`);
		}
		return entry.conversions[originalRos2Type].fromRos2(rosData);
	}

	// Converts a webapp object to a ros2 object using conversion identified by desiredRos2Type.
	static convertToROS2(webData: any, webappType: string, desiredRos2Type: string): any {
		const entry = UnifiedConverter.converters[webappType];
		if (!entry || !entry.conversions[desiredRos2Type]) {
			throw new Error(`No conversion mapping found for webapp type: ${webappType} and desired ros2 type: ${desiredRos2Type}`);
		}
		return entry.conversions[desiredRos2Type].toRos2(webData);
	}

	// ...additional helper methods if needed...
}
