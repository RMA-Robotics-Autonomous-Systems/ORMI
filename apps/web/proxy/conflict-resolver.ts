import { OfflineDatabase } from "./database";
import { WorkspaceData, TemplateData } from "./types";

/**
 * Conflict Resolver
 * Implements last-write-wins strategy for conflict resolution
 */
export class ConflictResolver {
  private db: OfflineDatabase;

  constructor(database: OfflineDatabase) {
    this.db = database;
  }

  /**
   * Resolve workspace conflict using last-write-wins
   */
  async resolveWorkspaceConflict(localWorkspace: WorkspaceData): Promise<void> {
    console.log(`🔄 Resolving workspace conflict for ID: ${localWorkspace.id}`);

    try {
      // Get the current server version
      const response = await fetch(`/api/workspaces/${localWorkspace.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          // Workspace doesn't exist on server, create it
          await this.createWorkspaceOnServer(localWorkspace);
          return;
        }
        throw new Error(`Server responded with ${response.status}`);
      }

      const serverWorkspace = await response.json();

      // Compare timestamps - last write wins
      const localTimestamp = new Date(localWorkspace.updatedAT).getTime();
      const serverTimestamp = new Date(serverWorkspace.updatedAT).getTime();

      if (localTimestamp > serverTimestamp) {
        console.log("📤 Local workspace is newer, pushing to server");
        await this.pushWorkspaceToServer(localWorkspace);
      } else {
        console.log("📥 Server workspace is newer, updating local copy");
        await this.pullWorkspaceFromServer(serverWorkspace);
      }
    } catch (error) {
      console.error("❌ Failed to resolve workspace conflict:", error);
      throw error;
    }
  }

  /**
   * Resolve template conflict using last-write-wins
   */
  async resolveTemplateConflict(localTemplate: TemplateData): Promise<void> {
    console.log(`🔄 Resolving template conflict for ID: ${localTemplate.id}`);

    try {
      // Get the current server version
      const response = await fetch(`/api/templates/${localTemplate.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          // Template doesn't exist on server, create it
          await this.createTemplateOnServer(localTemplate);
          return;
        }
        throw new Error(`Server responded with ${response.status}`);
      }

      const serverTemplate = await response.json();

      // For templates from the API, we need to convert format
      const serverTemplateData = this.convertApiTemplateToLocal(
        serverTemplate,
        localTemplate.createdById
      );

      // Compare timestamps - last write wins
      const localTimestamp = new Date(localTemplate.updatedAT).getTime();
      const serverTimestamp = new Date(serverTemplateData.updatedAT).getTime();

      if (localTimestamp > serverTimestamp) {
        console.log("📤 Local template is newer, pushing to server");
        await this.pushTemplateToServer(localTemplate);
      } else {
        console.log("📥 Server template is newer, updating local copy");
        await this.pullTemplateFromServer(serverTemplateData);
      }
    } catch (error) {
      console.error("❌ Failed to resolve template conflict:", error);
      throw error;
    }
  }

