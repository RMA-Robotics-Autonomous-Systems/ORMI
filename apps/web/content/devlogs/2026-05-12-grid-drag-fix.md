# Grid Dashboards — Drag, Resize, and Compaction Fixed

A batch of fixes for GRID dashboards landed today. If you use the grid layout mode, things should feel noticeably more reliable.

## Drag and resize work again

Moving or resizing widgets was broken in a subtle way: you could start a drag, but the widget would snap back or behave erratically before you could drop it. This turned out to be a low-level issue in how the layout engine was being configured — it was receiving a new configuration object on every render and treating it as a change, which interrupted the drag in progress. The configuration is now stable across renders, so dragging and resizing behave as expected.

## Compact buttons actually compact

The "compact to rows" and "compact to columns" buttons in the dashboard toolbar are meant to tidy up your layout by pushing all widgets toward the top or left, eliminating gaps. They were wired up but the compaction logic was never actually running — clicking the buttons had no visible effect. Both actions now work correctly. Clicking compact-to-rows pulls everything upward, and compact-to-columns pushes everything to the left.

## Smoother experience when widgets are open

Previously, any state change in the dashboard — a widget loading, a datasource connecting — would cause every single tile to re-render at once. In a dashboard with many widgets this could cause a noticeable stutter or flash. Widgets now update independently: a change in one tile no longer triggers a repaint of the others.
