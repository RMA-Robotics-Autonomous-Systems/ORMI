# Dashboards Save Themselves, Pinned Diagnostics, and Video That Stays Up

Three changes aimed at the same thing: a dashboard that stays the way you left it, and keeps running while you work on it.

## Workspaces save by themselves

You no longer have to press Save. A workspace is saved about a second after you stop changing it: adding or removing a widget, moving a panel, editing a setting, adding a datasource, locking the dashboard.

The Save button in the top bar is still there. It shows a tick when everything is saved and a disk when a change is waiting. If a save fails you get a message, the next change tries again, and the button saves on demand.

Two things worth knowing:

- If two people have the same workspace open, the last one to change something wins. That was already the case with the Save button, but it now happens without anyone pressing it.
- On a grid dashboard, opening the workspace on a much smaller or larger screen for the first time stores a layout for that screen size. Your other layouts are not touched.

The Mission Control and EMI pages already saved their own arrangement and work as before.

## Pin the diagnostics you care about

The Diagnostics panel sorts by severity, so a message you are watching moves as soon as something else gets worse, and on a busy robot it can be pushed off screen.

Every row now has a pin. A pinned message moves to a Pinned section at the top of the panel and stays there:

- It keeps the order you pinned it in and does not re-sort.
- It stays visible when it is OK, even with "Show OK" off, and it ignores the search box.
- If its node goes quiet or has not reported since you opened the dashboard, the row stays and reads "No data", so a missing message is visible as missing.

Click the pin again to release it. Pins are saved with the workspace. A pin belongs to one datasource, so two robots reporting the same message name are pinned separately.

## Video rotation is remembered

The rotate buttons on the WebRTC viewer used to reset every time the page was reloaded. The rotation is now part of the widget and is saved with the workspace, so a camera mounted sideways stays the right way up. Rotating does not interrupt the stream.

## Adding a widget no longer restarts your video feeds

On flex dashboards, adding any widget restarted every widget already on screen. Most recovered too fast to notice, but each WebRTC viewer dropped its connection and negotiated a new one, so adding a second camera made the first one go back to "Connecting". Locking or unlocking the dashboard did the same.

Existing widgets are now left alone when the layout changes. A live feed keeps playing while you add widgets around it, add a second feed, or lock the dashboard. Grid dashboards never had the problem.
