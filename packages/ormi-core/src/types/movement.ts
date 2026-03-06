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

/** A single time-stamped joint command point. */
export interface JointTrajectoryPoint {
	positions: number[];
	velocities?: number[];
	accelerations?: number[];
	effort?: number[];
	time_from_start: { sec: number; nanosec: number };
}

/**
 * Joint trajectory command (trajectory_msgs/msg/JointTrajectory).
 * Sent to position-based controllers and MoveIt motion planners.
 */
export interface JointTrajectory {
	joint_names: string[];
	points: JointTrajectoryPoint[];
}

/**
 * Joint jog command (control_msgs/msg/JointJog).
 * Sent to velocity/servo controllers (e.g. MoveIt Servo, ros2_control) for incremental joint control.
 */
export interface JointJog {
	joint_names: string[];
	/** Incremental angular displacement per joint (radians). */
	displacements: number[];
	/** Incremental velocity per joint (rad/s). */
	velocities: number[];
	/** Duration over which the displacement is applied (seconds). */
	duration: number;
}

/**
 * Joint state feedback (sensor_msgs/msg/JointState).
 * Received from the robot to reflect current joint positions.
 */
export interface JointState {
	name: string[];
	position: number[];
	velocity?: number[];
	effort?: number[];
}
