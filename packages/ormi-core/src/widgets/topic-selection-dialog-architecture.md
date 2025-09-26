# Topic Selection Dialog Architecture

## Overview

This document defines the architecture for the new dialog-based topic selection system that replaces the current topic-selector.tsx and topic-creator.tsx components with a unified, comprehensive interface.

## Current State Analysis

- **topic-selector.tsx**: Uses Popover with Command for topic search, TreeView for properties
- **topic-creator.tsx**: Grid-based inline creator with datasource/topic/type selection
- **Issues**: Fragmented UX, manual configuration (canSelectProperty, buffer, propertyType), limited space

## New Architecture Goals

1. **Unified Experience**: Single dialog for all topic operations
2. **Rich Exploration**: Full-featured browsing with search, filtering, and detailed views
3. **Automatic Compatibility**: No manual configuration needed
4. **Dual Type Support**: Clean separation of webapp vs raw type schemas
5. **Integrated Creation**: Topic creation within the same flow

## Component Hierarchy

```
TopicSelectionDialog
├── DialogHeader
│   ├── SearchInput (global topic search)
│   └── ViewToggle (list/tree view)
├── DialogContent
│   ├── LeftPanel (TopicBrowser)
│   │   ├── DatasourceFilter
│   │   ├── CompatibilityFilter
│   │   ├── TopicList
│   │   │   ├── TopicItem (with compatibility indicators)
│   │   │   └── CreateTopicButton (inline topic creation)
│   │   └── PaginationControls
│   └── RightPanel (TopicDetails)
│       ├── TopicInfo (name, type, source, description)
│       ├── CompatibilityStatus
│       ├── PropertyTreeTabs
│       │   ├── WebappTypeTab
│       │   │   └── PropertyTree (webapp schema properties)
│       │   └── RawTypeTab
│       │       └── PropertyTree (raw schema properties)
│       └── BufferConfiguration
└── DialogFooter
    ├── SelectedTopicPreview
    └── ActionButtons (Cancel, Select)
```

## State Management

### Primary State

```typescript
interface TopicSelectionState {
  // Dialog state
  isOpen: boolean;
  mode: "browse" | "create";

  // Data
  topics: DatasourceTopic[];
  filteredTopics: DatasourceTopic[];
  selectedTopic: DatasourceTopic | null;
  selectedProperty: string | null;
  selectedPropertySource: "webapp" | "raw" | null;

  // UI state
  searchTerm: string;
  viewMode: "list" | "tree";
  selectedDatasources: string[];
  showOnlyCompatible: boolean;
  activeTab: "webapp" | "raw";

  // Analysis cache
  compatibilityAnalysis: Map<string, TopicCompatibilityResult>;
  propertyTrees: Map<string, DualPropertyTree>;

  // Configuration
  bufferSize: number;
  widgetRequirements: DataRequirements;
}
```

### State Actions

```typescript
type TopicSelectionAction =
  | { type: "OPEN_DIALOG"; requirements: DataRequirements }
  | { type: "CLOSE_DIALOG" }
  | { type: "SET_SEARCH"; term: string }
  | { type: "SELECT_TOPIC"; topic: DatasourceTopic }
  | { type: "SELECT_PROPERTY"; path: string; source: "webapp" | "raw" }
  | { type: "SET_BUFFER_SIZE"; size: number }
  | { type: "TOGGLE_DATASOURCE_FILTER"; datasourceId: string }
  | { type: "SET_COMPATIBILITY_FILTER"; enabled: boolean }
  | { type: "SWITCH_TAB"; tab: "webapp" | "raw" }
  | { type: "SET_VIEW_MODE"; mode: "list" | "tree" };
```

## Component Interfaces

### TopicSelectionDialog

```typescript
interface TopicSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selection: SelectedTopic) => void;
  requirements: DataRequirements;
  initialValue?: SelectedTopic;
}
```

### TopicBrowser (Left Panel)

```typescript
interface TopicBrowserProps {
  topics: DatasourceTopic[];
  selectedTopic: DatasourceTopic | null;
  onTopicSelect: (topic: DatasourceTopic) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  compatibilityFilter: boolean;
  onCompatibilityFilterChange: (enabled: boolean) => void;
  requirements: DataRequirements;
}
```

