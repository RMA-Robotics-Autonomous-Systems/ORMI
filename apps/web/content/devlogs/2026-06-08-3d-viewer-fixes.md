# A Round of Fixes: 3D Viewer and App-Wide Theming

A batch of fixes landed today — two in the 3D viewer (found and verified against a live ROS 2 Nav 2 + SLAM simulation, so occupancy grids and planned paths now line up with reality) and a broad pass that makes the app's colors follow the selected theme consistently.

## Rectangular costmaps line up with the world again

Occupancy grids and costmaps could appear shifted and rotated relative to the robot and the rest of the scene — the robot would sit in the wrong place on the map — but only for **non-square** maps. Square maps happened to render fine, which is why this went unnoticed for a while.

The map image is rotated to lie flat on the ground before being painted onto its 3D plane. For rectangular maps that rotation was using the wrong dimensions: a chunk of the map data was written past the end of the image and silently dropped (about 14% of the cells on a typical costmap), and the rest came out transposed — effectively turned 90° and clipped. The flat plane the map is drawn on had its width and height swapped for the same reason.

Both are fixed. Rectangular costmaps now sit exactly where they should, aligned with the robot and any paths on top of them — matching what you'd see in Foxglove or RViz.

## Robot paths show the whole route

A planned path in the 3D viewer (for example the Nav2 plan) would only draw a short stub just ahead of the robot and never reach the goal — even though the full path data was arriving correctly.

The path line is drawn efficiently by reusing a single line object and updating its points as the plan changes. The underlying 3D engine measures how many segments a line may contain the **first** time it is drawn, and never raises that limit afterward. Because the line starts out empty, that initial limit was tiny — so every later, longer path was clipped to just those first few segments.

The limit is now reset whenever the path updates, so the line always renders the complete current route, all the way to the goal.

## Colors now follow the selected theme

This one started small. In the "Saved widgets" sheet, the **Widgets / Datasources** toggle was stacked on two lines and didn't behave like a switch. The cause was a styling rule that never made it into the app's compiled styles, because the stylesheet build wasn't scanning the part of the codebase where it's used.

Closing that gap fixed the toggle — but it also surfaced a wider problem: a number of components were using fixed colors that ignored the selected theme. Status badges, form-validation highlights, connection overlays, and various panels looked fine in light mode but didn't adapt to dark mode, and in one case a status badge was unreadable (red text on a red background).

Those colors now use theme-aware tokens with proper light and dark variants across the whole app, so badges, validation states, status panels, and overlays all follow the active theme. Genuinely meaningful colors — chart series, map overlays, and live gauges — were intentionally left as they were.
