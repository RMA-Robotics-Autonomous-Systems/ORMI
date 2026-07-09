// Helper type definitions (or import them as needed)
// import { IMU, Movement } from "ormi-core/types/movement";
// ...other necessary imports...

import {
	IMU,
	Movement,
	PointsCloud,
	BatteryState,
	DiagnosticArray,
	DiagnosticStatus,
} from "@workspace/ormi-core/types";

/**
 * Normalize a `uint8[]` message field to a `Uint8Array` view, without copying
 * when possible.
 *
 * What rosbridge delivers depends on the subscription compression:
 * - `cbor`: roslib decodes via `cbor2`, so byte fields arrive as a
 *   `Uint8Array` view over the frame buffer (typed-array CBOR tags decode to
 *   their matching typed arrays) — returned as-is, zero copy. Note the view
 *   may have a non-zero `byteOffset` into a larger buffer.
 * - `none` (plain JSON): byte fields arrive base64-encoded — decoded here.
 * - Plain number arrays / ArrayBuffers are wrapped defensively.
 */
function toByteArray(raw: unknown): Uint8Array | null {
	if (typeof raw === "string") {
		const binaryString = atob(raw);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes;
	}
	if (raw instanceof Uint8Array) {
		return raw;
	}
	if (ArrayBuffer.isView(raw)) {
		return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
	}
	if (raw instanceof ArrayBuffer) {
		return new Uint8Array(raw);
	}
	if (Array.isArray(raw)) {
		return new Uint8Array(raw);
	}
	return null;
}

// Modified interface to handle multiple ros2 conversion logics per webapp type.
interface ConverterEntry {
	conversions: {
		[ros2Type: string]: {
			toRos2: (data: any) => any;
			fromRos2: (data: any) => any;
		};
	};
	isPrimitive?: boolean;
}

export class UnifiedConverter {
	// Updated mapping: each webapp type now contains a conversion mapping keyed by ros2 type.
	static converters: { [webType: string]: ConverterEntry } = {
		Movement: {
			conversions: {
				"geometry_msgs/msg/Twist": {
					toRos2: (data: Movement) => ({
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
					}),
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
						header: { stamp: { sec: data.timestamp } },
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
									speed: this.speed,
								};
							},
						},
						timestamp: data.header.stamp.sec,
						toJSON: function () {
							return {
								coords: this.coords.toJSON(),
								timestamp: this.timestamp,
							};
						},
					}),
				},
			},
		},
		IMU: {
			conversions: {
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

						if (
							xOffset === undefined ||
							yOffset === undefined ||
							zOffset === undefined
						) {
							console.error(
								"Point cloud missing x, y, or z fields",
							);
							return {
								points: new Float32Array(0),
								convention: "THREE",
							};
						}

						// Normalize the binary blob: typed-array view under
						// CBOR (zero copy), base64 string under plain JSON.
						const bytes = toByteArray(data.data);
						if (!bytes) {
							console.error(
								"Unsupported point cloud data format",
							);
							return {
								points: new Float32Array(0),
								convention: "THREE",
							};
						}

						const totalPoints = Math.min(
							width * height,
							Math.floor(bytes.byteLength / point_step),
						);

						// Data view over just this field — offsets below are
						// relative to the view, so a non-zero byteOffset into
						// a shared CBOR frame buffer is handled correctly.
						const dataView = new DataView(
							bytes.buffer,
							bytes.byteOffset,
							bytes.byteLength,
						);
						const littleEndian = !is_bigendian;

						const packedPoints = new Float32Array(totalPoints * 3);
						let validPointCount = 0;

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
									packedPoints[idx] = -y;
									packedPoints[idx + 1] = z;
									packedPoints[idx + 2] = -x;
									validPointCount++;
								}
							} catch (e) {
								// Skip points that can't be properly read
								continue;
							}
						}
						const finalPoints = packedPoints.subarray(
							0,
							validPointCount * 3,
						);

						return { points: finalPoints, convention: "THREE" };
					},
				},
				"livox_ros_driver2/msg/CustomMsg": {
					toRos2: (data: PointsCloud) => ({}),
					fromRos2: (data): PointsCloud => {
						const pointsInput = data.points as any[] | undefined;

						// Make sure we have points data
						if (!pointsInput || !Array.isArray(pointsInput)) {
							console.error(
								"Livox point cloud data missing or invalid",
							);
							return {
								points: new Float32Array(0),
								convention: "THREE",
							};
						}

						const numPoints = pointsInput.length;
						const packedPoints = new Float32Array(numPoints * 3);
						const packedColors = new Float32Array(numPoints * 3);
						const intensities = new Float32Array(numPoints);
						let validPointCount = 0;

						// Process each custom point
						for (const point of pointsInput) {
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

						const finalPoints = packedPoints.subarray(
							0,
							validPointCount * 3,
						);
						const finalColors =
							validPointCount > 0 &&
							pointsInput[0]?.reflectivity !== undefined
								? packedColors.subarray(0, validPointCount * 3)
								: undefined;
						const finalIntensities =
							validPointCount > 0 &&
							pointsInput[0]?.reflectivity !== undefined
								? intensities.subarray(0, validPointCount)
								: undefined;

						// Return point cloud with additional metadata if available
						return {
							points: finalPoints,
							colors: finalColors,
							intensities: finalIntensities,
							convention: "THREE",
						};
					},
				},
				"sensor_msgs/msg/LaserScan": {
					toRos2: (data: PointsCloud) => ({}),
					fromRos2: (data): PointsCloud => {
						const ranges = data.ranges as
							| ArrayLike<number>
							| undefined;
						if (!ranges || typeof ranges.length !== "number") {
							console.error("LaserScan message missing ranges");
							return {
								points: new Float32Array(0),
								convention: "THREE",
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
							| ArrayLike<number>
							| undefined;
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
							convention: "THREE",
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

						// Typed-array view under CBOR (zero copy), base64
						// string under plain JSON.
						const rawData =
							toByteArray(data.data) ?? new Uint8Array(0);

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
						// Return compressed data for async conversion to ImageBitmap.
						// Typed-array view under CBOR (zero copy), base64
						// string under plain JSON.
						const rawData =
							toByteArray(data.data) ?? new Uint8Array(0);

						return {
							__compressedData: rawData,
							__format: data.format?.toLowerCase() || "jpeg",
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
		for (const webType in UnifiedConverter.converters) {
			if (
				Object.keys(
					UnifiedConverter.converters[webType]!.conversions,
				).includes(ros2Type)
			) {
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
	static convertToWebapp(
		rosData: any,
		targetWebappType: string,
		originalRos2Type: string,
	): any {
		const entry = UnifiedConverter.converters[targetWebappType];
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
		const entry = UnifiedConverter.converters[webappType];
		if (!entry || !entry.conversions[desiredRos2Type]) {
			throw new Error(
				`No conversion mapping found for webapp type: ${webappType} and desired ros2 type: ${desiredRos2Type}`,
			);
		}
		return entry.conversions[desiredRos2Type].toRos2(webData);
	}

	// ...additional helper methods if needed...
}
