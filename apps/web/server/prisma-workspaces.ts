"use client"

interface Workspace {
    id: number;
    name: string;
    createdAT: Date;
    updatedAT?: Date;
}

const handleCreate = async (title: string, userId: string): Promise<Workspace | null> => {
    try {
        const response = await fetch(`/api/workspaces`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title, userId }),
        });

        if (!response.ok) {
            throw new Error(`Error creating workspace: ${response.statusText}`);
        }
        
        const workspace = await response.json() as Workspace;
        return workspace;
    } catch (error) {
        console.error("Failed to create workspace:", error);
        return null;
    }
};

const handleDelete = async (workspaceId: number): Promise<boolean> => {
    try {
        const response = await fetch(`/api/workspaces/${workspaceId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Error deleting workspace: ${response.statusText}`);
        }

        return true;
    } catch (error) {
        console.error("Failed to delete workspace:", error);
        return false;
    }
};

const handleLoad = async (): Promise<Workspace[]> => {
    try {
        const response = await fetch(`/api/workspaces`);
        
        if (!response.ok) {
            throw new Error(`Error loading workspaces: ${response.statusText}`);
        }
        
        const workspaces = await response.json() as Workspace[];
        return workspaces;
        
    } catch (error) {
        console.error("Failed to load workspaces:", error);
        return [];
    }
};

const handleUpdate = async (workspaceId: number, name: string): Promise<boolean> => {
    try {
        const response = await fetch(`/api/workspaces/${workspaceId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            console.error('Failed to update workspace:', response.statusText);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error updating workspace:', error);
        return false;
    }
};

export { handleCreate, handleDelete, handleLoad, handleUpdate };
export type { Workspace };