  /**
   * Create workspace on server
   */
  private async createWorkspaceOnServer(
    workspace: WorkspaceData
  ): Promise<void> {
    console.log("📤 Creating workspace on server");

    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: workspace.name,
        userId: workspace.createdById,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create workspace on server: ${response.status}`
      );
    }

    const serverWorkspace = await response.json();

    // Update local workspace with server ID and mark as synced
    await this.db.deleteWorkspace(workspace.id);
    await this.db.saveWorkspace({
      ...workspace,
      id: serverWorkspace.id,
      _synced: true,
    });
  }

  /**
   * Push workspace to server
   */
  private async pushWorkspaceToServer(workspace: WorkspaceData): Promise<void> {
    console.log("📤 Pushing workspace to server");

    const response = await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: workspace.name,
        content: workspace.content,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to update workspace on server: ${response.status}`
      );
    }

    // Mark as synced
    workspace._synced = true;
    await this.db.saveWorkspace(workspace);
  }

  /**
   * Pull workspace from server
   */
  private async pullWorkspaceFromServer(
    serverWorkspace: WorkspaceData
  ): Promise<void> {
    console.log("📥 Pulling workspace from server");

    const workspaceData: WorkspaceData = {
      ...serverWorkspace,
      _lastModified: Date.now(),
      _synced: true,
    };

    await this.db.saveWorkspace(workspaceData);
  }

  /**
   * Create template on server
   */
  private async createTemplateOnServer(template: TemplateData): Promise<void> {
    console.log("📤 Creating template on server");

    const templateContent = {
      name: template.name,
      type: template.type,
      public: template.public,
      tags: template.tags,
      yours: true,
      ...(template.type === "widget" ? { widget: template.content } : {}),
      ...(template.type === "datasource"
        ? { datasource: template.content }
        : {}),
    };

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: templateContent,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create template on server: ${response.status}`
      );
    }

    const serverTemplateId = await response.json();
    const serverId = parseInt(serverTemplateId);

    // Update local template with server ID and mark as synced
    await this.db.deleteTemplate(template.id);
    await this.db.saveTemplate({
      ...template,
      id: serverId,
      _synced: true,
    });
  }

  /**
   * Push template to server
   */
  private async pushTemplateToServer(template: TemplateData): Promise<void> {
    console.log("📤 Pushing template to server");

    const updateData = {
      name: template.name,
      public: template.public,
      tags: template.tags,
      type: template.type,
      ...(template.type === "widget" ? { widget: template.content } : {}),
      ...(template.type === "datasource"
        ? { datasource: template.content }
        : {}),
    };

    const response = await fetch(`/api/templates/${template.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to update template on server: ${response.status}`
      );
    }

    // Mark as synced
    template._synced = true;
    await this.db.saveTemplate(template);
  }

  /**
   * Pull template from server
   */
  private async pullTemplateFromServer(
    serverTemplate: TemplateData
  ): Promise<void> {
    console.log("📥 Pulling template from server");

    const templateData: TemplateData = {
      ...serverTemplate,
      _lastModified: Date.now(),
      _synced: true,
    };

    await this.db.saveTemplate(templateData);
  }

  /**
   * Convert API template format to local storage format
   */
  private convertApiTemplateToLocal(
    apiTemplate: Record<string, unknown>,
    createdById: string
  ): TemplateData {
    return {
      id: parseInt(apiTemplate.id as string) || 0,
      name: (apiTemplate.name as string) || "",
      content:
        (apiTemplate as any).widget || (apiTemplate as any).datasource || {},
      type: (apiTemplate.type as string) || "widget",
      public: (apiTemplate.public as boolean) || false,
      tags: (apiTemplate.tags as string[]) || [],
      createdAT: new Date().toISOString(),
      updatedAT: new Date().toISOString(),
      createdById,
      yours: (apiTemplate.yours as boolean) || false,
      _lastModified: Date.now(),
      _synced: true,
    };
  }

  /**
   * Batch resolve conflicts for multiple items
   */
  async batchResolveWorkspaceConflicts(
    workspaces: WorkspaceData[]
  ): Promise<void> {
    console.log(`🔄 Batch resolving ${workspaces.length} workspace conflicts`);

    const promises = workspaces.map((workspace) =>
      this.resolveWorkspaceConflict(workspace).catch((error) => {
        console.error(`Failed to resolve workspace ${workspace.id}:`, error);
        return null; // Continue with other workspaces
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Batch resolve conflicts for multiple templates
   */
  async batchResolveTemplateConflicts(
    templates: TemplateData[]
  ): Promise<void> {
    console.log(`🔄 Batch resolving ${templates.length} template conflicts`);

    const promises = templates.map((template) =>
      this.resolveTemplateConflict(template).catch((error) => {
        console.error(`Failed to resolve template ${template.id}:`, error);
        return null; // Continue with other templates
      })
    );

    await Promise.allSettled(promises);
  }
}