### TopicDetails (Right Panel)

```typescript
interface TopicDetailsProps {
  topic: DatasourceTopic | null;
  analysis: TopicCompatibilityResult | null;
  propertyTree: DualPropertyTree | null;
  selectedProperty: string | null;
  selectedPropertySource: "webapp" | "raw" | null;
  onPropertySelect: (path: string, source: "webapp" | "raw") => void;
  activeTab: "webapp" | "raw";
  onTabChange: (tab: "webapp" | "raw") => void;
  bufferSize: number;
  onBufferSizeChange: (size: number) => void;
}
```

### PropertyTreeTabs

```typescript
interface PropertyTreeTabsProps {
  propertyTree: DualPropertyTree;
  selectedProperty: string | null;
  selectedPropertySource: "webapp" | "raw" | null;
  onPropertySelect: (path: string, source: "webapp" | "raw") => void;
  activeTab: "webapp" | "raw";
  onTabChange: (tab: "webapp" | "raw") => void;
  requirements: DataRequirements;
}
```

## Layout Specifications

### Dialog Dimensions

- **Width**: 1000px (responsive: 90vw on mobile)
- **Height**: 700px (responsive: 90vh on mobile)
- **Minimum**: 800x600px

### Panel Split

- **Left Panel**: 400px fixed width
- **Right Panel**: Flexible remaining space
- **Separator**: Resizable with 300px-600px constraints

### Property Tree Tabs

- **Tab Bar**: Fixed height 40px
- **Tab Content**: Flexible height with scroll
- **Tab Labels**: Include compatible property counts

## Interaction Patterns

### Topic Selection Flow

1. User opens dialog with widget requirements
2. Topics are loaded and analyzed for compatibility
3. User can:
   - Search/filter topics in left panel
   - Click topic to see details in right panel
   - Browse webapp/raw property trees in tabs
   - Select direct topic or specific property
   - Adjust buffer size if needed
4. Selection preview shows in footer
5. User confirms selection

### Topic Creation Flow

1. User clicks "Create Topic" in left panel
2. Dialog shows inline creation form
3. User fills: datasource, topic name, raw type, webapp type
4. Topic is created and automatically selected
5. Flow continues as normal selection

### Property Selection Flow

1. User selects topic with properties
2. Right panel shows dual property trees
3. User switches between webapp/raw tabs
4. Compatible properties are highlighted
5. User clicks property to select
6. Selection includes full path and source type

## Accessibility Features

- **Keyboard Navigation**: Full keyboard support for all interactions
- **Screen Reader**: Proper ARIA labels and descriptions
- **Focus Management**: Logical tab order and focus trapping
- **Color Independence**: Compatible properties shown with icons + colors
- **Responsive**: Mobile-friendly responsive layout

## Performance Considerations

- **Lazy Loading**: Topics loaded on-demand
- **Analysis Caching**: Compatibility analysis cached by topic+requirements hash
- **Virtualization**: Large topic lists use virtual scrolling
- **Debounced Search**: Search input debounced to avoid excessive filtering
- **Async Property Trees**: Raw type schemas loaded asynchronously

## Technology Stack

- **Base**: React with TypeScript
- **UI Framework**: Existing workspace UI components (Dialog, Tabs, Command, etc.)
- **State Management**: useReducer for complex state
- **Styling**: Tailwind CSS (consistent with existing components)
- **Icons**: Lucide React (consistent with existing components)

## Migration Strategy

1. Build new dialog components alongside existing ones
2. Update widget definitions to use DataRequirements interface
3. Replace topic-selector.tsx and topic-creator.tsx usage
4. Remove old components and manual configuration options
5. Update documentation and examples

## Future Extensibility

- **Custom Property Renderers**: Plugin system for custom property visualization
- **Advanced Filtering**: More sophisticated topic filtering options
- **Topic Favorites**: User can bookmark frequently used topics
- **Type Validation**: Real-time validation of topic data compatibility
- **Preview Mode**: Live preview of topic data in dialog
