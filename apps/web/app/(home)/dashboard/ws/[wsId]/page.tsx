"use client";

import { useEffect, useState } from "react";
import {
  DashboardInterface,
  DashboardProvider,
  dashboardRegistry,
} from "@workspace/ormi-core/dashboard";
import {
  Datasource,
  GlobalDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import { Widget, WidgetsDialog } from "@workspace/ormi-core/widgets";
import { TemplatesProvider } from "@workspace/ormi-core/templates";
import {
  handleLoad as tl,
  handleSave as ts,
  handleDelete as td,
  handleUpdate as tu,
} from "@/server/prisma-templates";
import { handleLoad, handleSave } from "@/server/prisma-dashboard";
export default function Page() {
  const [dashboardType, setDashboardType] = useState<string>("GRID");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWorkspaceType() {
      const url = new URL(window.location.href);
      const workspaceId = url.pathname.split("/")[3];
      if (!workspaceId) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}`);
        if (response.ok) {
          const workspace = await response.json();
          setDashboardType(workspace?.dashboardType || "GRID");
        }
      } catch (e) {
        setDashboardType("GRID");
      } finally {
        setLoading(false);
      }
    }
    fetchWorkspaceType();
  }, []);

  const dashboardDefinition: DashboardInterface = {
    layouts: {},
    widgets: new Map<string, Widget>(),
    datasources: new Map<string, Datasource>(),
    locked: false,
  };

  const DashboardComponent =
    dashboardRegistry[dashboardType as keyof typeof dashboardRegistry];

  if (loading) return <div>Loading workspace...</div>;

  return (
    <DashboardProvider
      dashboardType={dashboardType}
      dashboardDefinition={dashboardDefinition}
      OnLoad={handleLoad}
      OnSave={handleSave}
    >
      <TemplatesProvider
        onLoad={tl}
        addTemplate={ts}
        removeTemplate={td}
        updateTemplate={tu}
      >
        <GlobalDataSourcesProvider>
          <DashboardComponent />
          <WidgetsDialog />
        </GlobalDataSourcesProvider>
      </TemplatesProvider>
    </DashboardProvider>
  );
}
