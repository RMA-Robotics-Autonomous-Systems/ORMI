# ormi-c2-control

C2 (Command & Control) datasource + widgets for ORMI: mission authoring,
fleet/vehicle status, mission feedback, swarm log, and a mission map.

## Status colors

C2 widgets must color status/UI through the **semantic theme tokens** so they
follow the app theme and adapt to dark mode: `success` (done/started/ok),
`warning` (degraded/paused/warn), `info` (current/planned/in-progress),
`destructive` (fail), plus `primary` / `muted` / `foreground` for generic
chrome. Use the matching `-foreground` token for text on a colored fill
(e.g. `bg-success text-success-foreground`).

Never use raw `*-500` Tailwind palette literals (`bg-emerald-500`,
`text-amber-600`, `ring-sky-500`, …) — they ignore the theme and dark mode. The
plugin's `eslint.config.js` warns on these in `.tsx`. The **only** exception is
MapLibre `paint`/`layout` hex colors in `<Layer>` props (MapLibre cannot read
CSS variables), which stay as hex.

## Mission Editor

The editor **follows the active mission** from the selection store — it does not
create or pick missions itself (that is the mission browser's job). There are
no "New" / "Load active" buttons: when the active mission changes, the editor
hydrates that mission's config (via `c2.missions.list`) into its draft, and with
no active mission it shows a "Select a mission in the browser to edit"
placeholder. **Save** persists via `c2.missions.save` and re-asserts the active
mission so the control panel and the mission feedback stay aligned.

Both the **Mission Map** and the **Mission Editor** save by re-fetching
the stored mission config and merging only the slice each editor owns (the map
owns `objective.geometries` / `vehicles` / `behavior` / `name`; the editor also owns the
advanced `transit` / `start` / `arrival_time` blocks). Concurrent edits to the
**same** field are last-writer-wins by design; the merge keeps each editor from
clobbering the other's untouched fields.

Switching the active mission while the draft has **unsaved edits** does not
discard them silently: a warning bar offers **"Discard & edit ‹new mission›"**
(load the newly-active mission) or **"Resume editing ‹current mission›"**
(re-point the shared selection back to the draft's mission so the rest of the
dashboard stays coherent). A clean draft follows the selection silently.
Mission names in the bar resolve through the catalog store, not raw UUIDs.

## UUID → human-name resolution

Operator-facing widgets resolve raw UUIDs to friendly names through small,
module-level stores (read via `useSyncExternalStore`, never a version-counter
`useMemo` — see AGENTS.md "React Compiler + external mutable stores"):

- **`state/c2-catalog-store.ts`** — `mission_id → name` and `feature_id → name`,
  fed by the widgets that already fetch those lists.
- **`state/c2-agents-store.ts`** — a per-agent roster keyed by `agent_id`, each
  record carrying its namespace **name** (e.g. "Themis_Fr"), its **`namespace`**
  (the `AUTONOMY_TOPIC_PREFIX`, used to build per-agent namespaced topics), and
  the datasource **`source`** the profile arrived on (so per-agent subscriptions
  go to the right datasource). The operator sees agents by namespace rather than
  UUID, and the map can subscribe per agent.

    The store exposes two snapshot shapes with two stability rules: the per-id
    name/record hooks (`useAgentName`, `useAgentRecord`) return reference-stable
    primitives/objects per id, while `useAgents()` returns an **object (array)
    snapshot** governed by the map-editing-store rule — `getAgentsSnapshot` returns
    a stored `AgentRecord[]` reference rebuilt **once** per real change (never a
    fresh `Object.values()` per call, which would loop `useSyncExternalStore`).
    Profiles are merged with no-op-on-unchanged semantics: `source` is compared
    **by `source?.id`** (never by object reference) so the ~2 Hz republish is a
    no-op, and blank names/namespaces never clear a prior good value.

### Agent namespace source

The namespace is fed primarily from the **`/multi_robot/edge/agent_profile`**
ROS topic (`std_msgs/msg/String`, whose `data` field is a JSON string of the
full profile with top-level `agent_id` + `namespace`, republished ~2s). The
`:5000/Vehicles` REST roster **strips `namespace`** (mongoose strict schema), so
the roster is only a best-effort secondary source — correct if the C2 schema is
ever loosened.

The **Fleet Status** widget therefore has an optional second topic,
**"Agent profile topic (optional)"** (`std_msgs/msg/String`). When set, the
widget parses each profile message and feeds `publishAgentProfiles` with the
agent's `namespace`, name, **and the topic's datasource `source`** (so the map's
per-agent localization subscription knows where to subscribe). An empty/missing
namespace (e.g. an unset `AUTONOMY_TOPIC_PREFIX`) falls back to a shortened id.
Names appear once a widget has fed the store (accepted degradation: there is no
central always-on profile fetch).

## Basemap & overlay anchoring

The mission map's base layer comes from the shared catalogue in
`@workspace/utils` (`basemapOneOf()` builds the `Base map` dropdown), which since
the vector work holds two kinds of row:

- **raster** — an XYZ tile template; everything a deployed dashboard has
  persisted so far;
- **vector** — an `ormi:vector/...` sentinel selecting one of ORMI's bundled
  MapLibre styles (OpenFreeMap Liberty / Positron / Dark). Liberty is the
  default and the fallback for a blank `mapUrl`. `use-map-style.ts`
  resolves it through `createVectorBasemapStyle`, which returns a FRESH deep copy
  per call — never share one style object between two maps.

The raster overlays (`MAP_OVERLAYS`, RainViewer radar) are positioned with
`beforeId`, and that value **must** come from
`resolveAnchor(mapStyle, ORMI_STYLE_ANCHORS.overlay) ?? "c2-features-fill"`:

- on a **vector** basemap the anchor exists, so overlays land above the map
  geometry but below the basemap's own place labels;
- on a **raster** basemap there are no anchors, `resolveAnchor` returns
  `undefined`, and the fallback keeps the pre-existing behaviour (overlays under
  the C2 feature fill, which `FeatureLayers` always renders).

Never pass a bare anchor constant: MapLibre throws when `beforeId` names a layer
the style does not contain, which would blank the map for every raster user.
Mission/feature/draw layers keep append semantics on purpose — mission geometry
must never be occluded by a place label.

3D buildings here are ORMI's own extruded GeoJSON footprints
(`Buildings3DLayer`), not the basemap's; the bundled styles' `building-3d` layer
stays hidden.

## Per-agent map markers (localization, frame-gated)

The **Mission Map** plots agent markers PRIMARILY from each agent's own
`{namespace}/edge/multi_robot/localization` stream (`nav_msgs/msg/Odometry`),
**one subscription per agent**, instead of the shared `/edge/feedback` window
(which interleaved every agent's messages and made markers flicker as the buffer
cycled through agents).

- The per-agent topic set is derived in `widgets/agent-localization-topics.ts`
  from the agent roster. A marker is drawn **only when the message frame is
  geographic** — `header.frame_id === "map"`, where `position.x = longitude` and
  `position.y = latitude` (degrees). Any other frame is local/metric and yields
  no marker.
- **Dynamic-subscription stability:** `LocalDataSourcesProvider` depends on its
  `SelectedTopics` array **by reference**, so `useAgentLocalizationTopics` keys
  its `useMemo` on a pure **signature string** (`agentsTopicSignature`:
  `agent_id|namespace|source.id` joined) rather than the roster array. The
  returned `topics` identity is stable until membership / namespace / source
  actually changes, so the provider does not thrash per-agent subscribe/
  unsubscribe on every render.
- Markers are **labeled** via `agentByKey` — a map of the provider's topic key
  (`createTopicKey`) → `agent_id`, so each incoming localization source resolves
  to the right agent name.
- The shared **"Edge feedback (fallback for no-namespace agents)"** topic is kept
  only as a fallback: it plots the embedded feedback `odometry` (same frame gate)
  for agents that have no namespace; namespaced agents are excluded to avoid
  double markers.

## Per-mission feedback store (Mission Feedback, interleave-gated)

`/multi_robot/mission_feedback` is a **single shared topic** carrying feedback
for **all** missions, interleaved. The **Mission Feedback** widget reads a
size-1 buffer tail and filters by the selected `mission_id`, so an interleaved
message for a different mission used to flip the shown value to `null`
("Waiting for mission feedback…") and back — a flicker, the mission-level twin of
the per-agent map-marker interleave bug above.

The fix is a tiny module-level store (`state/mission-feedback-store.ts`) keyed by
`mission_id`. The widget PUBLISHES every parsed message into its mission's slot and
READS ONLY its own mission's slot, so an interleaved message for another mission
updates THAT slot and never blanks the mission this widget shows.

- Dedup is on **`feedbackSignature`** (everything Mission Feedback renders: the plan plus
  the MissionFeedback v2 progress fields): a slot's value object is replaced
  **only on a real content change**, so each mission's stored value stays
  reference-stable while unchanged. `feedbackPlanSignature` is the plan-only
  variant (no `eta` / `reached_at` / progress), for consumers that draw only the
  plan.
- **Every** message is published (`publishNewFeedbackMessages`), including
  identical republishes: those move the slot's `updatedAt` without notifying
  anyone, which is what keeps a healthy mission from reading "stale" after 15 s.
  A terminal mission is silent by design after its final snapshot and is never
  shown as stale (`isFeedbackStale`).
- `getMissionFeedback(null)` returns the **latest** published mission's
  feedback (a readout for the lifecycle panel only). The map and Mission Feedback read
  `useMissionFeedbackExact`, which returns nothing without a selection — they
  no longer fall back silently to another mission.
- Read in React via `useMissionFeedback(missionId)` over `useSyncExternalStore`
  (same identity-stable, change-fresh snapshot contract as the agents store).

## Mission timeline, "now playing" and map traces (MissionFeedback v2)

All v2 keys are optional (`types/mission-feedback.ts`); with a v1 producer the
UI shows the plan only and claims no progress.

- **Header** (Mission Feedback): the mission name is the picker (every known mission, live
  or stored, grouped Active / Planned / Finished), a status pill, elapsed time
  and projected end, and a distance-weighted overall progress bar. A finished
  mission gets a quiet "Completed 15:26:57 · review" tag, a stored snapshot a
  "stored" tag; other active missions appear as small pills. With nothing
  selected and exactly one live active mission, it is selected automatically
  (never over an existing selection).
- **Finished missions survive a reload.** A terminal mission publishes one final
  snapshot and then goes silent, so the topic alone would forget it. The store is
  also seeded from the C2's stored snapshots (`widgets/feedback-history.tsx`):
  `GET :5000/mission-feedback/latest` on load, when the C2 datasource appears and
  when the mission picker opens (throttled, shared between widgets), and
  `GET :5000/mission-feedback/:mission_id` when a mission with no known feedback is
  selected. These slots are marked `history`: **live topic messages always win**,
  a stored snapshot never replaces a live one, has no age (never fresh, never
  stale, shown as "stored"), and never feeds "now playing", auto-select or the
  lifecycle panel's command gating. Without those routes (older `:5000`) nothing
  is fetched and finished missions are reviewable for the session only.
- **Timeline and Route** (Mission Feedback, always both; `widgets/mission-feedback-views.tsx`,
  pure geometry in `widgets/feedback-layout.ts`): a Gantt fitted to each
  mission's CURRENT run (from its last re-initialisation; "Show earlier runs"
  widens it), one lane per robot grouped per mission — every live active
  mission plus the selected one — moving robots first, many lanes scrolling
  under a fixed axis; status changes as merged markers with a tooltip. The
  route is a metro line per robot; a route too long for its width becomes a
  whole-route track (passed part, stop points, robot, exact counts) plus a
  zoomed strip around the robot. Hovering a station or tick highlights the
  waypoint on the map (`state/waypoint-highlight-store.ts`); a click pins it.
  Built from ORMI's `Select`, `Badge`, `Progress`, `Separator`, `Tooltip`,
  `Button`; SVG colours are theme tokens (`var(--color-*)`), light and dark.
