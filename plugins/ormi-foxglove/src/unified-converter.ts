// Helper type definitions (or import them as needed)
// import { IMU, Movement } from "ormi-core/types/movement";
// ...other necessary imports...

import {
	Movement,
	IMU,
	PointsCloud,
	Vector3,
	Color,
	PoseStamped,
	Path,
	MapGrid,
} from "@workspace/ormi-core/types";
import {
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import { PluginsManager } from "@workspace/ormi-plugins";

/**
 * Converter entry for unified ros2/webapp type conversion.
 */
interface ConverterEntry {
	conversions: {
		[ros2Type: string]: {
			toRos2: (data: any) => any;
			fromRos2: (data: any) => any;
		};
	};
	isPrimitive?: boolean;
}

/**
 * Unified converter for ros2 and webapp types.
 */
export class UnifiedConverter {
	static pluginManager: PluginsManager | null = null;
	static externalConverters: { [webType: string]: ConverterEntry } | null =
		null;

	private static getConverters(): { [webType: string]: ConverterEntry } {
		if (this.pluginManager) {
			return (
				this.pluginManager.applyFilter<
					typeof UnifiedConverter.converters
				>("ros2-converters", UnifiedConverter.converters) ||
				UnifiedConverter.converters
			);
		}

		return this.externalConverters ?? UnifiedConverter.converters;
	}

	// Updated mapping: each webapp type now contains a conversion mapping keyed by ros2 type.
	static converters: { [webType: string]: ConverterEntry } = {
		Movement: {
			conversions: {
				"geometry_msgs/msg/Twist": {
					toRos2: (data: Movement) => {
						// Defensive programming to ensure valid structure
						if (!data) {
							throw new Error(
								"Movement data is null or undefined",
							);
						}

						const linear = data.linear || { x: 0, y: 0, z: 0 };
						const angular = data.angular || { x: 0, y: 0, z: 0 };

						// Ensure all values are valid numbers
						const sanitizeVector = (vec: any) => ({
							x: Number(vec?.x) || 0,
							y: Number(vec?.y) || 0,
							z: Number(vec?.z) || 0,
						});

						return {
							linear: sanitizeVector(linear),
							angular: sanitizeVector(angular),
						};
					},
					fromRos2: (data: any) => ({
						linear: {
							x: data.linear.x,
							y: data.linear.y,
							z: data.linear.z,
						},
						angular: {
							x: data.angular.x,
							y: data.angular.y,
							z: data.angular.z,
						},
						// ROS Twist uses ROS REP-103 coordinate convention
						convention: "ROS" as const,
					}),
				},
			},
		},
		GeolocationPosition: {
			conversions: {
				"sensor_msgs/msg/NavSatFix": {
					toRos2: (data: GeolocationPosition) => ({
						latitude: data.coords.latitude,
						longitude: data.coords.longitude,
						altitude: data.coords.altitude,
						position_covariance: [
							data.coords.accuracy,
							0,
							data.coords.altitudeAccuracy,
							0,
							0,
							data.coords.heading,
							0,
							0,
							data.coords.speed,
						],
						header: {
							stamp: {
								sec: Math.floor(data.timestamp / 1000),
								nanosec: Math.floor(
									(data.timestamp % 1000) * 1e6,
								),
							},
						},
					}),
					fromRos2: (data: any) => {
						const covariance = Array.isArray(
							data.position_covariance,
						)
							? data.position_covariance
							: [];
						const stamp = data.header?.stamp;
						const timestamp = stamp
							? stamp.sec * 1000 + stamp.nanosec / 1e6
							: Date.now();

						return {
							coords: {
								latitude: Number(data.latitude ?? 0),
								longitude: Number(data.longitude ?? 0),
								altitude: Number(data.altitude ?? 0),
								accuracy: Number(covariance[0] ?? 0),
								altitudeAccuracy: Number(covariance[2] ?? 0),
								heading: Number(covariance[4] ?? 0),
								speed: Number(covariance[8] ?? 0),
							},
							timestamp,
						};
					},
				},
			},
		},
		IMU: {
			conversions: {
				"sensor_msgs/msg/MagneticField": {
					toRos2: (data: IMU) => ({
						magnetic_field: data.linear_acceleration,
					}),
					fromRos2: (data: any) => {
						function eulerToQuaternion(
							x: number,
							y: number,
							z: number,
						): { x: number; y: number; z: number; w: number } {
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
								z: cr * cp * sy - sr * sp * cy,
							};
						}

						const mag = data.magnetic_field;
						const heading = Math.atan2(mag.y, mag.x);
						const orientation = eulerToQuaternion(0, 0, heading);

						return {
							linear_acceleration: data.magnetic_field || {
								x: 0,
								y: 0,
								z: 0,
							},
							angular_velocity: { x: 0, y: 0, z: 0 },
							orientation,
						};
					},
				},
				"sensor_msgs/msg/Imu": {
					toRos2: (data: IMU) => ({
						linear_acceleration: {
							x: data.linear_acceleration.x,
							y: data.linear_acceleration.y,
							z: data.linear_acceleration.z,
						},
						angular_velocity: {
							x: data.angular_velocity.x,
							y: data.angular_velocity.y,
							z: data.angular_velocity.z,
						},
						orientation: {
							x: data.orientation.x,
							y: data.orientation.y,
							z: data.orientation.z,
							w: data.orientation.w,
						},
					}),
					fromRos2: (data: any) => ({
						linear_acceleration: {
							x: data.linear_acceleration.x,
							y: data.linear_acceleration.y,
							z: data.linear_acceleration.z,
						},
						angular_velocity: {
							x: data.angular_velocity.x,
							y: data.angular_velocity.y,
							z: data.angular_velocity.z,
						},
						orientation: {
							x: data.orientation.x,
							y: data.orientation.y,
							z: data.orientation.z,
							w: data.orientation.w,
						},
						// ROS IMU uses ROS REP-103 coordinate convention
						convention: "ROS" as const,
					}),
				},
			},
		},
		string: {
			conversions: {
				"std_msgs/msg/String": {
					toRos2: (data) => data,
					fromRos2: (data) => data.data || data,
				},
			},
			isPrimitive: true,
		},
		number: {
			conversions: {
				"sensor_msgs/msg/Temperature": {
					toRos2: (data) => ({ temperature: data, variance: 0 }),
					fromRos2: (data) => data.temperature || 0,
				},
				"sensor_msgs/msg/FluidPressure": {
					toRos2: (data) => ({ fluid_pressure: data, variance: 0 }),
					fromRos2: (data) => data.fluid_pressure || 0,
				},
				"std_msgs/msg/Int8": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
				"std_msgs/msg/Int16": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
				"std_msgs/msg/Int32": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
				"std_msgs/msg/Int64": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
				"std_msgs/msg/Float64": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
				"std_msgs/msg/Float32": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
				"std_msgs/msg/UInt32": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
				"std_msgs/msg/UInt64": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
			},
			isPrimitive: true,
		},
		boolean: {
			conversions: {
				"std_msgs/msg/Bool": {
					toRos2: (data) => ({ data }),
					fromRos2: (data) => data.data,
				},
			},
			isPrimitive: true,
		},
		Vector3: {
			conversions: {
				"geometry_msgs/msg/Vector3Stamped": {
					toRos2: (data: Vector3) => ({
						vector: {
							x: data.x,
							y: data.y,
							z: data.z,
						},
					}),
					fromRos2: (data: any) => ({
						x: data.vector?.x || 0,
						y: data.vector?.y || 0,
						z: data.vector?.z || 0,
					}),
				},
				"geometry_msgs/msg/Vector3": {
					toRos2: (data: Vector3) => ({
						vector: {
							x: data.x,
							y: data.y,
							z: data.z,
						},
					}),
					fromRos2: (data: any) => ({
						x: data.vector?.x || 0,
						y: data.vector?.y || 0,
						z: data.vector?.z || 0,
					}),
				},
			},
		},
		Path: {
			conversions: {
				"nav_msgs/msg/Path": {
					toRos2: (data: Path) => ({
						header: {
							stamp: {
								sec: Math.floor(data.timestamp),
								nanosec: Math.floor((data.timestamp % 1) * 1e9),
							},
							frame_id: "",
						},
						poses: data.poses.map((pose: PoseStamped) => ({
							header: {
								stamp: {
									sec: Math.floor(pose.timestamp),
									nanosec: Math.floor(
										(pose.timestamp % 1) * 1e9,
									),
								},
								frame_id: "",
							},
							pose: {
								position: {
									x: pose.position.x,
									y: pose.position.y,
									z: pose.position.z,
								},
								orientation: {
									x: pose.orientation.x,
									y: pose.orientation.y,
									z: pose.orientation.z,
									w: pose.orientation.w,
								},
							},
						})),
					}),
					fromRos2: (data: any) => {
						const timestamp = data.header?.stamp
							? data.header.stamp.sec +
								data.header.stamp.nanosec / 1e9
							: Date.now() / 1000;

						const poses: PoseStamped[] = (data.poses || []).map(
							(poseStamped: any) => {
								const poseTimestamp = poseStamped.header?.stamp
									? poseStamped.header.stamp.sec +
										poseStamped.header.stamp.nanosec / 1e9
									: timestamp;
								const rosPosition = {
									x: poseStamped.pose?.position?.x || 0,
									y: poseStamped.pose?.position?.y || 0,
									z: poseStamped.pose?.position?.z || 0,
								};
								const rosOrientation = {
									x: poseStamped.pose?.orientation?.x || 0,
									y: poseStamped.pose?.orientation?.y || 0,
									z: poseStamped.pose?.orientation?.z || 0,
									w: poseStamped.pose?.orientation?.w || 1,
								};

								const position = convertPosition(
									rosPosition,
									"ROS",
									"THREE",
								);
								const orientation = convertQuaternion(
									rosOrientation,
									"ROS",
									"THREE",
								);

								return {
									position,
									orientation,
									timestamp: poseTimestamp,
								};
							},
						);

						return {
							poses,
							timestamp,
							convention: "THREE" as const,
						};
					},
				},
			},
		},
		PointsCloud: {
			conversions: {
				"sensor_msgs/msg/PointCloud2": {
					toRos2: (data: PointsCloud) => ({}),
					fromRos2: (data): PointsCloud => {
						const fields = data.fields;
						const point_step = data.point_step;
						const is_bigendian = data.is_bigendian;
						const height = data.height;
						const width = data.width;

						// Create field lookup map
						const fieldMap: Record<
							string,
							{ offset: number; datatype: number }
						> = {};
						fields.forEach(
							(field: {
								name: string | number;
								offset: any;
								datatype: any;
							}) => {
								fieldMap[field.name] = {
									offset: field.offset,
									datatype: field.datatype,
								};
							},
						);

						// Get important field offsets
						const xOffset = fieldMap.x?.offset;
						const yOffset = fieldMap.y?.offset;
						const zOffset = fieldMap.z?.offset;
						const intensityOffset =
							fieldMap.intensity?.offset ??
							fieldMap.reflectivity?.offset;
						const intensityDatatype =
							fieldMap.intensity?.datatype ??
							fieldMap.reflectivity?.datatype;
						const rgbOffset =
							fieldMap.rgb?.offset ?? fieldMap.rgba?.offset;
						const rgbDatatype =
							fieldMap.rgb?.datatype ?? fieldMap.rgba?.datatype;
						const hasRgba = fieldMap.rgba !== undefined;

						if (
							xOffset === undefined ||
							yOffset === undefined ||
							zOffset === undefined
						) {
							console.error(
								"Point cloud missing x, y, or z fields",
							);
							return { points: new Float32Array(0) };
						}

						// Handle the binary data properly
						let totalPoints: number;

						// Properly access the data buffer - data.data is a Uint8Array
						const buffer = data.data;
						totalPoints = Math.min(
							width * height,
							Math.floor(buffer.byteLength / point_step),
						);

						// Pre-allocate packed arrays for optimal performance
						const packedPoints = new Float32Array(totalPoints * 3);
						const packedColors = new Float32Array(totalPoints * 3);
						const intensities = new Float32Array(totalPoints);
						let validPointCount = 0;

						// Create a data view for efficient access - use the buffer property correctly
						const dataView = new DataView(
							buffer.buffer,
							buffer.byteOffset,
							buffer.byteLength,
						);
						const littleEndian = !is_bigendian;

						const readFieldValue = (
							view: DataView,
							offset: number,
							datatype: number,
						): number => {
							switch (datatype) {
								case 1:
									return view.getInt8(offset);
								case 2:
									return view.getUint8(offset);
								case 3:
									return view.getInt16(offset, littleEndian);
								case 4:
									return view.getUint16(offset, littleEndian);
								case 5:
									return view.getInt32(offset, littleEndian);
								case 6:
									return view.getUint32(offset, littleEndian);
								case 7:
									return view.getFloat32(
										offset,
										littleEndian,
									);
								case 8:
									return view.getFloat64(
										offset,
										littleEndian,
									);
								default:
									return NaN;
							}
						};

						const normalizeIntensity = (
							value: number,
							datatype: number,
						): number => {
							if (Number.isNaN(value)) return NaN;

							let max = 1;
							switch (datatype) {
								case 1:
								case 2:
									max = 255;
									break;
								case 3:
								case 4:
									max = 65535;
									break;
								case 5:
								case 6:
									max = 4294967295;
									break;
								case 7:
								case 8:
									max = value > 1 ? 255 : 1;
									break;
								default:
									max = 1;
							}

							const normalized = max > 0 ? value / max : value;
							return Math.min(Math.max(normalized, 0), 1);
						};

						const unpackRgb = (value: number): Color => {
							const r = (value >> 16) & 0xff;
							const g = (value >> 8) & 0xff;
							const b = value & 0xff;
							return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
						};

						const readRgb = (
							view: DataView,
							offset: number,
							datatype: number,
						): Color | null => {
							if (datatype === 7) {
								const floatValue = view.getFloat32(
									offset,
									littleEndian,
								);
								const uintArray = new Uint32Array(
									new Float32Array([floatValue]).buffer,
								);
								const uintValue = uintArray[0] ?? 0;
								return unpackRgb(uintValue);
							}

							if (datatype === 6 || datatype === 5) {
								const uintValue = view.getUint32(
									offset,
									littleEndian,
								);
								return unpackRgb(uintValue);
							}

							return null;
						};

						// Process all points
						for (let i = 0; i < totalPoints; i++) {
							const baseOffset = i * point_step;

							// Get x, y, z values directly
							try {
								const x = dataView.getFloat32(
									baseOffset + xOffset,
									littleEndian,
								);
								const y = dataView.getFloat32(
									baseOffset + yOffset,
									littleEndian,
								);
								const z = dataView.getFloat32(
									baseOffset + zOffset,
									littleEndian,
								);

								// Add valid points (could add filtering here if needed)
								if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
									const idx = validPointCount * 3;
									// Convert ROS -> THREE
									// THREE_X = -ROS_Y, THREE_Y = ROS_Z, THREE_Z = -ROS_X
									packedPoints[idx] = -y;
									packedPoints[idx + 1] = z;
									packedPoints[idx + 2] = -x;

									if (
										rgbOffset !== undefined &&
										rgbDatatype !== undefined
									) {
										const color = readRgb(
											dataView,
											baseOffset + rgbOffset,
											rgbDatatype,
										);
										if (color) {
											packedColors[idx] = color.r;
											packedColors[idx + 1] = color.g;
											packedColors[idx + 2] = color.b;
										}
									}

									if (
										intensityOffset !== undefined &&
										intensityDatatype !== undefined
									) {
										const rawIntensity = readFieldValue(
											dataView,
											baseOffset + intensityOffset,
											intensityDatatype,
										);
										const normalized = normalizeIntensity(
											rawIntensity,
											intensityDatatype,
										);
										intensities[validPointCount] =
											normalized;
									}

									validPointCount++;
								}
							} catch (e) {
								// Skip points that can't be properly read
								continue;
							}
						}

						// Trim arrays to actual size (important for memory efficiency)
						const finalPoints = packedPoints.subarray(
							0,
							validPointCount * 3,
						);
						const finalColors =
							validPointCount > 0 && rgbOffset !== undefined
								? packedColors.subarray(0, validPointCount * 3)
								: undefined;
						const finalIntensities =
							validPointCount > 0 && intensityOffset !== undefined
								? intensities.subarray(0, validPointCount)
								: undefined;

						return {
							points: finalPoints,
							colors: finalColors,
							intensities: finalIntensities,
							// Converted to Three.js coordinates
							convention: "THREE" as const,
						};
					},
				},
				"livox_ros_driver2/msg/CustomMsg": {
					toRos2: (data: PointsCloud) => ({}),
					fromRos2: (data): PointsCloud => {
						// Make sure we have points data
						if (!data.points || !Array.isArray(data.points)) {
							console.error(
								"Livox point cloud data missing or invalid",
							);
							return {
								points: new Float32Array(0),
								convention: "THREE" as const,
							};
						}

						const numPoints = data.points.length;
						const packedPoints = new Float32Array(numPoints * 3);
						const packedColors = new Float32Array(numPoints * 3);
						const intensities = new Float32Array(numPoints);
						let validPointCount = 0;

						// Process each custom point
						for (const point of data.points) {
							// Extract basic coordinates
							if (
								typeof point.x === "number" &&
								typeof point.y === "number" &&
								typeof point.z === "number"
							) {
								// Add valid point to points array
								if (
									!isNaN(point.x) &&
									!isNaN(point.y) &&
									!isNaN(point.z)
								) {
									const idx = validPointCount * 3;
									// Convert ROS -> THREE
									packedPoints[idx] = -point.y;
									packedPoints[idx + 1] = point.z;
									packedPoints[idx + 2] = -point.x;

									// Convert reflectivity to color if needed
									if (point.reflectivity !== undefined) {
										// Simple grayscale based on reflectivity (0-255 -> 0.2 to 1.0)
										const intensity = Math.min(
											Math.max(
												point.reflectivity / 255,
												0.2,
											),
											1.0,
										);

										intensities[validPointCount] =
											intensity;
										packedColors[idx] = intensity;
										packedColors[idx + 1] = intensity;
										packedColors[idx + 2] = intensity;
									}

									validPointCount++;
								}
							}
						}

						// Trim arrays to actual size
						const finalPoints = packedPoints.subarray(
							0,
							validPointCount * 3,
						);
						const finalColors =
							validPointCount > 0 &&
							data.points[0]?.reflectivity !== undefined
								? packedColors.subarray(0, validPointCount * 3)
								: undefined;
						const finalIntensities =
							validPointCount > 0 &&
							data.points[0]?.reflectivity !== undefined
								? intensities.subarray(0, validPointCount)
								: undefined;

						// Return point cloud with additional metadata if available
						return {
							points: finalPoints,
							colors: finalColors,
							intensities: finalIntensities,
							// Converted to Three.js coordinates
							convention: "THREE" as const,
						};
					},
				},
			},
		},
		Image: {
			conversions: {
				"sensor_msgs/msg/Image": {
					toRos2: (data: any) => ({
						height: data.height,
						width: data.width,
						encoding: data.encoding,
						is_bigendian: data.is_bigendian,
						step: data.step,
						data: data.data,
					}),
					fromRos2: (data: any): { __imageData: ImageData } => {
						// Return ImageData for async conversion to ImageBitmap
						const imageData = new ImageData(
							data.width,
							data.height,
						);

						const rawData =
							data.data instanceof Uint8Array
								? data.data
								: new Uint8Array(data.data);

						const encoding = data.encoding?.toLowerCase() || "";

						if (encoding === "rgb8") {
							for (let i = 0; i < data.width * data.height; i++) {
								const srcIndex = i * 3;
								const dstIndex = i * 4;
								imageData.data[dstIndex] = rawData[srcIndex]!;
								imageData.data[dstIndex + 1] =
									rawData[srcIndex + 1]!;
								imageData.data[dstIndex + 2] =
									rawData[srcIndex + 2]!;
								imageData.data[dstIndex + 3] = 255;
							}
						} else if (encoding === "bgr8") {
							for (let i = 0; i < data.width * data.height; i++) {
								const srcIndex = i * 3;
								const dstIndex = i * 4;
								imageData.data[dstIndex] =
									rawData[srcIndex + 2]!;
								imageData.data[dstIndex + 1] =
									rawData[srcIndex + 1]!;
								imageData.data[dstIndex + 2] =
									rawData[srcIndex]!;
								imageData.data[dstIndex + 3] = 255;
							}
						} else if (encoding === "rgba8") {
							imageData.data.set(
								rawData.subarray(0, imageData.data.length),
							);
						} else if (encoding === "bgra8") {
							for (let i = 0; i < data.width * data.height; i++) {
								const srcIndex = i * 4;
								const dstIndex = i * 4;
								imageData.data[dstIndex] =
									rawData[srcIndex + 2]!;
								imageData.data[dstIndex + 1] =
									rawData[srcIndex + 1]!;
								imageData.data[dstIndex + 2] =
									rawData[srcIndex]!;
								imageData.data[dstIndex + 3] =
									rawData[srcIndex + 3]!;
							}
						} else if (
							encoding === "mono8" ||
							encoding === "8uc1"
						) {
							for (let i = 0; i < data.width * data.height; i++) {
								const gray = rawData[i]!;
								const dstIndex = i * 4;
								imageData.data[dstIndex] = gray;
								imageData.data[dstIndex + 1] = gray;
								imageData.data[dstIndex + 2] = gray;
								imageData.data[dstIndex + 3] = 255;
							}
						} else if (
							encoding === "mono16" ||
							encoding === "16uc1"
						) {
							for (let i = 0; i < data.width * data.height; i++) {
								const srcIndex = i * 2;
								const gray = Math.floor(
									((rawData[srcIndex]! |
										(rawData[srcIndex + 1]! << 8)) /
										65535) *
										255,
								);
								const dstIndex = i * 4;
								imageData.data[dstIndex] = gray;
								imageData.data[dstIndex + 1] = gray;
								imageData.data[dstIndex + 2] = gray;
								imageData.data[dstIndex + 3] = 255;
							}
						} else {
							console.warn(
								`Unknown image encoding: ${data.encoding}, attempting raw copy`,
							);
							imageData.data.set(
								rawData.subarray(0, imageData.data.length),
							);
						}

						return { __imageData: imageData };
					},
				},
				"sensor_msgs/msg/CompressedImage": {
					toRos2: (data: any) => ({
						format: data.format,
						data: data.data,
					}),
					fromRos2: (
						data: any,
					): { __compressedData: Uint8Array; __format: string } => {
						// Return compressed data for async conversion to ImageBitmap
						const rawData =
							data.data instanceof Uint8Array
								? data.data
								: new Uint8Array(data.data);

						return {
							__compressedData: rawData,
							__format: data.format?.toLowerCase() || "jpeg",
						};
					},
				},
			},
		},
		/**
		 * Map / occupancy grid type.
		 *
		 * Both nav_msgs/OccupancyGrid and nav2_msgs/Costmap are normalised to the
		 * same canonical encoding:
		 *   0   = free, 1-253 = cost gradient, 254 = lethal/occupied, 255 = unknown.
		 */
		MapGrid: {
			conversions: {
				/**
				 * Standard ROS2 occupancy grid.
				 * data: int8[] – -1 = unknown, 0 = free, 1–100 = occupied/cost.
				 */
				"nav_msgs/msg/OccupancyGrid": {
					toRos2: (grid: MapGrid) => ({
						header: {
							stamp: {
								sec: Math.floor(grid.timestamp),
								nanosec: Math.floor((grid.timestamp % 1) * 1e9),
							},
							frame_id: grid.frameId,
						},
						info: {
							width: grid.width,
							height: grid.height,
							resolution: grid.resolution,
							origin: {
								position: grid.origin.position,
								orientation: grid.origin.orientation,
							},
						},
						data: Array.from(grid.data).map((v) => {
							if (v === 255) return -1;
							if (v === 0) return 0;
							if (v >= 254) return 100;
							return Math.round((v / 253) * 99) + 1;
						}),
					}),
					fromRos2: (data: any): MapGrid => {
						const width: number = data.info?.width ?? 0;
						const height: number = data.info?.height ?? 0;
						const rawData: number[] | Int8Array =
							data.data instanceof Int8Array
								? data.data
								: new Int8Array(data.data ?? []);

						// Normalise int8 (-1..100) → canonical uint8 (0..255)
						const rowMajor = new Uint8Array(width * height);
						for (let i = 0; i < rowMajor.length; i++) {
							const v = rawData[i] as number;
							if (v < 0) {
								// -1 = unknown
								rowMajor[i] = 255;
							} else if (v === 0) {
								rowMajor[i] = 0;
							} else if (v >= 100) {
								// 100 = fully occupied → lethal
								rowMajor[i] = 254;
							} else {
								// 1–99 → 1–252 (keep proportional)
								rowMajor[i] = Math.round((v / 99) * 252);
							}
						}
						// Use row-major data as-is. ROS (0,0) = bottom-left is handled by coordinate conversion and geometry rotation.
						const canonical = rowMajor;
						const timestamp =
							(data.header?.stamp.sec ?? 0) +
							(data.header?.stamp.nanosec ?? 0) / 1e9;

						const originRos = data.info?.origin ?? {};

						// Convert position and orientation from ROS to THREE convention
						const posRos = {
							x: originRos.position?.x ?? 0,
							y: originRos.position?.y ?? 0,
							z: originRos.position?.z ?? 0,
						};
						const rotRos = {
							x: originRos.orientation?.x ?? 0,
							y: originRos.orientation?.y ?? 0,
							z: originRos.orientation?.z ?? 0,
							w: originRos.orientation?.w ?? 1,
						};

						const posThree = convertPosition(
							posRos,
							"ROS",
							"THREE",
						);
						const rotThree = convertQuaternion(
							rotRos,
							"ROS",
							"THREE",
						);

						return {
							width,
							height,
							resolution: data.info?.resolution ?? 0.05,
							origin: {
								position: posThree,
								orientation: rotThree,
							},
							data: canonical,
							frameId: data.header?.frame_id ?? "map",
							timestamp,
							convention: "THREE",
						};
					},
				},
				/**
				 * Navigation 2 costmap.
				 * data: uint8[] – 0 = free, 1-252 = cost, 253 = inscribed, 254 = lethal, 255 = unknown.
				 * Already in canonical format – just wrap.
				 */
				"nav2_msgs/msg/Costmap": {
					toRos2: (grid: MapGrid) => ({
						header: {
							stamp: {
								sec: Math.floor(grid.timestamp),
								nanosec: Math.floor((grid.timestamp % 1) * 1e9),
							},
							frame_id: grid.frameId,
						},
						metadata: {
							size_x: grid.width,
							size_y: grid.height,
							resolution: grid.resolution,
							origin: {
								position: grid.origin.position,
								orientation: grid.origin.orientation,
							},
						},
						data: Array.from(grid.data),
					}),
					fromRos2: (data: any): MapGrid => {
						const width: number = data.metadata?.size_x ?? 0;
						const height: number = data.metadata?.size_y ?? 0;
						const rawData: number[] | Uint8Array =
							data.data instanceof Uint8Array
								? data.data
								: new Uint8Array(data.data ?? []);

						// nav2 costmap values are already in canonical format
						const rowMajor = new Uint8Array(width * height);
						rowMajor.set(
							rawData instanceof Uint8Array
								? rawData.subarray(0, rowMajor.length)
								: rawData.slice(0, rowMajor.length),
						);
						// Use row-major data as-is. ROS (0,0) = bottom-left is handled by coordinate conversion and geometry rotation.
						const canonical = rowMajor;
						// Convert position and orientation from ROS to THREE convention
						const posRos = {
							x: data.info.origin.position?.x ?? 0,
							y: data.info.origin.position?.y ?? 0,
							z: data.info.origin.position?.z ?? 0,
						};
						const rotRos = {
							x: data.info.origin.orientation?.x ?? 0,
							y: data.info.origin.orientation?.y ?? 0,
							z: data.info.origin.orientation?.z ?? 0,
							w: data.info.origin.orientation?.w ?? 1,
						};

						const timestamp =
							(data.header?.stamp.sec ?? 0) +
							(data.header?.stamp.nanosec ?? 0) / 1e9;

						const posThree = convertPosition(
							posRos,
							"ROS",
							"THREE",
						);
						const rotThree = convertQuaternion(
							rotRos,
							"ROS",
							"THREE",
						);
						return {
							width,
							height,
							resolution: data.metadata?.resolution ?? 0.05,
							origin: {
								position: posThree,
								orientation: rotThree,
							},
							data: canonical,
							frameId: data.header?.frame_id ?? "map",
							timestamp,
							convention: "THREE",
						};
					},
				},
			},
		},
	};

	// Updated: loops through each ConverterEntry's conversion mapping.
	static getWebappTypeFromROSType(ros2Type: string): string | undefined {
		const allConverters = this.getConverters();

		for (const webType in allConverters) {
			if (
				Object.keys(allConverters[webType]!.conversions).includes(
					ros2Type,
				)
			) {
				return webType;
			}
		}
		return undefined;
	}

	// Returns the primary ros2 type (first key) for a given webapp type.
	static getROSTypeFromWebappType(webappType: string): string | undefined {
		const allConverters = this.getConverters();

		const conv = allConverters[webappType];
		return conv ? Object.keys(conv.conversions)[0] : undefined;
	}

	// Converts a ros2 object to a webapp object using conversion identified by originalRos2Type.
	static convertToWebapp(
		rosData: any,
		targetWebappType: string,
		originalRos2Type: string,
	): any {
		const allConverters = this.getConverters();

		const entry = allConverters[targetWebappType];
		if (!entry || !entry.conversions[originalRos2Type]) {
			// throw new Error(`No conversion mapping found for webapp type: ${targetWebappType} and ros2 type: ${originalRos2Type}`);
			return rosData;
		}
		return entry.conversions[originalRos2Type].fromRos2(rosData);
	}

	// Converts a webapp object to a ros2 object using conversion identified by desiredRos2Type.
	static convertToROS2(
		webData: any,
		webappType: string,
		desiredRos2Type: string,
	): any {
		const allConverters = this.getConverters();

		const entry = allConverters[webappType];
		if (!entry || !entry.conversions[desiredRos2Type]) {
			throw new Error(
				`No conversion mapping found for webapp type: ${webappType} and desired ros2 type: ${desiredRos2Type}`,
			);
		}

		const converted = entry.conversions[desiredRos2Type].toRos2(webData);

		return converted;
	}

	// ...additional helper methods if needed...
}
