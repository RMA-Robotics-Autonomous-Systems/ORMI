---
title: "Renderers API"
description: API for custom JSON Forms renderers
order: 7
---

# Renderers API

## Overview

The Renderers API enables creating custom UI components for JSON Forms, allowing you to replace default form inputs with specialized controls like topic selectors, color pickers, or domain-specific widgets.

**Use Custom Renderers to:**

- Create specialized form inputs
- Integrate ROS topic selection
- Add complex validation UI
- Provide domain-specific controls

For architectural details on renderer registration and JSON Forms integration, see **[Core - Renderers System](../core/renderers)**.

## Renderer Structure

### Anatomy of a Renderer

```typescript
interface RendererEntry {
	renderer: React.ComponentType<RendererProps>;
	tester: RankedTester;
}

interface RendererProps {
	data: any;
	path: string;
	schema: JsonSchema;
	uischema: UISchemaElement;
	handleChange(path: string, value: any): void;
	errors?: string;
}

type RankedTester = (
	uischema: UISchemaElement,
	schema: JsonSchema,
	context: any,
) => number;
```

### Renderer Priority

Testers return a rank (higher = higher priority):

- `-1`: Not applicable
- `1-2`: Low priority (fallback)
- `3-5`: Normal priority
- `6-10`: High priority (specialized)

## Creating Custom Renderers

### Basic Custom Renderer

```typescript
import { rankWith, scopeEndsWith } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'

// Renderer component
const ColorPickerRenderer = ({
  data,
  handleChange,
  path,
  errors,
}: RendererProps) => {
  return (
    <div>
      <input
        type="color"
        value={data || '#000000'}
        onChange={e => handleChange(path, e.target.value)}
      />
      {errors && <span className="error">{errors}</span>}
    </div>
  )
}

// Tester: Match fields ending with "Color"
export const colorPickerTester = rankWith(
  5, // Priority
  scopeEndsWith('Color')
)

// Export entry
export const ColorPickerRendererEntry = {
  renderer: withJsonFormsControlProps(ColorPickerRenderer),
  tester: colorPickerTester,
}
```

### Topic Select Renderer

```typescript
import { rankWith, uiTypeIs } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { useDataSources } from '@workspace/ui'

const TopicSelectRenderer = ({
  data,
  handleChange,
  path,
  uischema,
}: RendererProps) => {
  const { getAllTopics } = useDataSources()
  const topics = getAllTopics()

  // Get message type filter from UI schema options
  const options = uischema.options || {}
  const messageType = options.messageType as string | undefined

  // Filter topics by message type
  const filteredTopics = messageType
    ? topics.filter(t => t.messageType === messageType)
    : topics

  return (
    <Select value={data || ''} onValueChange={v => handleChange(path, v)}>
      <SelectTrigger>
        <SelectValue placeholder="Select topic" />
      </SelectTrigger>
      <SelectContent>
        {filteredTopics.map(topic => (
          <SelectItem key={topic.name} value={topic.name}>
            {topic.name}
            <span className="text-xs text-muted-foreground ml-2">
              {topic.messageType}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Tester: Match UI schema with type "TopicSelect"
export const topicSelectTester = rankWith(6, uiTypeIs('TopicSelect'))

export const TopicSelectRendererEntry = {
  renderer: withJsonFormsControlProps(TopicSelectRenderer),
  tester: topicSelectTester,
}
```

### Range Slider Renderer

```typescript
import { rankWith, and, schemaMatches } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { Slider } from '@workspace/ui'

const RangeSliderRenderer = ({
  data,
  handleChange,
  path,
  schema,
}: RendererProps) => {
  const min = schema.minimum || 0
  const max = schema.maximum || 100
  const step = schema.multipleOf || 1

  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span>{min}</span>
        <span className="font-semibold">{data || min}</span>
        <span>{max}</span>
      </div>
      <Slider
        value={[data || min]}
        onValueChange={([value]) => handleChange(path, value)}
        min={min}
        max={max}
        step={step}
      />
    </div>
  )
}

// Tester: Match numbers with min/max defined
export const rangeSliderTester = rankWith(
  5,
  and(
    schemaMatches(schema => schema.type === 'number'),
    schemaMatches(
      schema =>
        schema.minimum !== undefined && schema.maximum !== undefined
    )
  )
)

export const RangeSliderRendererEntry = {
  renderer: withJsonFormsControlProps(RangeSliderRenderer),
  tester: rangeSliderTester,
}
```