- **Responsiveness**: every widget measures its own box through
  `widgets/responsive.ts` (`useContainerSize`, buckets xs < 360 ≤ sm < 560 ≤
  md < 900 ≤ lg) and re-flows from ~280 px; the charts lay out at their
  measured width.
- **Map** (Mission Map): routes split into done (grey) / remaining at
  `current_waypoint_index`, the next waypoint ringed and labelled, the Nav2
  global plan of the selected mission's robots from
  `{namespace}/edge/multi_robot/autonomy_trajectory` (v2 `EPSG:4326` payload
  only; the legacy metric one is ignored; drawn only while the mission is
  STARTED and dropped once the last plan is older than 5 s —
  `state/trajectory-store.ts`), and a session breadcrumb per robot
  from its localization (~0.5 m spacing, capped; `state/breadcrumb-store.ts`).
- **Swarm log**: subscribe it to `/multi_robot/log`. `mission_id` is a
  `unique_identifier_msgs/UUID` and is converted (`types/uuid.ts`) before
  per-mission filtering.

## Fleet per-robot detail (expandable rows)

Each Fleet Status row is **expandable**: collapsed it shows the status dot, name,
state, and position; expanded it shows four blocks — **Position & speed**, **State
& task**, **Battery & fuel %**, and **Autonomy status + progress**.

