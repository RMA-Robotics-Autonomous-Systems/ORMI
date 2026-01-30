---
title: "Templates API"
description: API for saving and loading dashboard templates
order: 5
---

# Templates API

## Overview

The Templates API enables users to save and restore complete dashboard configurations including workspace layouts, widget instances, and settings. Templates are persisted to localStorage for quick access.

**Use Templates to:**

- Save current dashboard state
- Load predefined layouts
- Share dashboard configurations
- Provide quick workspace switching

For architectural details on template storage and synchronization, see **[Core - Templates System](../core/templates)**.

## useTemplates Hook

Main hook for accessing template management functionality.

### Signature

```typescript
function useTemplates(): {
	templates: Template[];
	saveTemplate: (name: string, description?: string) => void;
	loadTemplate: (templateId: string) => void;
	deleteTemplate: (templateId: string) => void;
	updateTemplate: (templateId: string, updates: Partial<Template>) => void;
	isLoading: boolean;
};
```

### Template Type

```typescript
interface Template {
	id: string;
	name: string;
	description?: string;
	timestamp: number;
	workspaceConfig: WorkspaceConfig;
	widgetInstances: WidgetInstance[];
}
```

## Basic Usage

### Save Current Dashboard

```typescript
import { useTemplates } from '@workspace/ui'

function SaveTemplateButton() {
  const { saveTemplate } = useTemplates()
  const [name, setName] = useState('')

  const handleSave = () => {
    saveTemplate(name, 'Optional description')
    setName('')
  }

  return (
    <div>
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Template name"
      />
      <Button onClick={handleSave}>Save Dashboard</Button>
    </div>
  )
}
```

### Load Template

