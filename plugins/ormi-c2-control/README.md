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

## Mission Editor (F5)

The editor **follows the active mission** from the selection store — it does not
create or pick missions itself (that is the F4 mission browser's job). There are
no "New" / "Load active" buttons: when the active mission changes, the editor
hydrates that mission's config (via `c2.missions.list`) into its draft, and with
no active mission it shows a "Select a mission in the browser to edit"
placeholder. **Save** persists via `c2.missions.save` and re-asserts the active
mission so F8/F10 stay aligned.

Both the **Mission Map (F6)** and the **Mission Editor (F5)** save by re-fetching
the stored mission config and merging only the slice each editor owns (the map
owns `objective.geometries` / `vehicles` / `behavior` / `name`; F5 also owns the
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

The **Fleet Status (F7)** widget therefore has an optional second topic,
**"Agent profile topic (optional)"** (`std_msgs/msg/String`). When set, the
widget parses each profile message and feeds `publishAgentProfiles` with the
agent's `namespace`, name, **and the topic's datasource `source`** (so the map's
per-agent localization subscription knows where to subscribe). An empty/missing
namespace (e.g. an unset `AUTONOMY_TOPIC_PREFIX`) falls back to a shortened id.
Names appear once a widget has fed the store (accepted degradation: there is no
central always-on profile fetch).

## Per-agent map markers (localization, frame-gated)

The **Mission Map (F6)** plots agent markers PRIMARILY from each agent's own
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

## Per-mission feedback store (F10, interleave-gated)

`/multi_robot/mission_feedback` is a **single shared topic** carrying feedback
for **all** missions, interleaved. The **Mission Feedback (F10)** widget reads a
size-1 buffer tail and filters by the selected `mission_id`, so an interleaved
message for a different mission used to flip the shown value to `null`
("Waiting for mission feedback…") and back — a flicker, the mission-level twin of
the per-agent map-marker interleave bug above.

The fix is a tiny module-level store (`state/mission-feedback-store.ts`) keyed by
`mission_id`. F10 PUBLISHES every parsed message into its mission's slot and
READS ONLY its own mission's slot, so an interleaved message for another mission
updates THAT slot and never blanks the mission this widget shows.

- Dedup is on **`feedbackPlanSignature`** (the signature of the RENDERED plan,
  exactly what F10 displays): a slot's value object is replaced **only on a real
  content change**, so each mission's stored value stays reference-stable while
  unchanged. An identical republish for the already-latest mission is a pure
  no-op (no swap, no notify) — the topic streams continuously.
- `getMissionFeedback(null)` (no mission pinned/selected) returns the **latest**
  published mission's feedback, preserving the prior "show whatever the latest
  feedback carries" behavior without the parse-null blanking.
- Read in React via `useMissionFeedback(missionId)` over `useSyncExternalStore`
  (same identity-stable, change-fresh snapshot contract as the agents store).

## Fleet per-robot detail (expandable rows)

Each Fleet Status row is **expandable**: collapsed it shows the status dot, name,
state, and position; expanded it shows four blocks — **Position & speed**, **State
& task**, **Battery & fuel %** (from the parsed `agent_profile` `vehicle_info.*`,
kept in widget state keyed by `agent_id`), and **Autonomy status + progress**.

The autonomy block subscribes to `{namespace}/edge/multi_robot/autonomy_status`
(`autonomy_msgs/msg/AutonomyStatus`) **only while the row is expanded** — it
mounts a child with its own single-topic `LocalDataSourcesProvider`, so collapse
unmounts it and auto-unsubscribes. With no namespace/source it shows "autonomy
status unavailable (no namespace)".