## Tester Functions

### Built-in Testers

```typescript
import {
	rankWith,
	scopeEndsWith,
	scopeEndsWith,
	uiTypeIs,
	schemaMatches,
	and,
	or,
} from "@jsonforms/core";

// Match by scope (JSON path)
rankWith(5, scopeEndsWith("topic"));

// Match by UI schema type
rankWith(6, uiTypeIs("TopicSelect"));

// Match by schema properties
rankWith(
	4,
	schemaMatches((s) => s.type === "string" && s.format === "color"),
);

// Combine conditions
rankWith(
	5,
	and(
		schemaMatches((s) => s.type === "number"),
		scopeEndsWith("Angle"),
	),
);

rankWith(
	3,
	or(
		scopeEndsWith("Color"),
		schemaMatches((s) => s.format === "color"),
	),
);
```

### Custom Tester

```typescript
// Custom logic for complex matching
const customTester: RankedTester = (uischema, schema, context) => {
	// Check if it's a ROS message type field
	if (schema.type === "string" && uischema.options?.isRosTopic) {
		return 7; // High priority
	}
	return -1; // Not applicable
};

export const CustomRendererEntry = {
	renderer: withJsonFormsControlProps(CustomRenderer),
	tester: rankWith(7, customTester),
};
```

## Registering Renderers

### Register in Plugin

```typescript
// In your plugin registration
import {
	ColorPickerRendererEntry,
	TopicSelectRendererEntry,
} from "./renderers";

export const MyPlugin = {
	id: "my-plugin",
	name: "My Plugin",
	renderers: [ColorPickerRendererEntry, TopicSelectRendererEntry],
	widgets: [
		/* ... */
	],
};
```

### Register Globally

```typescript
// In app setup
import { registerRenderer } from "@workspace/ormi-jsonforms";

registerRenderer(
	ColorPickerRendererEntry.renderer,
	ColorPickerRendererEntry.tester,
);
```

## Common Patterns

### Renderer with Validation

```typescript
const EmailRenderer = ({
  data,
  handleChange,
  path,
  errors,
  schema,
}: RendererProps) => {
  const [localError, setLocalError] = useState<string>()

  const validate = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (value && !emailRegex.test(value)) {
      setLocalError('Invalid email format')
      return false
    }
    setLocalError(undefined)
    return true
  }

  const handleInput = (value: string) => {
    if (validate(value)) {
      handleChange(path, value)
    }
  }

  return (
    <div>
      <Input
        type="email"
        value={data || ''}
        onChange={e => handleInput(e.target.value)}
        className={localError || errors ? 'border-red-500' : ''}
      />
      {(localError || errors) && (
        <p className="text-sm text-red-500">{localError || errors}</p>
      )}
    </div>
  )
}

export const emailTester = rankWith(
  5,
  schemaMatches(s => s.type === 'string' && s.format === 'email')
)
```

### Renderer with External Data

```typescript
const FrameSelectRenderer = ({
  data,
  handleChange,
  path,
}: RendererProps) => {
  const { getAllFrames } = useTransformSource()
  const frames = getAllFrames()

  return (
    <Select value={data || ''} onValueChange={v => handleChange(path, v)}>
      <SelectTrigger>
        <SelectValue placeholder="Select frame" />
      </SelectTrigger>
      <SelectContent>
        {frames.map(frame => (
          <SelectItem key={frame} value={frame}>
            {frame}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const frameSelectTester = rankWith(
  6,
  and(
    schemaMatches(s => s.type === 'string'),
    uiTypeIs('FrameSelect')
  )
)
```

