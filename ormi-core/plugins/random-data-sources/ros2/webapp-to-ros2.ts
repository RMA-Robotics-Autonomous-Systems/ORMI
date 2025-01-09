import { Movement } from "@/core/types/movement";

// converts webapp data to ros2 data
const convertionMap = {
    "string": "string",
    "number": "float64",
    "boolean": "bool",
    "Movement": "geometry_msgs/Twist",       
}

export class WebAppToROS2Converter{

    convert(data:any,originType: keyof typeof convertionMap, targetType:string){

        const convertionType = convertionMap[originType];

        if(convertionType !== targetType){
            throw new Error(`Cannot convert ${targetType} to ${convertionType}`);
        }

        switch(targetType){
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