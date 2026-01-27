import {
  DatasourceTopicFilter,
  SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { JSX } from "react";
import TeodorEmiMap from "./teodor-emi-map";

export const addMapTypeArray = (array: string[]) => {
  array.push("TeodorEMI");
  return array;
};

export const addTopicTypeFilter = (topicFilter: DatasourceTopicFilter) => {
  // add the "emi_msgs/msg/EMI" as a possible type for the map topics
  // change the regex to include the "emi_msgs/msg/EMI" type
  // if the rawType is not defined, use the "emi_msgs/msg/EMI" type       // emi_msgs/msg/EMIGnss
  // if defined, use the rawType
  if (!topicFilter.rawType) {
    topicFilter.rawType = new RegExp("emi_msgs/msg/EMI");
  } else {
    topicFilter.rawType = new RegExp(
      `(${topicFilter.rawType.source}|emi_msgs/msg/EMIGnss)`,
    );
  }

  topicFilter.strict = false; // allow partial matches

  return topicFilter;
};

interface MapTopic {
  name: string;
  topic: SelectedTopic;
  makerType: "simple" | "heatmap" | "path" | "multipoints" | any;
  numericalTopic?: SelectedTopic;
}

export const mapMarkerComponent = (
  current_component: JSX.Element,
  t: MapTopic,
) => {
  if (t.makerType !== "TeodorEMI") {
    return current_component;
  }

  return (
    <TeodorEmiMap
      key={t.name}
      topic={t.topic}
      name={t.name}
      scale={1}
      useRaw2={false}
    />
  );
};
