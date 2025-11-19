---
title: "Templates API"
description: API for saving and loading widget/datasource configurations
order: 6
---

# Templates API

## Overview

The Templates API provides functions for managing reusable widget and datasource configurations. Templates allow users to save configurations and reuse them across dashboards.

**Use templates for:**

- Saving widget configurations with custom settings
- Creating datasource presets
- Sharing common configurations across projects
- Building template libraries

For architectural details on template storage and atoms, see **[Core - Architecture](../core/architecture)**.

## Template Structure

### `widgetTemplatesAtom`

Stores all widget templates with automatic localStorage persistence.

```typescript
import { atomWithStorage } from "jotai/utils";

export const widgetTemplatesAtom = atomWithStorage<WidgetTemplate[]>(
    "widget-templates",
    []
);

interface WidgetTemplate {
    id: string;
    name: string;
    description?: string;
    widgetType: string; // Widget definition ID
    config: unknown; // Widget configuration
    tags: string[];
    isPublic: boolean; // For future sharing
    createdAt: number;
    updatedAt: number;
}
```

### `datasourceTemplatesAtom`

Stores datasource templates.

```typescript
export const datasourceTemplatesAtom = atomWithStorage<DatasourceTemplate[]>(
    "datasource-templates",
    []
);

interface DatasourceTemplate {
    id: string;
    name: string;
    description?: string;
    datasourceType: string; // 'rosbridge', 'rest', etc.
    config: unknown; // Type-specific config
    tags: string[];
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
}
```

## Template Management API

### Widget Templates

```typescript
import { useAtom } from "jotai";
import { widgetTemplatesAtom } from "@/atoms/templates";

const [templates, setTemplates] = useAtom(widgetTemplatesAtom);

// Add template
const newTemplate: WidgetTemplate = {
    ...template,
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
};
setTemplates((prev) => [...prev, newTemplate]);

// Update template
setTemplates((prev) =>
    prev.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
    )
);

// Delete template
setTemplates((prev) => prev.filter((t) => t.id !== id));

// Filter by widget type
const filtered = templates.filter((t) => t.widgetType === widgetType);
```

### Datasource Templates

```typescript
import { useAtom } from "jotai";
import { datasourceTemplatesAtom } from "@/atoms/templates";

const [templates, setTemplates] = useAtom(datasourceTemplatesAtom);

// Same CRUD operations as widget templates
```

## Usage Examples

### Save Widget as Template

```typescript
import { useAtom } from 'jotai';
import { widgetTemplatesAtom } from '@/atoms/templates';

export function WidgetCard({ widget }) {
  const [templates, setTemplates] = useAtom(widgetTemplatesAtom);

  const saveAsTemplate = () => {
    const newTemplate: WidgetTemplate = {
      id: generateId(),
      name: `My ${widget.definition.name}`,
      widgetType: widget.definition.id,
      config: widget.config,
      tags: ['custom'],
      isPublic: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setTemplates(prev => [...prev, newTemplate]);
  };

  return <Button onClick={saveAsTemplate}>Save as Template</Button>;
}
```

### Load Template

```typescript
export function TemplateSelector({ widgetType, onApply }) {
  const templates = useAtomValue(widgetTemplatesAtom);

  const available = templates.filter(t => t.widgetType === widgetType);

  return (
    <Select onValueChange={(id) => {
      const template = templates.find(t => t.id === id);
      if (template) onApply(template.config);
    }}>
      {available.map(t => (
        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
      ))}
    </Select>
  );
}
```

### Filter by Tags

```typescript
export function TemplateList({ widgetType, selectedTags }) {
  const templates = useAtomValue(widgetTemplatesAtom);

  const filtered = templates
    .filter(t => t.widgetType === widgetType)
    .filter(t =>
      selectedTags.length === 0 ||
      selectedTags.some(tag => t.tags.includes(tag))
    );

  return (
    <div>
      {filtered.map(template => (
        <TemplateCard key={template.id} template={template} />
      ))}
    </div>
  );
}
```

### Import/Export Templates

```typescript
export function TemplateIO() {
  const [widgetTemplates, setWidgetTemplates] = useAtom(widgetTemplatesAtom);
  const [datasourceTemplates, setDatasourceTemplates] = useAtom(datasourceTemplatesAtom);

  // Export
  const exportAll = () => {
    const data = {
      version: "2.0",
      widgets: widgetTemplates,
      datasources: datasourceTemplates,
      exportedAt: Date.now()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, `templates-${Date.now()}.json`);
  };

  // Import
  const importTemplates = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);

    // Merge templates (regenerate IDs to avoid conflicts)
    const newWidgets = data.widgets.map(t => ({
      ...t,
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));

    setWidgetTemplates(prev => [...prev, ...newWidgets]);
  };

  return (
    <>
      <Button onClick={exportAll}>Export Templates</Button>
      <Input type="file" onChange={(e) => importTemplates(e.target.files[0])} />
    </>
  );
}
```

