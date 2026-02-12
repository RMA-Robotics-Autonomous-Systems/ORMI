import { Vector3, Vector4, CoordinateConvention } from "./common";

/** Linear and angular velocity. */
export interface Movement {
	linear: Vector3;
	angular: Vector3;
	/** Coordinate convention the velocities are expressed in */
	convention?: CoordinateConvention;
}

/** Inertial measurement unit data. */
export interface IMU {
	linear_acceleration: Vector3;
	angular_velocity: Vector3;
	orientation: Vector4;
	/** Coordinate convention the IMU data is expressed in */
	convention?: CoordinateConvention;
}
