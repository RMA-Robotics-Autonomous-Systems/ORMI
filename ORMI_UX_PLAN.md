# ORMI UX / HMI Plan

Status as of 2026-09-16. Detail doc for the `TODO.md` entry of the same date.

Driving complaint, in the user's words:

> "ORMI has grown a lot and has a lot of features; it becomes really hard to track what is available, what does what, and how to do it." … "In terms of number of clicks, configuration difficulties, setting up a dashboard is difficult and you need to know how it works, the system is not really intuitive."

---

## 0. What this plan learned the hard way

A static census over 362 config fields found 22 latent schema defects. They were fixed, the repo went green, and the verdict on the build was: **"I noticed no difference"**, then **"all that you fixed was never noticed."**

That was correct, and the reason is structural. Those defects **self-correct in normal use** — a widget that opens AJV-invalid becomes valid the moment you pick a topic, which is the first thing you do. They punish only someone who does not already know the flow.

**A census finds defects, because defects are what is visible in code. Friction lives in the gap between the product and a person using it, so static analysis cannot see it.**

Consequence for this plan: every item below is tagged with the evidence behind it.

- **[TASK]** — derived from tracing a real end-to-end task. Trust these.
- **[CODE]** — derived from reading source. Real, but may be unfelt.
- **[USER]** — reported directly by the operator. Highest confidence.

Do not reorder this plan by defect count.

---

## 1. Diagnosis

Three distinct failures that need three different fixes. Conflating them is why this felt unfixable.

|                   | Failure                                    | Example                                                       |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------- |
| **Inventory**     | You cannot find what exists                | 57 definitions in a flat 200px popover searched by `id`       |
| **Comprehension** | You found it, but not what it does         | "Btn control" and "Toggle control" both read "Toggle a topic" |
| **Operation**     | You know what you want; the path is hidden | Five layout modes behind a right-click on a bomb icon         |

**Root cause.** Every surface that governs discoverability — the picker, the toolbar, the shell, the gating filter, the datasource adder — lives in `packages/ormi-core`, which is immutable by rule. The plugin layer grew freely to 13 plugins and 57 definitions; the layer that indexes it was frozen. This workstream is therefore core-heavy by construction, not by choice of solution.

Secondary root cause, found later and arguably sharper: **ORMI does not model read-versus-write.** A `TopicSelect` on a topic a widget _publishes to_ is indistinguishable from one it _subscribes to_. This produces two independent bugs — see §2.1 and §5.2 — and must be fixed once, deliberately.

---

## 2. Principles

### 2.1 No legacy, but never a crash — **[USER]**

We do not carry compatibility shims. When a change invalidates a stored config, the rule is:

1. **It must not crash.** A stale config is an expected state, not an exception.
2. **It must not silently degrade.** A widget that quietly drops an unreadable setting teaches the operator to distrust the dashboard.
3. **It must name itself unsupported and demand an action.** The tile states what is no longer supported and offers the route out — reconfigure, replace, or remove.

Current state: `WidgetErrorBoundary` (`packages/ormi-core/src/dashboard/layout/widget-error-boundary.tsx`) and `widget-not-found.tsx` exist, so the no-crash half is partly built. Both are **generic failure** surfaces — the boundary renders the raw JS `error.message`, which is a developer artifact, not operator guidance, and neither offers a path to fix the config. The gap is a distinct **unsupported-config** state.

This principle is a precondition for §5.2 (chart consolidation) and §5.3 (teleop fusion), both of which retire widget ids that live dashboards reference.

### 2.2 The operator brings only what the operator knows

Of 362 config fields, **2.8%** genuinely require external facts (robot URL, API key). **4.7%** are facts the app already holds but renders as a bare text box. Configuration is not hard because robotics is hard; it is hard for self-inflicted reasons.

Corollary — **[USER]**: an operator must never be asked for an implementation detail. `Buffer Size` is the canonical violation: the widget knows whether it needs history; the operator does not.

### 2.3 One surface per job

There are already three add-surfaces (`WidgetsDialog`, `WidgetsCombo`, `WidgetTemplateDrawer`). Adding a fourth is the failure mode. Any new entry point must retire an old one.

### 2.4 No temporary code — **[USER]**