**Where battery/fuel come from.** The parsed `agent_profile` topic stash
(`vehicle_info.*`, kept in widget state keyed by `agent_id`) is the primary
source; the `c2.vehicles.list` roster record is a fallback (`pickProfileTelemetry`
in `fleet-status.tsx`). It is deliberately that way round: the `:5000 /Vehicles`
schema is `{agent_id}` only, so a roster-first read can never populate these
lines — which is exactly what the widget used to do, while discarding the parsed
topic values. The fallback starts working the moment the backend widens the
roster schema, with no further change here.

The autonomy block subscribes to `{namespace}/edge/multi_robot/autonomy_status`
(`autonomy_msgs/msg/AutonomyStatus`) **only while the row is expanded** — it
mounts a child with its own single-topic `LocalDataSourcesProvider`, so collapse
unmounts it and auto-unsubscribes. With no namespace/source it shows "autonomy
status unavailable (no namespace)".

## C2 auth token and backend compatibility

- **Token**: C2 Control datasource → _Mission Control auth token (:5001, optional)_
  (`missionControlToken`). Set it to the backend's `C2_API_TOKEN`. It is sent as
  both `Authorization: Bearer <t>` and `X-C2-Token: <t>` on every `:5001` call and
  on every `:5000` mutation (POST/PUT/PATCH/DELETE); `:5000` GETs are sent without
  it, so they need no CORS preflight. Leave it blank and nothing is sent.
- **CORS**: the browser origin ORMI is served from (default
  `http://localhost:3000`) must be in the backend's `C2_ALLOWED_ORIGINS`. If you
  open ORMI as `http://127.0.0.1:3000` or by LAN IP or hostname, add that exact
  origin. Otherwise every C2 call fails in a way that looks like the backend is down.
- **Responses**: `datasource/response.ts` reads both backend versions: plain text
  with HTTP 200 (old), and `{status,code,message}` / `{error:{code,message}}` with
  a proper 4xx/5xx (new). Any non-2xx is a failure. Branch on `code`, never on the
  message text.
- **Timeouts**: every call has a default (reads 8 s, writes/commands 15 s).