```typescript
function TemplateSelector() {
  const { templates, loadTemplate } = useTemplates()

  return (
    <Select onValueChange={loadTemplate}>
      <SelectTrigger>
        <SelectValue placeholder="Select template" />
      </SelectTrigger>
      <SelectContent>
        {templates.map(template => (
          <SelectItem key={template.id} value={template.id}>
            {template.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

### Delete Template

```typescript
function TemplateManager() {
  const { templates, deleteTemplate } = useTemplates()

  return (
    <div>
      {templates.map(template => (
        <div key={template.id} className="flex items-center gap-2">
          <span>{template.name}</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => deleteTemplate(template.id)}
          >
            Delete
          </Button>
        </div>
      ))}
    </div>
  )
}
```

## Common Patterns

### Template Gallery

```typescript
function TemplateGallery() {
  const { templates, loadTemplate, deleteTemplate } = useTemplates()

  return (
    <div className="grid grid-cols-3 gap-4">
      {templates.map(template => (
        <Card key={template.id}>
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Saved: {new Date(template.timestamp).toLocaleString()}
            </p>
            <p className="text-sm">
              {template.widgetInstances.length} widgets
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button onClick={() => loadTemplate(template.id)}>
              Load
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTemplate(template.id)}
            >
              Delete
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
```

### Quick Save Dialog

```typescript
function QuickSaveDialog() {
  const { saveTemplate } = useTemplates()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSave = () => {
    saveTemplate(name, description)
    setOpen(false)
    setName('')
    setDescription('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Save className="mr-2 h-4 w-4" />
          Save Dashboard
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Dashboard Template</DialogTitle>
          <DialogDescription>
            Save your current dashboard configuration
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Mission Control"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name}>
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Template Sidebar

```typescript
function TemplateSidebar() {
  const { templates, loadTemplate, deleteTemplate, isLoading } = useTemplates()
  const [filter, setFilter] = useState('')

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(filter.toLowerCase())
  )

  if (isLoading) {
    return <div>Loading templates...</div>
  }

  return (
    <div className="w-64 border-r p-4">
      <h2 className="text-lg font-semibold mb-4">Templates</h2>

      <Input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Search templates..."
        className="mb-4"
      />

      <div className="space-y-2">
        {filteredTemplates.map(template => (
          <div
            key={template.id}
            className="p-2 rounded border hover:bg-accent cursor-pointer"
          >
            <div
              className="flex items-center justify-between"
              onClick={() => loadTemplate(template.id)}
            >
              <div className="flex-1">
                <p className="font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {template.widgetInstances.length} widgets
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation()
                  deleteTemplate(template.id)
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <p className="text-sm text-muted-foreground text-center mt-4">
          No templates found
        </p>
      )}
    </div>
  )
}
```

### Auto-Save Feature

```typescript
function DashboardWithAutoSave() {
  const { saveTemplate } = useTemplates()
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Auto-save every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      saveTemplate('_autosave', 'Automatic backup')
      setLastSaved(new Date())
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [saveTemplate])

  return (
    <div>
      {lastSaved && (
        <div className="text-xs text-muted-foreground">
          Last saved: {lastSaved.toLocaleTimeString()}
        </div>
      )}
      {/* Dashboard content */}
    </div>
  )
}
```

### Template Update

```typescript
function RenameTemplateDialog({ templateId, currentName }: Props) {
  const { updateTemplate } = useTemplates()
  const [name, setName] = useState(currentName)
  const [open, setOpen] = useState(false)

  const handleRename = () => {
    updateTemplate(templateId, { name })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Template</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={handleRename}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Export/Import Templates

```typescript
function TemplateImportExport() {
  const { templates, saveTemplate } = useTemplates()

  const handleExport = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (!template) return

    const json = JSON.stringify(template, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const template = JSON.parse(e.target?.result as string)
        saveTemplate(template.name, template.description)
      } catch (error) {
        console.error('Failed to import template:', error)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold mb-2">Export Templates</h3>
        {templates.map(template => (
          <Button
            key={template.id}
            variant="outline"
            size="sm"
            onClick={() => handleExport(template.id)}
          >
            Export {template.name}
          </Button>
        ))}
      </div>

      <div>
        <h3 className="font-semibold mb-2">Import Template</h3>
        <Input
          type="file"
          accept=".json"
          onChange={handleImport}
        />
      </div>
    </div>
  )
}
```

## TemplatesProvider

Context provider that manages template state and localStorage persistence.

### Usage

```typescript
import { TemplatesProvider } from '@workspace/ui'

function App() {
  return (
    <TemplatesProvider>
      <Dashboard />
    </TemplatesProvider>
  )
}
```

**Note:** The dashboard automatically includes TemplatesProvider. Only use this if building custom layout outside the main dashboard.

## Best Practices

### 1. Use Descriptive Names

```typescript
// Good
saveTemplate("Mission Control - 4 Cameras");
saveTemplate("Diagnostics Dashboard");

// Bad
saveTemplate("Template 1");
saveTemplate("test");
```

### 2. Add Descriptions

```typescript
saveTemplate(
	"Autonomous Flight",
	"Dashboard for monitoring autonomous UAV missions with telemetry and camera feeds",
);
```

### 3. Handle Load Errors

```typescript
const handleLoad = (templateId: string) => {
	try {
		loadTemplate(templateId);
		toast.success("Template loaded");
	} catch (error) {
		toast.error("Failed to load template");
		console.error(error);
	}
};
```

### 4. Confirm Destructive Actions

```typescript
const handleDelete = (templateId: string, name: string) => {
	if (confirm(`Delete template "${name}"?`)) {
		deleteTemplate(templateId);
	}
};
```

### 5. Show Loading States

```typescript
function TemplateList() {
  const { templates, isLoading } = useTemplates()

  if (isLoading) {
    return <Spinner />
  }

  return <div>{/* Template list */}</div>
}
```

## Common Issues

### Templates Not Persisting

**Problem:** Templates disappear after refresh

**Solutions:**

- Check localStorage quota (may be full)
- Verify TemplatesProvider wraps app
- Check browser privacy settings (localStorage may be disabled)

### Load Fails

**Problem:** `loadTemplate()` throws error

**Causes:**

- Template references deleted widget types
- Workspace structure changed
- Corrupted template data

**Solution:** Add error boundary:

```typescript
try {
	loadTemplate(id);
} catch (error) {
	console.error("Failed to load template:", error);
	// Optionally delete corrupted template
	deleteTemplate(id);
}
```

### Large Templates

**Problem:** Saving very large dashboards fails

**Solution:** Consider compressing or splitting:

```typescript
// Check template size before saving
const estimatedSize = JSON.stringify(workspaceConfig).length;
if (estimatedSize > 1000000) {
	// 1MB
	console.warn("Template is very large");
}
```

## See Also

- **[Core - Templates System](../core/templates)** - Architecture and storage implementation
- **[Dashboard API](./dashboard-api)** - Dashboard management
- **[Widget API](./widget-api)** - Widget configuration
