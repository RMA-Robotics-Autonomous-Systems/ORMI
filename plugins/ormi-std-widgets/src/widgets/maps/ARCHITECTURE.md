# Maps Box Viewer - Component Architecture

## Overview

The `MapsBoxViewer` has been refactored into a modular architecture with clearly separated concerns. The main component now acts as a lightweight orchestrator, delegating specific responsibilities to sub-components and hooks.

## Architecture

```
maps-box-viewer.tsx (Main orchestrator - ~150 LOC)
│
├── hooks/
│   ├── useMapStyle.ts          - Map style generation (raster, 3D, custom layers)
│   └── useMapInitialization.ts - Geolocation and loading state
│
└── components/
    ├── MapToolbar.tsx          - Zoom, refresh, and grid controls
    ├── GpsTopicsLayer.tsx      - GPS coordinate topics rendering
    └── LocalTopicsLayer.tsx    - Local coordinate topics with transforms
```

## Components

### Main Component: `MapsBoxViewer`

**Responsibility**: Orchestrate sub-components and manage state
**Size**: ~150 lines (reduced from ~500 lines)

```tsx
<MapsBoxViewer {...settings}>
    <MapToolbar />
    <GpsTopicsLayer />
    <LocalTopicsLayer />
    <CustomLayersOverlay />
</MapsBoxViewer>
```

### Hooks

#### `useMapStyle`

Generates MapLibre style specification including:

- Base raster tiles
- Custom overlay layers (COG, WMS, etc.)
- Grid layer
- 3D buildings (when enabled)

**Input**: Map URL, 3D settings, custom layers, grid visibility
**Output**: MapLibre `StyleSpecification`

#### `useMapInitialization`

Handles map initialization:

- Detects user's geolocation
- Manages loading state
- Provides default location fallback

**Output**: `{ startingLocation, isLoading }`

### Components

#### `MapToolbar`

Manages map control buttons:

- Zoom in/out
- Refresh
- Grid toggle

**Props**: `mapRef`, `showGrid`, `onToggleGrid`, `onRefresh`

#### `GpsTopicsLayer`

Renders topics already in GPS coordinates:

- Wraps topics in `LocalDataSourcesProvider`
- Renders appropriate marker types (simple, heatmap, path, multipoints)
- Manages topic list overlay

**Props**: `topics`, `mapRef`

#### `LocalTopicsLayer`

Renders topics in local coordinate frames:

- Wraps in `TransformSourcesProvider` for coordinate transforms
- Auto-detects visualizers from plugins
- Transforms local coordinates to GPS

**Props**: `localTopics`

## Benefits of This Architecture

### 1. **Separation of Concerns**

Each component/hook has a single, well-defined responsibility:

- Style generation → `useMapStyle`
- Initialization → `useMapInitialization`
- Controls → `MapToolbar`
- GPS topics → `GpsTopicsLayer`
- Local topics → `LocalTopicsLayer`

### 2. **Improved Testability**

- Each component can be tested in isolation
- Mock props easily for unit tests
- Hooks can be tested independently

### 3. **Better Maintainability**

- Changes to GPS topics don't affect local topics
- Style changes are isolated to one hook
- Toolbar modifications don't touch rendering logic

### 4. **Reusability**

- `useMapStyle` can be used in other map components
- `MapToolbar` can be extracted to a shared component
- Layer components can be composed differently

### 5. **Clearer Data Flow**

```
Props → State → Hooks → Components → Rendered Output
  ↓       ↓       ↓         ↓
Settings → Custom layers state → Map style → MapLibre
```

## Usage Examples

### Adding a New Topic Type

Only modify `GpsTopicsLayer.tsx`:

```tsx
// In GpsTopicsLayer.tsx
if (t.makerType === "cluster") {
    return <ClusterMarker key={t.name} {...t} />;
}
```

### Customizing Toolbar

Only modify `MapToolbar.tsx`:

```tsx
// Add a new button
setButtonItem(
    "custom-button",
    <Button onClick={handleCustomAction}>
        <CustomIcon />
    </Button>,
    1
);
```

### Changing Map Style

Only modify `useMapStyle.ts`:

```tsx
// Add terrain
sources: {
    ...baseStyle.sources,
    'terrain': {
        type: 'raster-dem',
        url: terrainUrl
    }
}
```

## Migration Notes

The refactoring maintains **100% backward compatibility**:

- Same props interface (`MapsViewerSettings`)
- Same behavior
- Same rendering output
- No breaking changes to existing code

## File Structure

```
plugins/ormi-std-widgets/src/widgets/maps/
├── maps-box-viewer.tsx          (Main component)
├── hooks/
│   ├── index.ts
│   ├── useMapStyle.ts
│   └── useMapInitialization.ts
├── components/
│   ├── index.ts
│   ├── MapToolbar.tsx
│   ├── GpsTopicsLayer.tsx
│   └── LocalTopicsLayer.tsx
├── marker-*.tsx                  (Individual marker types)
├── topics-overlay.tsx
├── layers-overlay.tsx
└── maps-grid.tsx
```

## Future Improvements

1. **Extract marker type registry**: Plugin system for custom markers
2. **Virtualize large datasets**: Implement windowing for many topics
3. **Performance monitoring**: Add metrics for render times
4. **State management**: Consider Context API for deeply nested state
5. **Type safety**: Strengthen TypeScript types for better IDE support
