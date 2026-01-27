"use client";

import { RandomDataSourceProvider } from "./random-data-source";

import { RandomDataSourceSettings } from ".";
import { DatasourceDefinition } from "@workspace/ormi-core/datasources";

const dataSourceExport = (datasources: DatasourceDefinition<any>[]) => {
  datasources.push({
    id: "random-data-source",
    name: "Random Data Source",
    description: "Random data source",

    schema: {
      title: "Random Data Source",
      type: "object",
      properties: {
        title: { type: "string", title: "Title" },
        enable: { type: "boolean", title: "Enable" },

        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              topic: {
                type: "string",
                title: "Topic",
              },
              frequency: {
                type: "number",
                title: "Frequency",
              },
              type: {
                type: "string",
                title: "Type",
                enum: [
                  "GeolocationPosition",
                  "IMU",
                  "number",
                  "Movement",
                  "boolean",
                  "PointsCloud",
                ],
              },
            },
            required: ["topic", "frequency"],
          },
        },
      },
    },

    data: {
      id: "",
      title: "",
      enable: true,
      topics: [],
    },

    Provider: ({ children, props }) =>
      RandomDataSourceProvider(children, props),
  } as DatasourceDefinition<RandomDataSourceSettings>);

  return datasources;
};

export default dataSourceExport;
