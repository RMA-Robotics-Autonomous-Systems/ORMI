import { Movement } from "@/core/types/movement";

// converts webapp data to ros2 data
const convertionMap = {
    "string": "string",
    "number": "float64",
    "boolean": "bool",
    "Movement": "geometry_msgs/msg/Twist",
    "GeolocationPosition": "sensor_msgs/msg/NavSatFix",
}

export class WebAppToROS2Converter{

    convert(data:any,originType: keyof typeof convertionMap, targetType:string){

        const convertionType = convertionMap[originType];

        if(convertionType !== targetType){
            throw new Error(`Cannot convert ${targetType} to ${convertionType}`);
        }

        switch(originType){
            case "Movement": return this.MovementToTwist(data);
        }

    }

    MovementToTwist(data:Movement){
        return {
            linear: {
                x: data.linear.x,
                y: data.linear.y,
                z: data.linear.z
            },
            angular: {
                x: data.angular.x,
                y: data.angular.y,
                z: data.angular.z
            }
        }
    }


}

export class ROS2ToWebAppConverter{

    convert(data:any,ros_type : string){


        switch(ros_type){
            case "geometry_msgs/msg/Twist": return this.TwistToMovement(data);

            case "sensor_msgs/msg/NavSatFix": return this.FixToGeolocationPosition(data);

            case "sensor_msgs/msg/Imu": return this.Ros2ImuToIMU(data);

            default: return data;
        }


    }

    TwistToMovement(data:any){
        return {
            linear: {
                x: data.linear.x,
                y: data.linear.y,
                z: data.linear.z
            },
            angular: {
                x: data.angular.x,
                y: data.angular.y,
                z: data.angular.z
            }
        }
    }

    FixToGeolocationPosition(data:any) : GeolocationPosition{
        return {
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
                    }
                }
            },
            timestamp: data.header.stamp.sec,
            toJSON: function () {
                return {
                    coords: this.coords.toJSON(),
                    timestamp: this.timestamp
                }
            }
        }
    }

    Ros2ImuToIMU(data:any){
    
        return {
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
        }

    }
}