## Widget Config Integration

Integrate templates into widget config dialogs:

```typescript
export function WidgetConfigDialog({
  widget
}: {
  widget: WidgetInstance
}) {
  const { templates } = useWidgetTemplates();
  const [config, setConfig] = useState(widget.config);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSave, setShowSave] = useState(false);

  const availableTemplates = templates.filter(
    t => t.widgetType === widget.definition.id
  );

  const applyTemplate = (templateConfig: unknown) => {
    setConfig(templateConfig);
    setShowTemplates(false);
  };

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Widget</DialogTitle>
          <div className="flex gap-2">
            {availableTemplates.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTemplates(true)}
              >
                Load Template ({availableTemplates.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSave(true)}
            >
              Save as Template
            </Button>
          </div>
        </DialogHeader>

        {/* JSON Forms configuration */}
        <JsonForms
          schema={widget.definition.schema}
          uischema={widget.definition.uischema}
          data={config}
          onChange={({ data }) => setConfig(data)}
        />

        <DialogFooter>
          <Button onClick={() => saveConfig(config)}>Save</Button>
        </DialogFooter>
      </DialogContent>

      {/* Template drawer */}
      {showTemplates && (
        <WidgetTemplateDrawer
          widgetType={widget.definition.id}
          onApply={applyTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* Save template dialog */}
      {showSave && (
        <SaveTemplateDialog
          widgetType={widget.definition.id}
          config={config}
          onClose={() => setShowSave(false)}
        />
      )}
    </Dialog>
  );
}
```

## Template Import/Export

Export templates to JSON for sharing:

```typescript
export function useTemplateIO() {
    const { templates: widgetTemplates } = useWidgetTemplates();
    const { templates: datasourceTemplates } = useDatasourceTemplates();

    return {
        // Export all templates
        exportAll() {
            const data = {
                version: "2.0",
                widgets: widgetTemplates,
                datasources: datasourceTemplates,
                exportedAt: Date.now(),
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ormi-templates-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },

        // Export specific templates
        exportTemplates(templateIds: string[]) {
            const widgets = widgetTemplates.filter((t) =>
                templateIds.includes(t.id)
            );
            const datasources = datasourceTemplates.filter((t) =>
                templateIds.includes(t.id)
            );

            const data = {
                version: "2.0",
                widgets,
                datasources,
                exportedAt: Date.now(),
            };

            // ... same download logic
        },

        // Import templates
        async importTemplates(file: File) {
            const text = await file.text();
            const data = JSON.parse(text);

            if (data.version !== "2.0") {
                throw new Error("Unsupported template version");
            }

            // Merge with existing templates (avoiding ID conflicts)
            const { addTemplate: addWidget } = useWidgetTemplates();
            const { addTemplate: addDatasource } = useDatasourceTemplates();

            data.widgets.forEach((template: WidgetTemplate) => {
                const { id, createdAt, updatedAt, ...rest } = template;
                addWidget(rest);
            });

            data.datasources.forEach((template: DatasourceTemplate) => {
                const { id, createdAt, updatedAt, ...rest } = template;
                addDatasource(rest);
            });
        },
    };
}
```

## Template Search & Filtering

Advanced template search and filtering:

```typescript
export function useTemplateSearch() {
    const { templates } = useWidgetTemplates();

    return {
        // Full-text search
        search(query: string): WidgetTemplate[] {
            const lower = query.toLowerCase();
            return templates.filter(
                (t) =>
                    t.name.toLowerCase().includes(lower) ||
                    t.description?.toLowerCase().includes(lower) ||
                    t.tags.some((tag) => tag.toLowerCase().includes(lower))
            );
        },

        // Filter by tags (OR logic)
        filterByTags(tags: string[]): WidgetTemplate[] {
            if (tags.length === 0) return templates;
            return templates.filter((t) =>
                tags.some((tag) => t.tags.includes(tag))
            );
        },

        // Filter by widget type
        filterByType(widgetType: string): WidgetTemplate[] {
            return templates.filter((t) => t.widgetType === widgetType);
        },

        // Sort templates
        sort(
            templates: WidgetTemplate[],
            by: "name" | "created" | "updated"
        ): WidgetTemplate[] {
            return [...templates].sort((a, b) => {
                if (by === "name") return a.name.localeCompare(b.name);
                if (by === "created") return b.createdAt - a.createdAt;
                return b.updatedAt - a.updatedAt;
            });
        },

        // Get all tags
        getAllTags(): string[] {
            const tags = new Set<string>();
            templates.forEach((t) => t.tags.forEach((tag) => tags.add(tag)));
            return Array.from(tags).sort();
        },

        // Group by tags
        groupByTags(
            templates: WidgetTemplate[]
        ): Record<string, WidgetTemplate[]> {
            const groups: Record<string, WidgetTemplate[]> = {};

            templates.forEach((template) => {
                template.tags.forEach((tag) => {
                    if (!groups[tag]) groups[tag] = [];
                    groups[tag].push(template);
                });
            });

            return groups;
        },
    };
}
```

