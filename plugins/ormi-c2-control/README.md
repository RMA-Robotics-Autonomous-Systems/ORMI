# ormi-c2-control

C2 (Command & Control) datasource + widgets for ORMI: mission authoring,
fleet/vehicle status, mission feedback, swarm log, and a mission map.

## UUID → human-name resolution

Operator-facing widgets resolve raw UUIDs to friendly names through small,
module-level stores (read via `useSyncExternalStore`, never a version-counter
`useMemo` — see AGENTS.md "React Compiler + external mutable stores"):

- **`state/c2-catalog-store.ts`** — `mission_id → name` and `feature_id → name`,
  fed by the widgets that already fetch those lists.
- **`state/c2-agents-store.ts`** — `agent_id → namespace name` (e.g. "Themis_Fr"),
  so the operator sees agents by namespace rather than UUID.

### Agent namespace source

The namespace is fed primarily from the **`/multi_robot/edge/agent_profile`**
ROS topic (`std_msgs/msg/String`, whose `data` field is a JSON string of the
full profile with top-level `agent_id` + `namespace`, republished ~2s). The
`:5000/Vehicles` REST roster **strips `namespace`** (mongoose strict schema), so
the roster is only a best-effort secondary source — correct if the C2 schema is
ever loosened.

The **Fleet Status (F7)** widget therefore has an optional second topic,
**"Agent profile topic (optional)"** (`std_msgs/msg/String`). When set, the
widget parses each profile message and feeds `publishAgentNames`. An
empty/missing namespace (e.g. an unset `AUTONOMY_TOPIC_PREFIX`) falls back to a
shortened id. Names appear once a widget has fed the store (accepted
degradation: there is no central always-on namespace fetch).