Every slice ships on push. There are no scaffolds, no throwaway prototypes, and no "we will promote this to core later" placements. A thing is built where it belongs the first time.

This is the same instinct as §2.1: the project does not carry transitional artifacts, because a transitional artifact that ships is just an undocumented permanent one.

**Direct consequence:** the staged "slice 0" originally proposed for §7 — a hardcoded routing table inside the `topics-list` widget, to be replaced by the core module later — is **rejected**. Topic-first begins at the core module. This raises the cost of the first increment and removes the cheap validation step; §10 records how we buy that confidence back.

---

## 3. Done — landed, uncommitted, repo green

35 typecheck / 18 lint (0 errors) / 26 test tasks (0 fail). `packages/ormi-core` untouched.

1. **22 required-without-default violations across 19 widgets.** **[CODE]** A `TopicSelect` binding is `type: "object"`, so no honest default is representable; topics therefore leave `required` and the widget renders a "select a topic" body. Dropping `required` bare would have crashed `WidgetErrorBoundary` via `LocalDataSourcesProvider`'s `topic.source.id`. New repo-wide guard `apps/web/__tests__/definition-defaults.test.tsx`; rule recorded in `AGENTS.md`. Side effect: `apps/web` had no `test` script, so 15 existing tests were dead in CI and now run.
2. **9 `datasource_id` fields → live pick-lists** via `extensibilityHook` + `packages/utils/src/datasource-select-schema.ts`. The field holds a configured **instance** id (`AVAILABLE_DATASOURCES`), _not_ a definition id from `DATASOURCES_LIST`. Only 5 were bare text; the other 4 had duplicated 25-line async closures, now deduped.
3. **`packages/ormi-jsonforms` repairs.** HIDE rules now work on layouts (`visible` was never destructured in `utils/layouts.tsx` — the reason progressive disclosure sat at 4 of 62 definitions); enum/oneOf controls keep a label and show errors (~96 fields previously lost their field name once set); ARIA added throughout; `ShadcnDateControl` crash fixed (it shadowed `date-fns`'s `format` with a string, so every date field with a value threw).

**Honest assessment:** none of this changes how the product feels. It removes defects an expert never hits. It is worth keeping; it is not progress against the driving complaint.

**Outstanding risk:** none of it has been verified in a browser. The enum rewrite changes the DOM shape of ~96 fields, and `color-select.tsx` was deleted on a false "zero usages" justification — there are 9, all `type: "string"`, so they resolve through the better control, but that is a live change across 6 widgets.

---

## 4. Immediate — safety and hygiene, non-core

### 4.1 Control widgets fire while you are typing — **[CODE]**, safety

`useDigitalTrigger` (`packages/ui/src/combined/triggers/use-digital-trigger.ts:70-89`) attaches a **window-level** keydown listener that matches the bound key and publishes. It supports a guard, `shouldHandleKeyboardEvent`, but the generic `DigitalComponent` (`packages/ui/src/combined/triggers/digital-trigger.tsx:20-24`) passes only `isGamepadBlocked`.

Exposed: `btn`, `toggle`, `cycle`, `keyboard-cmd-vel` (5 sites), `joystick-cmd-vel` (3 digital + 2 analog), and `command-tello-widget` — 6 sites, a **drone**. No `event.target` check, no `isContentEditable` check, no open-dialog check. Typing a bound character into the widget search box or any config field publishes to `/cmd_vel`.

Exactly one place is correct: `goal-pose-overlay.tsx` defines `isTypingInEditableElement()` **locally** and passes it; it was never promoted to a shared util.

**Fix:** make the guard **default-on inside the hook** — opt-in safety on a robot console is backwards — and promote `isTypingInEditableElement` to `packages/ui`. Guard on a focused editable element _and_ on an open modal. Note `keyUpEvent` does not consult the guard at all; harmless today only because `deactivate` early-returns, but fix the asymmetry.

Also **[USER]**: restyle the trigger components to match the app.

### 4.2 Dev datasources ship to production — **[USER]**

`loadgen-source` and `random-data-source` register unconditionally; no `NODE_ENV` gating anywhere in either plugin. They appear in the operator's datasource list on a real deployment. Gate registration, keeping them available in dev. Consider whether `teodor-emi-replay-source` belongs in the same class.

---

## 5. Consolidation — fewer, better widgets

Both items below retire widget ids that stored dashboards reference, so **§2.1 is a prerequisite**, not a follow-up.

### 5.1 Two chart widgets → one — **[USER]**, decided

**Decision: uPlot survives. `chart-widget-echarts` is retired; `chart-widget-time-series` is the single chart.**

Reversed from an initial "ECharts is better" on capability, after the engine difference surfaced. The deciding facts:

|                | `chart-widget-time-series` | `chart-widget-echarts`                                                     |
| -------------- | -------------------------- | -------------------------------------------------------------------------- |
| engine         | uPlot                      | ECharts                                                                    |
| installed size | **560 KB**                 | **59 MB**                                                                  |
| import style   | named                      | `import * as echarts` — a namespace import, so tree-shaking cannot trim it |
| used by        | —                          | exactly one file                                                           |

ORMI budgets the main thread hard — the `ws://` decode rules in `AGENTS.md` exist because it is the scarce resource on a field link, and charts compete for that same budget. A 100× heavier dependency pulled whole into the bundle is the wrong trade for a robotics console, and retiring it removes `echarts` from `plugins/ormi-std-widgets/package.json` outright.

**ECharts was genuinely the more capable widget, so this is a port, not just a deletion.** What the surviving chart must gain:

| Capability                                                 | ECharts today | uPlot feasibility                                                                                                                |
| ---------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Per-series y-axis, `position: left \| right`**           | yes           | native — `axes[]` with `side`; **do this first**, dual-scale is the one that matters in the field (speed against voltage)        |
| Per-series line style — width, `solid \| dashed \| dotted` | yes           | native — series `stroke` / `dash`                                                                                                |
| Per-series symbol / points                                 | yes           | native — series `points`                                                                                                         |
| Series type `line \| bar \| scatter`                       | yes           | line native; scatter via points-only; **bar** is the weak fit — uPlot ships a bars path builder, but confirm before promising it |
| Per-series title                                           | yes           | trivial                                                                                                                          |

uPlot's current schema exposes only a **global** axis plus per-topic colour and fill, so all of the above is new work on it.

**Known uPlot limitation, from this repo's own history:** uPlot has **no decimation** — a repaint costs the sample count, not the pixel width. The EMI cockpit hit exactly this and moved to raw canvas with one min/max pair per pixel column (recorded in `TODO.md`). With a long "time history in seconds" at a high rate this will bite. **The surviving chart needs decimation regardless of engine**; treat it as part of this work, not a later surprise.

Saved dashboards referencing `chart-widget-echarts` land in the §2.1 unsupported state, not a "widget not found" tile. The settings map cleanly — `series[]` → `topics[]`, same per-entry fields — so the unsupported card can tell the operator exactly what to recreate, and a migration is feasible if we later decide the retirement deserves one.

### 5.2 Keyboard + joypad → one teleop widget — **[USER]**

The two are **the same widget with a different input device**. Verified: identical top-level schemas — `title, axes, startingSpeed, incSpeed, decSpeed, unlock, unlocktoggle, topic, publicationFrequency, keepPublishZero`. `incSpeed`/`decSpeed`/`unlock` are `DigitalInput` in both. The **only** divergence is the axis item:

|                           | axis binding                                      |
| ------------------------- | ------------------------------------------------- |
| `keyboard-cmd-vel-widget` | `key_positive` / `key_negative`: `DigitalInput`   |
| `joystick-cmd-vel-widget` | `joystick_plus` / `joystick_minus`: `AnalogInput` |

And `DigitalInput` **already** models `type: "keyboard" | "gamepad"` — a gamepad _button_ is already a `DigitalInput`. The real distinction is not keyboard-vs-gamepad; it is **digital (on/off)** vs **analog (continuous)**. Both halves already exist.

**Target:** one teleop widget whose per-axis binding is a union of digital and analog inputs. Folds two 570/659-line files into one, halves the maintenance of the trigger stack, and removes a "which of these two do I want?" decision from the catalogue. Sequence **after** §4.1 so the fused widget inherits the guard rather than needing it retrofitted.

---

## 6. Configuration burden

### 6.1 Remove `Buffer Size` — **[USER]**

A raw `<Input type="number" min=1 max=1000>` at `packages/ormi-core/src/renderers/topic-selection/topic-details.tsx:199-212`. Defaults already disagree with themselves — `1` in `topic-selection-state.ts:60`, `100` in `topic-creator-dialog.tsx:179`. Derive from the consuming widget's requirements and drop the field. **Core.**

### 6.2 Type-to-search in the widget dialog — **[USER]**

`widgets-dialog.tsx:174-182` has no `autoFocus` and no key handler, so the box must be clicked first; and the input sits in a **footer below the results**, so on open the eye lands on cards rather than the way to filter them. Typing anywhere in the open dialog should search. **Core.**

### 6.3 Topic binding as a switch, not a modal — **[USER]**

`TopicSelect` is a `size="large"` two-pane modal (`topic-selection-dialog.tsx:266`) that loads topics on open, then runs compatibility in batches of ten behind a spinner. **There is no auto-select when exactly one compatible topic exists** — verified. With one candidate the operator still pays open → wait → click → Select. `maps-box-viewer` has 6 of these controls, `scene-3d` 5.

Two fixes, in order: auto-settle a sole compatible topic, and for small candidate sets render a switch/checkbox list inline instead of a modal. Largely subsumed by §7 if that lands.

---

## 7. Topic-first dashboard — **[USER]**, the structural fix

> "Open with a topic list by default, and the ability to display certain topics by clicking. I see a number topic, I click +, it adds a graph viewer. Then another number topic — it adds to the _same_ viewer. Then a point cloud — adds to the 3D viewer, others appended."

This inverts the flow: today you pick a widget then configure a topic; here you pick a topic and the system picks or reuses the widget. It dissolves inventory, comprehension **and** operation at once rather than patching each, and collapses the ~17-step setup path to roughly one click per thing you want to see.

### 7.1 What already exists

- `packages/ormi-core/src/widgets/topic-compatibility.ts` — 765 lines, tested, answers "can this widget display this topic", including nested property paths, across webapp and raw ROS types. **`isTopicCompatible`, `filterCompatibleTopics` and `getWidgetDataSources` have zero production references** — spare capacity. `isTopicCompatible` is synchronous, so the common path costs nothing at click time.
- Append targets already take arrays: `timeseries-chart` (`topics[]`), `chart-echarts` (`series[]`), `points-cloud-drei` (`topics[]`), `maps-box-viewer` (3 arrays), `std-scene-3d` (**three** topic-bearing arrays — `pointCloudLayers`, `pathLayers`, `mapGridLayers`; `anchors` carries no topic).
- `AVAILABLE_TOPICS` enumerates live topics; `topic-selection/topic-browser.tsx` already renders them with compatibility marks.

### 7.2 The two findings that decide whether this works

**Publishers are indistinguishable from subscribers.** `btn.tsx:118-126` declares `dataRequirements.accepts: ["number","boolean"]` on the topic it **publishes to**. Of 7 widgets accepting `number`, **4 are publishers**. A naive reverse index answers "what displays this lidar topic?" with "a Button that publishes to it." Auto-routing to one yields a dashboard that commands a robot because someone clicked a sensor. Same root cause as §4.1.

**`addWidget` creates no layout entry.** `packages/ormi-core/src/dashboard/state/actions.ts:17-36` writes only to the widgets map; react-grid-layout auto-places at the bottom. On a populated dashboard "click a topic → a viewer appears" reads as "nothing happened", because it is below the fold. **Any first slice must place the tile in the viewport and flash it** or the feature demos as broken.

### 7.3 Design decisions

- **Infer the append slot from the uischema; do not declare it.** The array shape is already fully expressed (`Control` → array schema, `options.detail` holding the item's `TopicSelect` and its requirements), and it works at _slot_ granularity — scene-3d's three arrays each carry their own `accepts`. A declared slot list would restate this and rot silently when a fourth array is added.
- **Declare only what inference cannot recover**: two optional fields on `TopicSelectElement.options` — `direction: "subscribe" | "publish"` and `role: "primary" | "secondary"`. Additive, non-breaking, **no `WidgetDefinition` change**; migration is ~12 one-line plugin edits versus ~40 controls across 28 files for a definition-level change.
- **Auto-route only on a direct type match; never on a property match.** The engine already returns `directMatch` separately. A property match makes `Odometry` "compatible" with a chart via `pose.pose.position.x`; auto-picking plots _a_ number that is plausible and wrong — the worst outcome, because nobody notices.
- **Do not hide incompatible topics** (rviz does; it makes "why isn't my topic listed?" a permanent support question). Show them, disable the `+`, name the type in a tooltip.
- **Do not auto-build a starter dashboard.** A real robot exposes 40–200 topics; any generated layout is arbitrary. Offer an opt-in, undoable "Build a starter view" instead.
- **Ties** resolve via a `TOPIC_ROUTING_PREFERENCES` hook (precedent: `topicPreviewRegistry`, `MAP_LOCAL_VISUALIZERS`, `WIDGET_LIST_WITH_DATASOURCE`), plus a workspace-sticky learned choice so the second point cloud never asks again.

### 7.4 Staging

Per §2.4 there is no throwaway slice 0. Each stage below is production on push.

- **Stage 1 — the routing core, additive.** `packages/ormi-core/src/widgets/topic-routing.ts`: the uischema walk, the slot index, the precedence ladder. `TopicSelectElement.options.direction` / `.role` (C9). The `TOPIC_ROUTING_PREFERENCES` hook. The anchored disambiguation popover. Mark the ~12 publisher/secondary slots in plugins. **Ships with C12 (layout placement) in the same push** — without it the feature reads as broken (§7.2), so shipping them apart would put a knowingly-broken behaviour on `Master`.
  The entry point in this stage is a `+` on each row of the existing `topics-list` widget (`plugins/ormi-std-widgets/src/widgets/basic/topics-list.tsx`) — not as a scaffold, but because that widget is a legitimate permanent surface that already polls `AVAILABLE_TOPICS`, has search and sort, and renders inside the shell. It keeps working after stage 2; the rail becomes the _always-present_ route to the same action, not a replacement for it.
- **Stage 2 — the rail.** A left collapsible rail on the dashboard surface (not a widget — it would be blanked by `WIDGETS_LIST → []` at exactly the cold start where it is needed; not a page — navigating away destroys the feel). Topics / Widgets / Templates tabs. Retire `WidgetsDialog`'s FAB and `WidgetsCombo`: **net −2 surfaces, +1**.
- **Stage 3 — property-match routing**, reusing `topic-browser.tsx`'s property-tree UI in an advanced path.

**Invariant to record in `AGENTS.md`:** a widget is reachable from the Topics lane iff it has a `direction: "subscribe"` routable slot; **every** widget is reachable from the Widgets lane. The lanes overlap; Topics is a shortcut, never the only path.

---

## 8. Core change register

`packages/ormi-core` is immutable: each needs explicit approval, an impact analysis, and docs in `apps/web/content/docs`. Recommend bundling rather than approving piecemeal.

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                  | Kind               | Status                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| C1  | Confirm discards edits on invalid input — `widget-card.tsx:160-168` wraps confirm in `DialogClose`, so Radix closes regardless of `handleAdd`'s early return; no Cancel exists. `datasource-card.tsx:174-182` is a byte-identical copy. Compounded by the `[]`-dep sync effect at `widget-card.tsx:69-75`, which on the edit path (card stays mounted) shows abandoned edits on reopen. | Bugfix             | **Impact analysis written; awaiting approval** |
| C2  | `add-to-templates.tsx:33` does `props.widget.data = props.data`, mutating the **shared registry definition** — one instance's settings leak into every later widget of that type. Blocks shipping curated templates.                                                                                                                                                                    | Bugfix             | Awaiting approval                              |
| C3  | Unsupported-config state (§2.1)                                                                                                                                                                                                                                                                                                                                                         | Feature            | Not started                                    |
| C4  | Remove `Buffer Size` (§6.1)                                                                                                                                                                                                                                                                                                                                                             | Feature            | Not started                                    |
| C5  | Type-to-search + move the search box above results (§6.2)                                                                                                                                                                                                                                                                                                                               | Feature            | Not started                                    |
| C6  | Label the toolbar; layout modes from right-click `ContextMenu` to a labelled dropdown                                                                                                                                                                                                                                                                                                   | Feature **[TASK]** | Not started                                    |
| C7  | Inline the datasource adder — removes a dialog nesting level and an unlabelled `+`                                                                                                                                                                                                                                                                                                      | Feature **[TASK]** | Not started                                    |
| C8  | Empty states that point at the next step; only one thing pulses at a time                                                                                                                                                                                                                                                                                                               | Feature **[TASK]** | Not started                                    |
| C9  | `TopicSelectElement.options.direction` / `.role` (§7.3)                                                                                                                                                                                                                                                                                                                                 | Additive           | Not started                                    |
| C10 | `topic-routing.ts` (§7.4 slice 1)                                                                                                                                                                                                                                                                                                                                                       | New module         | Not started                                    |
| C11 | Auto-select sole compatible topic (§6.3)                                                                                                                                                                                                                                                                                                                                                | Behaviour          | **Decided: core**                              |
| C12 | `addWidget` layout placement (§7.2)                                                                                                                                                                                                                                                                                                                                                     | Bugfix             | Not started — ships with §7.4 stage 1          |

**C11 is core, by decision.** It lands in `packages/ormi-core/src/renderers/topic-select-renderer.tsx` (and `frame-select-renderer.tsx`) rather than as a rank>10 `JSON_FORMS_RENDERER` override from a plugin. "Exactly one compatible topic binds automatically" is platform semantics; a plugin-side override would silently change other plugins' widgets and only when that plugin happened to load. It still needs an impact analysis and docs under the Core Immutability Rule before implementation.

---

## 9. Recommended order

Revised after §2.4 removed the throwaway prototype step.

1. **§4.1 trigger guard** — safety, non-core, and nothing else should ship before it. Model read-vs-write properly while in there: §7.2 needs the same distinction, and doing it once is the point.
2. **§4.2 dev datasources** — non-core, small.
3. **§10.1 observation** — watch one setup, or read the real workspace data. Cheap, and it is now the only validation available before core spend.
4. **Core bundle** — C1, C2, C6, C7, C8 as one approved pass, with C4, C5 and C11 riding along. Feel-bearing items lead (C6–C8 are **[TASK]**-grade); C1/C2 are correctness.
5. **§2.1 unsupported-config state (C3)** — a hard prerequisite for step 6.
6. **§5.2 teleop fusion**, then **§5.1 chart consolidation** once its load measurement exists.
7. **§7.4 stages 1–2** — topic-first, beginning in core.

Steps 1–3 need no approval and are independent of everything else.

---

## 10. Open questions

**Resolved 2026-09-16:** C11 → core (§8). §5.1 → **uPlot survives, ECharts retired** (reversed from an initial ECharts call once the 560 KB vs 59 MB engine difference surfaced; the capability gap becomes a port — see §5.1). The `apps/web/content/docs` submodule changes ride along in the commit — they are intentional prior work, not strays.

1. **Evidence — the one that matters most now.** §2.4 removed the cheap validation step: topic-first no longer gets a throwaway prototype to prove the feel before core is committed. That confidence has to come from somewhere else, and the two cheap sources are observation, not code:
    - Query saved workspace content in Postgres — which widgets are actually used, how many per dashboard, which settings are left at default. Needs sign-off; it is real user data.
    - Watch one person who is not the author set up a dashboard. Fifteen minutes of this outranks the entire §3 census.

    Doing at least one of these **before** stage 1 is the recommended way to spend §2.4's cost rather than absorb it.

2. `ShadcnAnyOfStringOrEnumControl` is dead code and nothing uses `anyOf` — register (after fixing its always-true `hasEnumAndText` predicate) or delete?
3. **§5.1 — is `bar` required?** Line, scatter, dashes, symbols and dual y-axis all port to uPlot cleanly; bar is the one series type that is a poor fit. If nobody uses bar, the port is straightforward and this question closes.

---

## 11. Definition of done

Per workstream: targeted `bun run typecheck` / `lint` / `test` green; `AGENTS.md` updated where a durable rule is introduced; `ormi-doc/knowledge/` + LikeC4 updated on any structural platform change; docs in `apps/web/content/docs` for any core change; and — the one this plan keeps failing — **verified in a browser against a real datasource**, not only in CI.
