"use client";
import React, { JSX, useEffect, useRef, useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import ROSLIB from "roslib";
import * as d3 from "d3";
import { useTheme } from "next-themes";
import { Datasource } from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

interface RQTGraphProps {
  title: string;
  datasource_id: string;
  poolingRateHz: number;
  ignoreRosout: boolean;
  ignoreParameterEvent: boolean;
}

function RQTGraph(props: RQTGraphProps): JSX.Element {
  const pluginsManager = usePluginsManager();

  const { resolvedTheme } = useTheme();

  const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);
  const [rosNodes, setRosNodes] = useState<
    Map<
      string,
      { subscriptions: string[]; publications: string[]; services: string[] }
    >
  >(new Map());
  const divRef = useRef<HTMLDivElement>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setInterval> | null>(
    null,
  );
  const graphRef = useRef<any>(null);
  const graphDataRef = useRef<{ nodes: any[]; links: any[] }>({
    nodes: [],
    links: [],
  });

  // Establish ROSLIB connection
  useEffect(() => {
    const to = setTimeout(() => {
      setRoslib(
        pluginsManager.applyFilter(
          `${props.datasource_id}-ros-2-connection`,
          null,
        ),
      );
    }, 500);

    return () => {
      clearTimeout(to);
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [pluginsManager, props, timer]);

  // Set up periodic updates based on poolingRateHz
  useEffect(() => {
    if (!roslib) {
      return;
    }

    // Initial data fetch
    fetchNodeData();

    // Set up interval for periodic updates
    const refreshTimer = setInterval(() => {
      fetchNodeData();
    }, 1000 / props.poolingRateHz);

    setTimer(refreshTimer);

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };

    function fetchNodeData() {
      roslib!.getNodes((nodes: string[]) => {
        // Create a fresh map for the new state
        const newNodeMap = new Map<
          string,
          {
            subscriptions: string[];
            publications: string[];
            services: string[];
          }
        >();

        // Keep track of processed nodes to update state only once after all nodes are processed
        let processedCount = 0;

        nodes.forEach((node) => {
          (roslib as any)!.getNodeDetails(
            node,
            (result: {
              subscribing: string[];
              publishing: string[];
              services: string[];
            }) => {
              newNodeMap.set(node, {
                subscriptions: result.subscribing,
                publications: result.publishing,
                services: result.services,
              });

              processedCount++;
              if (processedCount === nodes.length) {
                // Update state with the complete new map when all nodes are processed
                setRosNodes(newNodeMap);
              }
            },
          );
        });

        // If no nodes are present, we still need to update with an empty map
        if (nodes.length === 0) {
          setRosNodes(newNodeMap);
        }
      });
    }
  }, [roslib, props.poolingRateHz]);

  // Initialize the graph once
  useEffect(() => {
    if (divRef.current && !graphRef.current) {
      (async () => {
        const { default: ForceGraph } = await import("force-graph");

        const arrowColor = resolvedTheme === "light" ? "#333" : "#ccc";
        const lineColor = resolvedTheme === "light" ? "#333" : "#ccc";

        graphRef.current = new ForceGraph(divRef.current!)
          .linkColor(() => arrowColor)
          .linkDirectionalArrowLength(2)
          .linkDirectionalArrowRelPos(1)
          // .linkDirectionalParticles(2)
          .linkCanvasObjectMode(() => "after")
          // Add center-gravity force to keep disconnected nodes from drifting too far apart
          .d3Force("center", d3.forceCenter())
          // Adjust charge force (repulsion) to be less aggressive
          .d3Force("charge", d3.forceManyBody().strength(-30))
          // Add a boundary force to keep nodes within a reasonable area
          .d3Force("x", d3.forceX().strength(0.05))
          .d3Force("y", d3.forceY().strength(0.05))
          .linkCanvasObject((link: any, ctx, globalScale) => {
            const { source, target, value } = link;
            const x = (source.x + target.x) / 2;
            const y = (source.y + target.y) / 2;
            ctx.font = `${10 / globalScale}px Sans-Serif`;
            ctx.fillStyle = arrowColor;
            ctx.strokeStyle = arrowColor;
            ctx.textAlign = "center";
            ctx.fillText(value, x, y);
          })
          .nodeCanvasObject((node: any, ctx, globalScale) => {
            const r = 5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
            ctx.fillStyle = "#1f77b4";
            ctx.fill();
            ctx.font = `${12 / globalScale}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = lineColor;
            ctx.fillText(node.id, node.x, node.y - r - 2);
          });

        // Initial zoom to fit
        setTimeout(() => {
          if (graphRef.current) {
            graphRef.current.zoomToFit(400);
          }
        }, 1000);
      })();
    }

    return () => {
      if (graphRef.current) {
        graphRef.current._destructor();
        graphRef.current = null;
      }
    };
  }, [divRef.current, resolvedTheme]);

  // Update only graph data when nodes change
  useEffect(() => {
    if (!graphRef.current) {
      return;
    }

    // Get current data with positions
    const currentData = graphRef.current.graphData();
    const existingNodesMap = new Map<string, any>(
      currentData.nodes.map((node: any) => [node.id, node]),
    );

    // Prepare new data while preserving positions
    const nodes: any[] = [];
    const links: { source: string; target: string; value: any }[] = [];

    // First add nodes - only include nodes that exist in rosNodes
    rosNodes.forEach((details, nodeName) => {
      // If the node already exists, keep its position
      if (existingNodesMap.has(nodeName)) {
        const existingNode = existingNodesMap.get(nodeName);
        nodes.push({
          id: nodeName,
          x: existingNode.x,
          y: existingNode.y,
          vx: existingNode.vx * 0.9, // Dampen velocity for smoother transitions
          vy: existingNode.vy * 0.9,
        });
      } else {
        // For new nodes
        nodes.push({ id: nodeName });
      }
    });

    // Then add links - rebuild all links from current rosNodes data
    if (nodes.length > 0) {
      rosNodes.forEach((pubDetails, pubName) => {
        const publications: string[] = pubDetails.publications || [];
        publications.forEach((topic) => {
          if (props.ignoreRosout && topic === "/rosout") return;
          if (props.ignoreParameterEvent && topic === "/parameter_events")
            return;
          rosNodes.forEach((subDetails, subName) => {
            if (
              pubName !== subName &&
              (subDetails.subscriptions || []).includes(topic)
            ) {
              links.push({ source: pubName, target: subName, value: topic });
            }
          });
        });
      });
    }

    // Store for comparison in next update
    graphDataRef.current = { nodes, links };

    // Always update the graph data to ensure removed nodes are cleared
    graphRef.current.graphData({ nodes, links });

    // Apply gentle reheat if not already cooling down
    const wasCoolingDown = graphRef.current.cooldownTicks() > 0;
    if (!wasCoolingDown) {
      graphRef.current.cooldownTicks(20).cooldownTime(1000);
    }
  }, [rosNodes, props.ignoreRosout, props.ignoreParameterEvent]);

  // Manual refresh behavior - do a more significant reheat
  useEffect(() => {
    if (!graphRef.current) return;

    // When manually refreshed, apply more significant reheat
    graphRef.current.cooldownTicks(50).cooldownTime(2000);
  }, []);

  // Update styling when theme changes
  useEffect(() => {
    if (!graphRef.current) return;

    const arrowColor = resolvedTheme === "light" ? "#333" : "#ccc";
    const lineColor = resolvedTheme === "light" ? "#333" : "#ccc";

    graphRef.current
      .linkColor(() => arrowColor)
      .linkCanvasObject(
        (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const { source, target, value } = link;
          const x = (source.x + target.x) / 2;
          const y = (source.y + target.y) / 2;
          ctx.font = `${10 / globalScale}px Sans-Serif`;
          ctx.fillStyle = arrowColor;
          ctx.strokeStyle = arrowColor;
          ctx.textAlign = "center";
          ctx.fillText(value, x, y);
        },
      )
      .nodeCanvasObject(
        (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const r = 5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fillStyle = "#1f77b4";
          ctx.fill();
          ctx.font = `${12 / globalScale}px Sans-Serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = lineColor;
          ctx.fillText(node.id, node.x, node.y - r - 2);
        },
      );
  }, [resolvedTheme]);

  return (
    <div
      ref={divRef}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    >
      {/* ...existing code if any... */}
    </div>
  );
}

export function RQTGraphDefinition(): WidgetDefinition {
  const pluginsManager = usePluginsManager();

  return {
    id: "rqt-graph",
    name: "RQT Graph",
    description: "Equivalent to the ROS2 RQT Graph tool",
    titleProp: "title",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="12" cy="19" r="2" />
        <line x1="5" y1="5" x2="12" y2="19" />
        <line x1="19" y1="5" x2="12" y2="19" />
        <line x1="5" y1="5" x2="19" y2="5" />
      </svg>
    ),
    schema: {
      type: "object",
      properties: {
        title: { type: "string", title: "Title" },
        datasource_id: { type: "string", title: "Datasources" },
        poolingRateHz: { type: "number", title: "Pooling rate (Hz)" },
        ignoreRosout: { type: "boolean", title: "Ignore rosout" },
        ignoreParameterEvent: {
          type: "boolean",
          title: "Ignore parameter event",
        },
      },
      required: ["title"],
    },
    uischema: {
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/title" } as ControlElement,
        {
          type: "Control",
          scope: "#/properties/datasource_id",
          options: {
            async: true,
            asyncFunction: async () => {
              const datasources = Array.from(
                pluginsManager.applyFilter<Datasource[]>(
                  PluginsHooks.AVAILABLE_DATASOURCES,
                  [],
                ),
              ).filter((ds) => ds.datasource_id === "rosbridge-suite-source");

              const values = Array.from(datasources).map((ds) => ({
                value: ds.settings.id,
                label: ds.settings.title,
              }));

              return values;
            },
          },
        } as ControlElement,
        {
          type: "Control",
          scope: "#/properties/poolingRateHz",
        } as ControlElement,
        {
          type: "Control",
          scope: "#/properties/ignoreRosout",
        } as ControlElement,
        {
          type: "Control",
          scope: "#/properties/ignoreParameterEvent",
        } as ControlElement,
      ],
    } as VerticalLayout,
    data: { title: "RQT Graph", poolingRateHz: 5 },
    Component: (data: RQTGraphProps) => <RQTGraph {...data} />,
  };
}
