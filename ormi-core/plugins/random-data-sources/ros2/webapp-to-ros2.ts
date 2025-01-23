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

    FixToGeolocationPosition(data:any){
        return {
            latitude: data.latitude,
            longitude: data.longitude,
            altitude: data.altitude
        }
    }
}