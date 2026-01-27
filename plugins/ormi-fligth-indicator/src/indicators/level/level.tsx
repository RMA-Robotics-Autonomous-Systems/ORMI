import { useEffect, useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";

import { AttitudeIndicator } from "react-typescript-flight-indicators";
import {
  SelectedTopic,
  useLocalDataSource,
  DatasourceTopic,
  DatasourceTopicFilter,
  LocalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { IMU, Vector3 } from "@workspace/ormi-core/types";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

interface LevelProps {
  title: string;
  topic: SelectedTopic;

  pitchAxis: string; // with axis to show the orientation
  rollAxis: string; // with axis to show the orientation

  invert: boolean;
}

export function WidgetLevelIndicator(props: LevelProps) {
  const { getSource } = useLocalDataSource();
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);

  useEffect(() => {
    const data = getSource(props.topic);
    if (!data) {
      return;
    }

    const value = data.data[0] as IMU;
    if (!value) {
      return;
    }

    let orientation = { x: 0, y: 0, z: 0 } as Vector3;

    // convert the value.orientation to the orientation (quaternion to euler)
    const quaternion = value.orientation;
    const q0 = quaternion.w;
    const q1 = quaternion.x;
    const q2 = quaternion.y;
    const q3 = quaternion.z;

    orientation = {
      x: Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2)),
      y: Math.asin(2 * (q0 * q2 - q3 * q1)),
      z: Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3)),
    };

    if (props.invert) {
      orientation.x = -orientation.x;
      orientation.y = -orientation.y;
      orientation.z = -orientation.z;
    }

    switch (props.pitchAxis) {
      case "X":
        setPitch((orientation.x * 180) / Math.PI);
        break;
      case "Y":
        setPitch((orientation.y * 180) / Math.PI);
        break;
        break;
      case "Z":
        setPitch((orientation.z * 180) / Math.PI);
        break;
        break;
    }

    switch (props.rollAxis) {
      case "X":
        setRoll((orientation.x * 180) / Math.PI);
        break;
      case "Y":
        setRoll((orientation.y * 180) / Math.PI);
        break;
        break;
      case "Z":
        setRoll((orientation.z * 180) / Math.PI);
        break;
        break;
    }
  }, [getSource, props.topic, props.pitchAxis, props.rollAxis, props.invert]);

  return (
    <div
      className="flex justify-center items-center"
      style={{ padding: "1rem", height: "100%" }}
    >
      <AttitudeIndicator
        size={"100%"}
        pitch={pitch}
        roll={roll}
        showBox={false}
      />
    </div>
  );
}

const LevelIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="22" y1="12" x2="20" y2="12" />
      <line x1="4" y1="12" x2="2" y2="12" />
      <line x1="6" y1="6" x2="8" y2="8" />
      <line x1="16" y1="16" x2="18" y2="18" />
      <path d="M12 12 L16 10 L16 14 Z" />
    </svg>
  );
};

export function LevelDefinition() {
  const pluginsManager = usePluginsManager();

  return {
    id: "level-widget",
    name: "Level Indicator",
    description: "Level Indicator",
    titleProp: "title",
    icon: <LevelIcon />,
    schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          title: "Title",
        },
        topic: {
          type: "object",
          title: "Topic",
        },
        pitchAxis: {
          type: "string",
          title: "Orientation Axis",
          enum: ["X", "Y", "Z"],
          default: "Z",
        },
        rollAxis: {
          type: "string",
          title: "Roll Axis",
          enum: ["X", "Y", "Z"],
          default: "Z",
        },
        invert: {
          type: "boolean",
          title: "Invert",
          default: false,
        },
      },
      required: ["title", "topic"],
    },
    uischema: {
      type: "VerticalLayout",
      elements: [
        {
          type: "Control",
          scope: "#/properties/title",
        } as ControlElement,
        {
          type: "TopicSelect",
          scope: "#/properties/topic",
          options: {
            dataRequirements: {
              accepts: ["IMU"], // Accept both webapp type and raw type patterns
            },
          },
        } as TopicSelectElement,
        {
          type: "Control",
          scope: "#/properties/pitchAxis",
        } as ControlElement,
        {
          type: "Control",
          scope: "#/properties/rollAxis",
        } as ControlElement,

        {
          type: "Control",
          scope: "#/properties/invert",
        } as ControlElement,
      ],
    } as VerticalLayout,
    data: {
      title: "Level Indicator",
    },
    Component: (data: LevelProps) => (
      <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
        <WidgetLevelIndicator {...data} />
      </LocalDataSourcesProvider>
    ),
  };
}