## Migration from V1

### V1: Context Provider

```tsx
// V1: TemplatesProvider context
<TemplatesProvider>
    <App />
</TemplatesProvider>;

// V1: Usage
const { templates, addTemplate } = useContext(TemplatesContext);
```

### V2: Atoms

```tsx
// V2: No provider needed
<App />;

// V2: Usage
const { templates, addTemplate } = useWidgetTemplates();
```

The API remains nearly identical - just the underlying storage mechanism changed from context to atoms.

## Complete Example

```typescript
// atoms/templates.ts
import { atomWithStorage } from 'jotai/utils';

export const widgetTemplatesAtom = atomWithStorage<WidgetTemplate[]>(
  'widget-templates',
  []
);

export const datasourceTemplatesAtom = atomWithStorage<DatasourceTemplate[]>(
  'datasource-templates',
  []
);

// hooks/useWidgetTemplates.ts
import { useAtom } from 'jotai';
import { widgetTemplatesAtom } from '@/atoms/templates';

export function useWidgetTemplates() {
  const [templates, setTemplates] = useAtom(widgetTemplatesAtom);

  return {
    templates,
    addTemplate(template: Omit<WidgetTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
      const newTemplate: WidgetTemplate = {
        ...template,
        id: generateId(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setTemplates(prev => [...prev, newTemplate]);
      return newTemplate;
    },
    updateTemplate(id: string, updates: Partial<WidgetTemplate>) {
      setTemplates(prev => prev.map(t =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
      ));
    },
    deleteTemplate(id: string) {
      setTemplates(prev => prev.filter(t => t.id !== id));
    }
  };
}

// components/WidgetCard.tsx
import { useWidgetTemplates } from '@/hooks/useWidgetTemplates';

export function WidgetCard({ widget }: { widget: WidgetInstance }) {
  const { templates, addTemplate } = useWidgetTemplates();
  const [showTemplates, setShowTemplates] = useState(false);

  const saveAsTemplate = () => {
    addTemplate({
      name: `${widget.definition.name} - ${Date.now()}`,
      widgetType: widget.definition.id,
      config: widget.config,
      tags: ['auto-saved'],
      isPublic: false
    });
  };

  return (
    <Card>
      {/* ... widget content ... */}
      <Button onClick={saveAsTemplate}>Save as Template</Button>
      <Button onClick={() => setShowTemplates(true)}>
        Load Template ({templates.length})
      </Button>
    </Card>
  );
}
```

## API Reference

### Atoms

| Atom                      | Type                   | Persisted       | Description          |
| ------------------------- | ---------------------- | --------------- | -------------------- |
| `widgetTemplatesAtom`     | `WidgetTemplate[]`     | ✅ localStorage | Widget templates     |
| `datasourceTemplatesAtom` | `DatasourceTemplate[]` | ✅ localStorage | Datasource templates |

### Hooks

| Hook                       | Returns                  | Description                 |
| -------------------------- | ------------------------ | --------------------------- |
| `useWidgetTemplates()`     | `WidgetTemplatesAPI`     | Manage widget templates     |
| `useDatasourceTemplates()` | `DatasourceTemplatesAPI` | Manage datasource templates |
| `useTemplateSearch()`      | `SearchAPI`              | Search and filter templates |
| `useTemplateIO()`          | `ImportExportAPI`        | Import/export templates     |

### Types

```typescript
interface WidgetTemplate {
    id: string;
    name: string;
    description?: string;
    widgetType: string;
    config: unknown;
    tags: string[];
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
}

interface DatasourceTemplate {
    id: string;
    name: string;
    description?: string;
    datasourceType: string;
    config: unknown;
    tags: string[];
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
}
```

## Best Practices

1. **Use descriptive names**: Make templates easy to find
2. **Add tags liberally**: Tags enable powerful filtering
3. **Write descriptions**: Help users understand what the template does
4. **Version control templates**: Export templates to version control
5. **Avoid overly specific configs**: Make templates reusable
6. **Group related templates**: Use consistent tagging scheme
7. **Clean up unused templates**: Periodically review and delete

## Next Steps

- [Dashboard Integration](/docs/v2/core/dashboard-integration.md) - Dashboard atom management
- [Atoms API](/docs/v2/api/atoms-api.md) - Complete atoms reference
- [Widget API](/docs/v2/api/widget-api.md) - Widget development guide
