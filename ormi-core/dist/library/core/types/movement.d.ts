import { Vector3, Vector4 } from "./common";
export interface Movement {
    linear: Vector3;
    angular: Vector3;
}
export interface IMU {
    linear_acceleration: Vector3;
    angular_velocity: Vector3;
    orientation: Vector4;
}
