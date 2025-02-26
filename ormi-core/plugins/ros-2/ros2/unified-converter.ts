// Helper type definitions (or import them as needed)
// import { IMU, Movement } from "@/core/types/movement";
// ...other necessary imports...

import { Color, Vector3,PointsCloud } from "@/core/types/common";
import { IMU, Movement } from "@/core/types/movement";

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
                "std_msgs/msg/String": {
                    toRos2: data => data,
                    fromRos2: data => data.data || data
                }
            },
            isPrimitive: true
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
                "std_msgs/msg/Boolean": {
                    toRos2: data => ({ data }),
                    fromRos2: data => data.data
                }
            },
            isPrimitive: true
        },
        "PointsCloud": {
            conversions:{
                "sensor_msgs/msg/PointCloud2": {
                    toRos2: (data: any) => ({}),
                    fromRos2: (data: any) : PointsCloud => {
                        const points: Vector3[] = [];
                        const colors: Color[] = [];

                        const fields = data.fields;
                        const point_step = data.point_step;
                        const row_step = data.row_step;
                        const data_buffer: string = data.data;    // bytes array of the point cloud data
                        const is_bigendian = data.is_bigendian;
                        const height = data.height;
                        const width = data.width;
                        const is_dense = data.is_dense;

                        // console.log(fields,point_step,row_step,is_bigendian,height,width,is_dense);

                        // Extract points and colors from binary data
                        const fieldIndexMap : any = {};
                        // const hasColor = fields.some(field => field.name === 'rgb' || field.name === 'rgba');
                        // Create lookup map for fields
                        fields.forEach(field => {
                            fieldIndexMap[field.name] = {
                                offset: field.offset,
                                datatype: field.datatype,
                                count: field.count
                            };
                        });

                        // Create one buffer at max needed size
                        const maxFieldSize = 8; // Size of largest datatype (FLOAT64)
                        const buffer = new ArrayBuffer(maxFieldSize);
                        const view = new DataView(buffer);

                        // Then reuse this buffer for each field

                        // Process each point
                        const totalPoints = width * height;
                        
                        // create an array of Ros2 points from the binary data
                        for (let i = 0; i < totalPoints; i++) {
                            const pointOffset = i * point_step;
                            
                            // Skip invalid points if buffer is too short
                            if (pointOffset + point_step > data_buffer.length) {
                                continue;
                            }
                            
                            const point_blob = data_buffer.slice(pointOffset, pointOffset + point_step);
                            const point_object: Record<string, number> = {};

                            // using the fieldIndexMap, extract the fields values from the point_blob
                            for(const field in fieldIndexMap){
                                const name = field;
                                const fieldInfo = fieldIndexMap[field];
                                const fieldOffset = fieldInfo.offset;
                                const datatype = fieldInfo.datatype;
                                const count = fieldInfo.count;
                                
                                // Skip if the field offset is outside the point blob
                                if (fieldOffset >= point_blob.length) {
                                    continue;
                                }
                                
                                // Calculate field size correctly based on datatype
                                const bytesPerElement = 
                                    datatype === 1 || datatype === 2 ? 1 :  // INT8, UINT8
                                    datatype === 3 || datatype === 4 ? 2 :  // INT16, UINT16
                                    datatype === 5 || datatype === 6 || datatype === 7 ? 4 :  // INT32, UINT32, FLOAT32
                                    datatype === 8 ? 8 : 1;  // FLOAT64
                                
                                const fieldSize = count * bytesPerElement;
                                
                                // Make sure we don't read past the blob
                                if (fieldOffset + fieldSize > point_blob.length) {
                                    continue;
                                }
                                
                                const current_blob = point_blob.slice(fieldOffset, fieldOffset + fieldSize);
                                
                                // Copy the bytes into the buffer
                                for (let j = 0; j < current_blob.length; j++) {
                                    // the current_blob is a base64 encoded string, so we need to convert it to a number
                                    view.setUint8(j, current_blob.charCodeAt(j));
                                }
                                
                                const littleEndian = !is_bigendian;
                                
                                // Extract value based on datatype
                                try {
                                    switch(datatype){
                                        case 1: // INT8
                                            point_object[name] = view.getInt8(0);
                                            break;
                                        case 2: // UINT8
                                            point_object[name] = view.getUint8(0);
                                            break;
                                        case 3: // INT16
                                            point_object[name] = view.getInt16(0, littleEndian);
                                            break;
                                        case 4: // UINT16
                                            point_object[name] = view.getUint16(0, littleEndian);
                                            break;
                                        case 5: // INT32
                                            point_object[name] = view.getInt32(0, littleEndian);
                                            break;
                                        case 6: // UINT32
                                            point_object[name] = view.getUint32(0, littleEndian);
                                            break;
                                        case 7: // FLOAT32
                                            if (current_blob.length >= 4) {
                                                point_object[name] = view.getFloat32(0, littleEndian);
                                            }
                                            break;
                                        case 8: // FLOAT64
                                            if (current_blob.length >= 8) {
                                                point_object[name] = view.getFloat64(0, littleEndian);
                                            }
                                            break;
                                    }
                                } catch (e) {
                                    console.error(`Error parsing ${name} field:`, e);
                                }
                            }

                            // Only collect points if all coordinates are valid
                            const x = point_object['x'];
                            const y = point_object['y'];
                            const z = point_object['z'];

                            if (x !== undefined && y !== undefined && z !== undefined) {
                                // Filter out zero or near-zero points if they're likely invalid
                                points.push({x, y, z});
                            }
                        }

                        return {
                            points: points,
                        };
                    }
                }
            }
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
			// throw new Error(`No conversion mapping found for webapp type: ${targetWebappType} and ros2 type: ${originalRos2Type}`);
            return rosData;
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
