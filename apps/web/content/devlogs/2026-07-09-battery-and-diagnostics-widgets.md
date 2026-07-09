# What's New: Battery Monitoring and a Live Diagnostics Panel

Two new widgets for keeping an eye on your robots' health — a battery monitor and a full diagnostics panel — both of which find their data on their own, with no topic-picking required.

## Battery monitoring at a glance

The new **Battery** widget automatically discovers every battery in your system and shows one card per battery. Each card leads with the essentials — charge percentage and voltage — and fills in the rest: current, temperature, remaining and full capacity, charging status, health, and battery chemistry. If a pack reports its individual cells, you can expand the card to see per-cell voltages and temperatures.

Because it's a monitoring tool, it's careful about _unknown_ values. Sensors often leave a field unmeasured, and showing that as `0` would be dangerously misleading — a battery isn't at zero volts, the value just isn't reported. Unmeasured fields show a clear `—` instead. And if the datasource behind a battery goes offline, only that card dims; the rest keep updating.

Add it to any dashboard and every battery on your connected robots shows up automatically.

## A live diagnostics panel

The new **Diagnostics** widget subscribes to all of your diagnostics feeds and rolls them into a single health panel. A summary bar across the top tallies how many components are OK, warning, in error, or stale, so you get the overall picture at a glance. Below it, components are grouped by hardware and sorted worst-first, so anything wrong floats to the top. You can search by name or message, and OK components are hidden by default so problems stand out — one toggle brings them back.

The interesting part is reliability. On a typical robot, many different nodes report diagnostics on the same feed, each at its own rate — some many times a second, some only occasionally. A naive view would only ever show whichever node happened to report most recently, and the slow reporters would flicker in and out of existence. This widget instead **remembers the latest report from every component and keeps showing it**. If a component then goes quiet — say its node crashed — it doesn't silently disappear; after a short, configurable timeout (5 seconds by default) it's clearly marked **Stale**, so a dead node stands out rather than vanishing.

Severity is color-coded — green for OK, amber for warning, red for error, grey for stale — using new theme colors that read correctly in both light and dark mode. Expand any component to see the full set of key/value details it reports.

Together the two widgets give you a fast, always-current read on power and system health across every connected robot.
