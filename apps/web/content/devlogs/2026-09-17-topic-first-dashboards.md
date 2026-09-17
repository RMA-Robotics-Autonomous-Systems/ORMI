# Build a Dashboard by Clicking a Topic

Setting up a dashboard used to mean knowing the answer before you started: add a widget, find it in a catalogue, open its settings, hunt through a list of every topic your robots publish, and pick the right one. If you already knew which widget showed a point cloud, that was fine. If you did not, nothing on screen told you.

You can now work the other way round. Open the **+** button in the bottom-right corner, look at the topics your robots are actually publishing, and click one. It opens in the widget that suits it. Click a second number topic and it joins the chart already on screen instead of opening a second one.

## One way in, three tabs

The **+** button opens a single dialog with everything that can be added to a dashboard: **Topics**, **Widgets** and **Templates**. The widget catalogue is back as a grid of cards, and every tab's search box takes focus the moment you arrive, so you can start typing immediately.

On an empty workspace the button draws attention to itself until the first widget is placed. It stops as soon as there is something on the dashboard.

## What a topic click does

Every widget now **declares** which topic types it answers for. That declaration is the whole of the decision — nothing is guessed from the shape of a settings form any more. A click either opens the one widget that claims the type, adds to a matching widget already on screen, or asks you when more than one widget honestly claims it.

Three things it deliberately will not do:

**It will not command your robot by accident.** Controls that publish to a topic — teleop, buttons, toggles — are never the automatic answer to a topic click. They are offered beside the viewers, in their own group, with their own wording and icon, so adding something that drives a robot is always a deliberate act.

**It will not half-configure a widget.** Some panels need more than one topic to work — the map's IMU arrows also need a GPS origin. Those are offered with the missing piece named, rather than being opened in a state that renders nothing.

**It will not guess which field you meant.** An IMU carries three different vectors. Where the answer requires picking one of them, you are asked instead.

## Panels that find their own topics

The diagnostics and battery panels do not bind to a single topic — they gather every topic of their kind across every datasource into one view. Clicking a diagnostics topic now opens the right panel for it, and if that panel is already on your dashboard, ORMI tells you the topic is already there rather than adding a second identical copy.

## Widgets split instead of stacking

On flex dashboards, a new widget now splits the largest panel along its longer axis: two widgets sit side by side, three make an L, four make a grid. Only when a panel would become too small to read does the widget join it as a tab instead. If you had maximised a panel, adding a widget restores the layout so you can see what you just added.

## Names you no longer have to type

Anywhere a name sits beside a topic — a map layer, a chart series, a marker, the widget title itself — it now fills itself in from the topic you picked. Type your own and it is yours from then on; ORMI will not overwrite it.

The same goes for buffer sizes, which are gone from the settings entirely. Each widget knows how much history it needs.

## Smaller things you will notice

The left and right drawers on a flex dashboard now open **over** the layout instead of pushing it aside, so opening one no longer resizes every map, 3D scene and chart on the dashboard.

The **datasources dialog** now shows each connected system as a proper card with its type and live connection state, and a Remove button you can actually see — it used to be hidden behind a right-click. A datasource that still needs setting up says so in words instead of only pulsing.

The **basemap picker** lists the vector styles first, names the provider for each entry, and marks the ones that will not render until you supply an API key. Long names no longer overflow their dropdown.

Renaming a datasource now updates the topic list immediately, and a topic you create for a control appears straight away — neither needs a page reload any more.

## If something you use has disappeared

Two widgets were retired because a better one covers the same ground: the second graph viewer, and the separate keyboard and joypad teleop panels, now merged into one teleop control.

A saved dashboard using a retired widget does not break. The tile tells you it holds a configuration this build cannot show, keeps your settings exactly as they were saved, and asks you to replace or remove it. The same goes for a datasource whose plugin is not in this build.
