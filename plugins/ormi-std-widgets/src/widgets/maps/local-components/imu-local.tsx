import { LocalTopic } from "../local-topic-visualizer-types";

export interface IMULocalTopic extends LocalTopic {
    imuFrame: "ENU" | "NED" | "NWU";
    headingAxis: "X" | "Y" | "Z";
}