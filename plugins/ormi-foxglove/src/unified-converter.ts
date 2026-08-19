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
	BatteryState,
	DiagnosticArray,
	DiagnosticStatus,
} from "@workspace/ormi-core/types";
import {
	convertPosition,
	convertQuaternion,
} from "@workspace/ormi-core/transforms";
import { PluginsManager } from "@workspace/ormi-plugins";

/**
 * Current wall-clock time as a ROS 2 `builtin_interfaces/msg/Time`.
 *
 * Stamped command messages (e.g. `geometry_msgs/msg/TwistStamped` on a
 * teleoperation topic) are timed out by the receiving controller, so the
 * header must carry a real stamp rather than a zeroed placeholder.
 * @returns ROS 2 time with `sec`/`nanosec` fields.
 */
function rosTimeNow(): { sec: number; nanosec: number } {
	const ms = Date.now();
	const sec = Math.floor(ms / 1000);
	return { sec, nanosec: Math.round((ms - sec * 1000) * 1e6) };
}

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
		// if (this.pluginManager) {
		// 	return (
		// 		this.pluginManager.applyFilter<
		// 			typeof UnifiedConverter.converters
		// 		>("ros2-converters", UnifiedConverter.converters) ||
		// 		UnifiedConverter.converters
		// 	);
		// }

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
				"geometry_msgs/msg/TwistStamped": {
					toRos2: (data: Movement & { frameId?: string }) => {
						if (!data) {
							throw new Error(
								"Movement data is null or undefined",
							);
						}

						const sanitizeVector = (vec: any) => ({
							x: Number(vec?.x) || 0,
							y: Number(vec?.y) || 0,
							z: Number(vec?.z) || 0,
						});

						return {
							header: {
								stamp: rosTimeNow(),
								frame_id: data.frameId ?? "",
							},
							twist: {
								linear: sanitizeVector(data.linear),
								angular: sanitizeVector(data.angular),
							},
						};
					},
					fromRos2: (data: any) => ({
						linear: {
							x: data.twist?.linear?.x ?? 0,
							y: data.twist?.linear?.y ?? 0,
							z: data.twist?.linear?.z ?? 0,
						},
						angular: {
							x: data.twist?.angular?.x ?? 0,
							y: data.twist?.angular?.y ?? 0,
							z: data.twist?.angular?.z ?? 0,
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

						// Fast path detection: a little-endian float32 x/y/z
						// layout with a 4-byte-aligned stride and field offsets
						// lets us stride-read the payload as a Float32Array view
						// (`view[base + fieldFloatOffset]`) instead of paying a
						// bounds-checked, endianness-branched DataView call per
						// component — the common Livox layout. Big-endian,
						// non-float32, or non-4-aligned layouts keep the DataView
						// reader as a fallback.
						const xDatatype = fieldMap.x?.datatype;
						const yDatatype = fieldMap.y?.datatype;
						const zDatatype = fieldMap.z?.datatype;
						const viewAligned =
							littleEndian &&
							point_step % 4 === 0 &&
							buffer.byteOffset % 4 === 0;
						const useFloatView =
							viewAligned &&
							xDatatype === 7 &&
							yDatatype === 7 &&
							zDatatype === 7 &&
							xOffset % 4 === 0 &&
							yOffset % 4 === 0 &&
							zOffset % 4 === 0;

						// The whole loop is wrapped once. A per-point try/catch
						// deoptimises the hot body; an out-of-bounds read on a
						// malformed cloud stops the loop here, and the points
						// decoded before the fault are still returned — the same
						// skip-and-keep semantics as the previous per-point catch,
						// since a bad field offset faults deterministically.
						try {
							if (useFloatView) {
								const floatCount = Math.floor(
									buffer.byteLength / 4,
								);
								const floatView = new Float32Array(
									buffer.buffer,
									buffer.byteOffset,
									floatCount,
								);
								const uintView = new Uint32Array(
									buffer.buffer,
									buffer.byteOffset,
									floatCount,
								);
								const strideFloats = point_step / 4;
								const xFloat = xOffset / 4;
								const yFloat = yOffset / 4;
								const zFloat = zOffset / 4;

								// Intensity / rgb reads collapse to a view index
								// only when that field is itself float32/uint32
								// aligned; otherwise the DataView reader still
								// covers the single field.
								const intensityFloatFast =
									intensityOffset !== undefined &&
									intensityDatatype === 7 &&
									intensityOffset % 4 === 0;
								const intensityFloat = intensityFloatFast
									? intensityOffset! / 4
									: 0;
								const rgbViewFast =
									rgbOffset !== undefined &&
									rgbOffset % 4 === 0 &&
									(rgbDatatype === 5 ||
										rgbDatatype === 6 ||
										rgbDatatype === 7);
								const rgbFloat = rgbViewFast
									? rgbOffset! / 4
									: 0;

								for (let i = 0; i < totalPoints; i++) {
									const base = i * strideFloats;
									const x = floatView[base + xFloat]!;
									const y = floatView[base + yFloat]!;
									const z = floatView[base + zFloat]!;

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
											// A float32/uint32 rgb field reads its
											// raw 32-bit pattern straight from the
											// uint view (identical bytes to the
											// DataView float-bit reinterpret on
											// little-endian); otherwise fall back.
											const color = rgbViewFast
												? unpackRgb(
														uintView[
															base + rgbFloat
														]!,
													)
												: readRgb(
														dataView,
														base * 4 + rgbOffset,
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
											const rawIntensity =
												intensityFloatFast
													? floatView[
															base +
																intensityFloat
														]!
													: readFieldValue(
															dataView,
															base * 4 +
																intensityOffset,
															intensityDatatype,
														);
											intensities[validPointCount] =
												normalizeIntensity(
													rawIntensity,
													intensityDatatype,
												);
										}

										validPointCount++;
									}
								}
							} else {
								for (let i = 0; i < totalPoints; i++) {
									const baseOffset = i * point_step;

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
											intensities[validPointCount] =
												normalizeIntensity(
													rawIntensity,
													intensityDatatype,
												);
										}

										validPointCount++;
									}
								}
							}
						} catch {
							// Malformed cloud: keep the points decoded so far.
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
				"sensor_msgs/msg/LaserScan": {
					toRos2: (data: PointsCloud) => ({}),
					fromRos2: (data): PointsCloud => {
						const ranges = data.ranges as
							ArrayLike<number> | undefined;
						if (!ranges || typeof ranges.length !== "number") {
							console.error("LaserScan message missing ranges");
							return {
								points: new Float32Array(0),
								convention: "THREE" as const,
							};
						}

						const angleMin =
							typeof data.angle_min === "number"
								? data.angle_min
								: 0;
						const angleIncrement =
							typeof data.angle_increment === "number"
								? data.angle_increment
								: 0;
						const rangeMin =
							typeof data.range_min === "number"
								? data.range_min
								: 0;
						const rangeMax =
							typeof data.range_max === "number"
								? data.range_max
								: Infinity;

						const count = ranges.length;
						const scanIntensities = data.intensities as
							ArrayLike<number> | undefined;
						const hasIntensities =
							!!scanIntensities &&
							typeof scanIntensities.length === "number" &&
							scanIntensities.length === count;

						const packedPoints = new Float32Array(count * 3);
						const intensities = hasIntensities
							? new Float32Array(count)
							: undefined;
						let validPointCount = 0;
						let maxIntensity = 0;

						for (let i = 0; i < count; i++) {
							const r = ranges[i]!;
							// Drop NaN, +/-Inf, and out-of-window returns
							if (
								!Number.isFinite(r) ||
								r < rangeMin ||
								r > rangeMax
							) {
								continue;
							}

							const angle = angleMin + i * angleIncrement;
							// Polar -> Cartesian in the ROS sensor frame (the scan plane lies at z = 0)
							const x = r * Math.cos(angle);
							const y = r * Math.sin(angle);

							const idx = validPointCount * 3;
							// Convert ROS -> THREE
							packedPoints[idx] = -y;
							packedPoints[idx + 1] = 0;
							packedPoints[idx + 2] = -x;

							if (intensities && scanIntensities) {
								const intensity = scanIntensities[i]!;
								const safe = Number.isFinite(intensity)
									? intensity
									: 0;
								intensities[validPointCount] = safe;
								if (safe > maxIntensity) maxIntensity = safe;
							}

							validPointCount++;
						}

						const finalPoints = packedPoints.subarray(
							0,
							validPointCount * 3,
						);

						let finalIntensities: Float32Array | undefined;
						if (
							intensities &&
							validPointCount > 0 &&
							maxIntensity > 0
						) {
							// Normalize per-scan to 0..1 for coloring
							finalIntensities = intensities.subarray(
								0,
								validPointCount,
							);
							for (let i = 0; i < validPointCount; i++) {
								finalIntensities[i] =
									finalIntensities[i]! / maxIntensity;
							}
						}

						return {
							points: finalPoints,
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
		/**
		 * Initial pose estimate — published to /initialpose as
		 * geometry_msgs/msg/PoseWithCovarianceStamped (nav2 standard).
		 * The covariance matrix is set to zeros (unknown) on publish;
		 * users can configure it via the AMCL node itself.
		 */
		InitialPose: {
			conversions: {
				"geometry_msgs/msg/PoseWithCovarianceStamped": {
					toRos2: (data: PoseStamped & { frameId?: string }) => {
						const rosPosition = convertPosition(
							data.position,
							"THREE",
							"ROS",
						);
						const rosOrientation = convertQuaternion(
							data.orientation,
							"THREE",
							"ROS",
						);
						const sec = Math.floor(data.timestamp);
						const nanosec = Math.floor(
							(data.timestamp - sec) * 1e9,
						);
						return {
							header: {
								stamp: { sec, nanosec },
								frame_id: data.frameId ?? "map",
							},
							pose: {
								pose: {
									position: {
										x: rosPosition.x,
										y: rosPosition.y,
										z: rosPosition.z,
									},
									orientation: {
										x: rosOrientation.x,
										y: rosOrientation.y,
										z: rosOrientation.z,
										w: rosOrientation.w,
									},
								},
								// Zero covariance — AMCL will estimate it
								covariance: Array<number>(36).fill(0),
							},
						};
					},
					fromRos2: (data: any): PoseStamped => {
						const timestamp = data.header?.stamp
							? data.header.stamp.sec +
								data.header.stamp.nanosec / 1e9
							: Date.now() / 1000;
						const rosPosition = {
							x: data.pose?.pose?.position?.x || 0,
							y: data.pose?.pose?.position?.y || 0,
							z: data.pose?.pose?.position?.z || 0,
						};
						const rosOrientation = {
							x: data.pose?.pose?.orientation?.x || 0,
							y: data.pose?.pose?.orientation?.y || 0,
							z: data.pose?.pose?.orientation?.z || 0,
							w: data.pose?.pose?.orientation?.w || 1,
						};
						return {
							position: convertPosition(
								rosPosition,
								"ROS",
								"THREE",
							),
							orientation: convertQuaternion(
								rosOrientation,
								"ROS",
								"THREE",
							),
							timestamp,
							convention: "THREE",
						};
					},
				},
			},
		},
		Pose: {
			conversions: {
				"geometry_msgs/msg/PoseStamped": {
					toRos2: (data: PoseStamped & { frameId?: string }) => {
						const rosPosition = convertPosition(
							data.position,
							"THREE",
							"ROS",
						);
						const rosOrientation = convertQuaternion(
							data.orientation,
							"THREE",
							"ROS",
						);

						const sec = Math.floor(data.timestamp);
						const nanosec = Math.floor(
							(data.timestamp - sec) * 1e9,
						);
						return {
							header: {
								stamp: { sec, nanosec },
								frame_id: data.frameId ?? "map",
							},
							pose: {
								position: {
									x: rosPosition.x,
									y: rosPosition.y,
									z: rosPosition.z,
								},
								orientation: {
									x: rosOrientation.x,
									y: rosOrientation.y,
									z: rosOrientation.z,
									w: rosOrientation.w,
								},
							},
						};
					},
					fromRos2: (data: any): PoseStamped => {
						const timestamp = data.header?.stamp
							? data.header.stamp.sec +
								data.header.stamp.nanosec / 1e9
							: Date.now() / 1000;

						const rosPosition = {
							x: data.pose?.position?.x || 0,
							y: data.pose?.position?.y || 0,
							z: data.pose?.position?.z || 0,
						};
						const rosOrientation = {
							x: data.pose?.orientation?.x || 0,
							y: data.pose?.orientation?.y || 0,
							z: data.pose?.orientation?.z || 0,
							w: data.pose?.orientation?.w || 1,
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
							timestamp,
							convention: "THREE",
						};
					},
				},
			},
		},
		/**
		 * Battery state — sensor_msgs/msg/BatteryState.
		 * NaN is meaningful (an unmeasured float field) and is preserved here,
		 * never coerced to 0; the widget renders NaN as "—".
		 */
		BatteryState: {
			conversions: {
				"sensor_msgs/msg/BatteryState": {
					// Best-effort webapp → ros2 (display-only; ORMI does not publish this type).
					toRos2: (data: BatteryState) => ({
						header: {
							stamp: {
								sec: Math.floor(data.timestamp),
								nanosec: Math.floor((data.timestamp % 1) * 1e9),
							},
							frame_id: data.frameId,
						},
						voltage: data.voltage,
						temperature: data.temperature,
						current: data.current,
						charge: data.charge,
						capacity: data.capacity,
						design_capacity: data.designCapacity,
						percentage: data.percentage,
						power_supply_status: data.powerSupplyStatus,
						power_supply_health: data.powerSupplyHealth,
						power_supply_technology: data.powerSupplyTechnology,
						present: data.present,
						cell_voltage: data.cellVoltage,
						cell_temperature: data.cellTemperature,
						location: data.location,
						serial_number: data.serialNumber,
					}),
					fromRos2: (data: any): BatteryState => {
						// Preserve NaN — an unmeasured field must not read as 0.
						const num = (v: unknown) =>
							typeof v === "number" ? v : NaN;
						const stamp = data.header?.stamp;
						return {
							timestamp: stamp
								? stamp.sec + stamp.nanosec / 1e9
								: 0,
							frameId: data.header?.frame_id ?? "",
							voltage: num(data.voltage),
							temperature: num(data.temperature),
							current: num(data.current),
							charge: num(data.charge),
							capacity: num(data.capacity),
							designCapacity: num(data.design_capacity),
							percentage: num(data.percentage),
							powerSupplyStatus: Number(
								data.power_supply_status ?? 0,
							),
							powerSupplyHealth: Number(
								data.power_supply_health ?? 0,
							),
							powerSupplyTechnology: Number(
								data.power_supply_technology ?? 0,
							),
							present: !!data.present,
							// Array.from(x, Number) flattens CBOR/typed-array vs
							// JSON-array variance to a plain number[].
							cellVoltage: Array.from(
								data.cell_voltage ?? [],
								Number,
							),
							cellTemperature: Array.from(
								data.cell_temperature ?? [],
								Number,
							),
							location: data.location ?? "",
							serialNumber: data.serial_number ?? "",
						};
					},
				},
			},
		},
		/**
		 * Diagnostics — diagnostic_msgs/msg/DiagnosticArray.
		 * `level` is a ROS byte enum (OK=0, WARN=1, ERROR=2, STALE=3);
		 * normalized to a number here since CBOR/rosbridge may deliver it as a
		 * 1-char string or byte rather than a number.
		 */
		DiagnosticArray: {
			conversions: {
				"diagnostic_msgs/msg/DiagnosticArray": {
					// Best-effort webapp → ros2 (display-only; ORMI does not publish this type).
					toRos2: (data: DiagnosticArray) => ({
						header: {
							stamp: {
								sec: Math.floor(data.timestamp),
								nanosec: Math.floor((data.timestamp % 1) * 1e9),
							},
							frame_id: data.frameId,
						},
						status: data.status.map((s: DiagnosticStatus) => ({
							level: s.level,
							name: s.name,
							message: s.message,
							hardware_id: s.hardwareId,
							values: s.values.map((kv) => ({
								key: kv.key,
								value: kv.value,
							})),
						})),
					}),
					fromRos2: (data: any): DiagnosticArray => {
						// ROS `byte` may arrive as a number, or (under CBOR/
						// rosbridge) a 1-char string or byte. Normalize to a
						// number; default 0 (OK).
						const level = (v: unknown): number =>
							typeof v === "number"
								? v
								: typeof v === "string" && v.length === 1
									? v.charCodeAt(0)
									: Number(v ?? 0);
						const stamp = data.header?.stamp;
						return {
							timestamp: stamp
								? stamp.sec + stamp.nanosec / 1e9
								: 0,
							frameId: data.header?.frame_id ?? "",
							status: Array.from(data.status ?? [], (s: any) => ({
								level: level(s.level),
								name: String(s.name ?? ""),
								message: String(s.message ?? ""),
								hardwareId: String(s.hardware_id ?? ""),
								values: Array.from(
									s.values ?? [],
									(kv: any) => ({
										key: String(kv.key ?? ""),
										value: String(kv.value ?? ""),
									}),
								),
							})),
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

	// Returns all ros2 types for a given webapp type.
	static getAllROSTypesFromWebappType(webappType: string): string[] {
		const allConverters = this.getConverters();

		const conv = allConverters[webappType];
		return conv ? Object.keys(conv.conversions) : [];
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
