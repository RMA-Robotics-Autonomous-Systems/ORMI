# What's New: Resilient Dashboards, a Reworked Workspace Page, and More

A big update centered on reliability — dashboards no longer stall when a datasource is offline — plus a much-improved workspace home page and a couple of live-visualization niceties.

## Dashboards that don't stall on an offline datasource

Opening a workspace used to be all-or-nothing: the dashboard waited for **every** datasource to connect before showing anything. If one robot was powered off, one bridge was unreachable, or one connection was just slow, the whole dashboard sat on a loading screen — even widgets that had nothing to do with the missing datasource.

Now the layout and every widget render immediately. Datasources connect in the background, and each widget reflects the state of _its own_ datasource, so a single offline source can no longer hold the rest of the dashboard hostage.

Underneath, how widgets subscribe to topics was reworked. Previously, if a datasource connected a moment after a widget mounted — or dropped and reconnected during a session — the widget could quietly stop receiving data until you reloaded it. In one common case (a ROSBridge connection dropping and coming back), the data would silently die and never recover. Subscriptions now **re-attach automatically** every time a datasource becomes ready, including after a reconnect: drop a connection and bring it back, and the data resumes on its own.

When a datasource is offline, widgets that show a single live value — status indicators, image and JSON viewers, and the like — now display a clear "datasource offline" card instead of a blank panel or a stale `0`. For a monitoring tool that matters: a dead sensor reading `0` should never be mistaken for a healthy one. Widgets that show accumulated history keep what they already received, and controls stay usable. Each widget is also isolated — if one errors, it shows a small "failed to render" card in its own tile (with a retry) instead of taking down the whole dashboard.

Finally, the two loading steps you used to see — "loading workspace", then a spinner — are now a single dashboard skeleton, with the data behind them loading in parallel for a quicker path to a usable dashboard.

## Browsing and managing workspaces, reworked

The workspace home page used to be a single kanban board — fine for organizing, less so for finding things or making quick edits.

There's now a view switcher at the top. The new **List** view is the default: a dense, sortable table of your workspaces — name, layout type, category, and the datasources each uses — far easier to scan than a wall of cards. The familiar **Board** (kanban) view is one click away for drag-and-drop organizing, and your choice is remembered. The list sorts by category, then type, then name, and any column header re-sorts it; clicking a row opens the workspace.

Workspaces are grouped by category, and each category gets a consistent accent color — a colored strip down its rows and a matching dot — so you can tell at a glance where one group ends and the next begins. You can change a workspace's category right from the list via a per-row dropdown, and "New category" lives in the toolbar in both views.

The "⋯" menu's **Edit** entry used to just open the workspace. It now opens an **Edit workspace** dialog to **rename** it, **move it to another category**, and **switch its layout type** between Grid and Flex. Switching the layout type keeps all of your widgets and datasources — only the on-screen arrangement resets to the new engine's default, and the dialog warns you first.

## 3D scene layer toggles and near-instant LAN video

The 3D scene widget gained a control panel for turning its layers on and off at runtime — axes, the ground grid, point clouds, paths, maps, and transforms — handy for decluttering a busy scene without committing to a change. These toggles are view-only: each layer starts from its configured default and your runtime overrides never get written back to the saved widget, so the saved configuration stays the source of truth.

And when you're on the same network as the robot — the common lab and field setup — the WebRTC video viewer now connects in milliseconds instead of pausing first. It previously always offered a public STUN server while negotiating; STUN helps reach a peer across NAT on the public internet, but on a LAN it adds nothing while still costing a round-trip. The viewer now defaults to **no** STUN/TURN server and connects right away. If you need to traverse NAT, you can still add STUN/TURN servers in the widget's settings.