### Compound Renderer

```typescript
const Vector3Renderer = ({
  data,
  handleChange,
  path,
}: RendererProps) => {
  const value = data || { x: 0, y: 0, z: 0 }

  const updateField = (field: 'x' | 'y' | 'z', val: number) => {
    handleChange(path, { ...value, [field]: val })
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <Label>X</Label>
        <Input
          type="number"
          value={value.x}
          onChange={e => updateField('x', parseFloat(e.target.value))}
        />
      </div>
      <div>
        <Label>Y</Label>
        <Input
          type="number"
          value={value.y}
          onChange={e => updateField('y', parseFloat(e.target.value))}
        />
      </div>
      <div>
        <Label>Z</Label>
        <Input
          type="number"
          value={value.z}
          onChange={e => updateField('z', parseFloat(e.target.value))}
        />
      </div>
    </div>
  )
}

export const vector3Tester = rankWith(
  6,
  schemaMatches(
    s =>
      s.type === 'object' &&
      s.properties?.x &&
      s.properties?.y &&
      s.properties?.z
  )
)
```

## Using UI Schema Options

### Pass Options in UI Schema

```json
{
	"type": "Control",
	"scope": "#/properties/topic",
	"options": {
		"type": "TopicSelect",
		"messageType": "sensor_msgs/Image",
		"showMessageType": true
	}
}
```

### Access Options in Renderer

```typescript
const TopicSelectRenderer = ({
	data,
	handleChange,
	path,
	uischema,
}: RendererProps) => {
	const options = uischema.options || {};
	const messageType = options.messageType as string | undefined;
	const showMessageType = options.showMessageType as boolean;

	// Use options...
};
```

## Best Practices

### 1. Use Appropriate Priority

```typescript
// High priority for very specific matches
rankWith(8, and(uiTypeIs('TopicSelect'), schemaMatches(...)))

// Normal priority for general matches
rankWith(5, scopeEndsWith('Color'))

// Low priority for fallbacks
rankWith(2, schemaMatches(s => s.type === 'string'))
```

### 2. Handle Undefined Data

```typescript
const value = data || defaultValue;
```

### 3. Validate Before Changing

```typescript
const handleInput = (newValue: any) => {
	if (isValid(newValue)) {
		handleChange(path, newValue);
	}
};
```

### 4. Show Error States

```typescript
<Input
  className={errors ? 'border-red-500' : ''}
  value={data}
  onChange={...}
/>
{errors && <span className="text-red-500">{errors}</span>}
```

### 5. Use withJsonFormsControlProps

```typescript
// Always wrap with HOC
export const MyRendererEntry = {
	renderer: withJsonFormsControlProps(MyRenderer),
	tester: myTester,
};
```

## Common Issues

### Renderer Not Applied

**Problem:** Default renderer used instead of custom

**Causes:**

- Tester rank too low
- Tester conditions don't match
- Renderer not registered

**Solutions:**

- Increase tester rank
- Debug tester with console.log
- Verify renderer in plugin exports

### Data Not Updating

**Problem:** Form doesn't reflect changes

**Cause:** Not calling `handleChange` correctly

**Solution:**

```typescript
// Correct
handleChange(path, newValue);

// Incorrect
setState(newValue); // Won't update form data
```

### Type Mismatches

**Problem:** Schema expects different type

**Solution:** Convert before calling handleChange:

```typescript
// String input for number field
onChange={e => handleChange(path, parseFloat(e.target.value))}

// Boolean toggle
onChange={checked => handleChange(path, checked)}
```

## See Also

- **[Core - Renderers System](../core/renderers)** - Renderer architecture and JSON Forms integration
- **[Widget API](./widget-api)** - Using renderers in widget config forms
- **[Plugin API](./plugin-api)** - Registering renderers in plugins
- **[JSON Forms Documentation](https://jsonforms.io/)** - Official JSON Forms docs
