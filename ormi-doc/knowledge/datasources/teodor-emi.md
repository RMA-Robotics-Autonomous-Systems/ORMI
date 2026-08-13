# Teodor EMI

> Internal source-of-truth knowledge base. When it disagrees with code, this file
> wins — update it and the LikeC4 model in lockstep on structural changes.

`plugins/teodor-emi-extension` is robot- and sensor-specific: the Teodor EMI coil
rake, its detection pipeline, and the page that tunes it. It is a port of the
offline report tool at `emi_ws/tools/report/`.

## The architectural move

The offline tool needed a Python server because a browser cannot read a rosbag.
ORMI has an abstraction that removes the question: a **recorded bag is a
datasource**.

> Offline and online are not two modes of the page. They are two datasources.
> Every panel subscribes through the ordinary subscription registry and never
> learns which one it is talking to.

"Work offline" is therefore selecting a different datasource — already a
first-class concept with its own dialog, health badges, gating and reconnect
handling. Replay transport (play / pause / seek / rate) rides on the existing
remote-call mechanism rather than a private channel.

## Facts about the robot that the code depends on

These were established against real recordings and are easy to get wrong from
the message definitions alone.

| Field                      | Reality                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMICoil.static_transform` | **A placeholder.** Every recorded topic, including `/emi/raw`, carries the unit basis vectors `(1,0,0) (0,1,0) (-1,0,0) (0,-1,0) (0,0,1)` — not a rake.                                                                                  |
| `EMI.rtk_pose`             | **Zero-filled** on every recorded EMI topic.                                                                                                                                                                                             |
| Coil geometry              | Comes from `/tf_static`: `base_link → emi_link → coilN_link`. `params.yaml` says so explicitly — "TF IS AUTHORITATIVE … it does not read this file."                                                                                     |
| Robot fix                  | `/teodora/xsens/gnss`. Heading: `/teodora/xsens/filter/quaternion`.                                                                                                                                                                      |
| Lever arm                  | `base_link → xsens_link` = (0.165, 0.150). This is the whole difference between the two georeferencing frames.                                                                                                                           |
| Georeferenced output       | `/teodora/emi/gnss` — the robot has already placed every coil, with its own `NavSatFix` and covariance per coil.                                                                                                                         |
| Targets                    | Two trackers run in parallel on one alert stream, gate and chain, publishing to `/teodora/emi/targets` and `/teodora/emi/proposed/targets`. `EMITarget.source` says which wrote each one. Both topics are `KeepAll().transient_local()`. |

Anything reading geometry from `static_transform` would place every detection a
metre from where it belongs, silently. The tests pin the placeholder values in
both directions so the trap cannot be walked into again.

## Message schemas, and why there are two of some

The recordings are **rosbag2 metadata version 5**, which has no
`message_definitions` table — nothing in a `.db3` is self-describing. The
definitions therefore ship with the plugin as text and are parsed with
`@foxglove/rosmsg`.

Two builds of `emi_msgs` are live at once: `EMICoilGnss` gained `float64 yaw` and
`EMITarget` gained `string source`. Both are additive on the robot but **not** to
a CDR reader — they sit inside sequence elements, so the extra bytes shift every
element after the first. The registry therefore keeps a list of layouts per type,
newest first.

Selection is by decode **plus a structural check**, not by "did it throw". A
_shorter_ layout parses a longer payload quite happily and ignores the trailing
bytes, returning a plausible wrong answer; only the reverse reliably throws. The
check is an invariant the robot guarantees — every coil's `frame_id` is
`coil{id}_link`. A message that proves nothing (an empty sequence) never unsets
a layout earlier messages established.

## The replay datasource

`teodor-emi-replay-source`, a `createDatasourceWorker` worker over sql.js.

- **The bag's bytes never enter persisted settings.** Settings carry a key; the
  `ArrayBuffer` lives in a `globalThis`-pinned store and is handed to the worker
  as runtime-only settings. The worker strips it again before publishing
  anything, because `DatasourceTopic.source` and every remote-call definition are
  cloned back to the main thread — topics on every `AVAILABLE_TOPICS` poll.
- **Streamed, not loaded.** One prepared statement per subscribed topic, stepped
  lazily, so a long recording costs one row of memory per subscription.
- **Oldest-first across topics.** A k-way merge, not a round-robin: a
  round-robin reorders topics against each other by up to one tick of bag time,
  which at high playback rates is seconds — and a consumer that fuses on arrival
  would then pair samples across that gap, which a live source never does.
- **Nothing is skipped.** When a tick exhausts its budget the clock is held back
  to the last message delivered, so the surplus replays next tick. A replay that
  runs at 0.8× is slow; a detector that never sees a sample is wrong.
- **Autoplay starts on the first subscribe**, not at open — otherwise the
  `DATASOURCE_READY` round trip plays the head of every topic to nobody.
- **A bad file does not reject `init`.** `listTopics` returns `[]` instead:
  `AVAILABLE_TOPICS` has no per-filter isolation, so a rejecting `init` would
  take topic discovery down for _every_ datasource in the app.

### The size ceiling is real and it is measured

`new SQL.Database(...)` copies the whole database into sql.js's WebAssembly
heap. sql.js is **wasm32**, and this build's `emscripten_get_heap_max` returns
exactly `2147483648` — 2 GiB — which SQLite's page cache and working
allocations have to share with the database. The JS-side `ArrayBuffer` holds a
second copy until it is collected, so the peak is roughly twice the file.

A recording past that does not degrade, it fails: several seconds after the
operator picked it, inside the worker. The picker therefore refuses at 1.5 GiB
and warns from 512 MiB (`bag-limits.ts`), both numbers derived from the measured
ceiling rather than guessed.

The answer is never "raise the limit". A multi-gigabyte survey bag is
multi-gigabyte because of cameras, lidar or point clouds; the cockpit reads
seven small topics and ignores the rest, so `ros2 bag convert` with a topic
filter is discarding data this tool was never going to look at.

### A bag is drained, not played

The replay defaults to delivering the whole recording at open. Twenty minutes of
wall clock for twenty minutes of survey is twenty minutes of looking at a chart
that is still filling in, and nothing about reading a recording needs it to
arrive at the speed it was collected. Draining hands every panel a complete run
in a second or two, after which the playhead is a cursor over the whole thing.

Two properties are kept rather than traded away. The **order is unchanged** — the
same k-way merge over the per-topic cursors, so delivery is still exactly wire
order, and a consumer that fuses on arrival still fuses correctly. And the drain
is **time-sliced**: twelve milliseconds per pass, yielding between passes. Every
published message crosses to the main thread and is fanned out there, so a pass
that ran to completion would hand the UI one unbroken block of work the length
of the recording — a tab frozen for the duration of the thing it is loading.

Real-time playback is still there (`drain: false`), and play/pause/seek/rate
remain remote calls. When the drain finishes, the datasource hands itself back
to the ordinary clock parked at the end, so seeking back into what was delivered
behaves as it always did.

### What a drain actually costs

Measured on `track2_test1` — 165 MB, 21 minutes, 41,385 EMI samples:

| step                                             | cost       |
| ------------------------------------------------ | ---------- |
| read the file                                    | 104 ms     |
| open it in sql.js                                | 54 ms      |
| decode + convert all 215,607 subscribed messages | **958 ms** |

Every cursor returns its full row count, so nothing is lost in the read, and the
worker's own work is about a second. What is left is transport: core's
`ctx.publish` emits **one `postMessage` per message**, so a drain is ~215k
structured clones and ~215k main-thread `doAction` dispatches. That, not the
decode, is what a long bag spends its loading time on.

The largest single contributor is `/teodora/xsens/filter/quaternion` at 127,420
messages — 59% of everything — which the run builder consumes latest-wins per
EMI sample. Most of it is cloned, posted, dispatched and overwritten unread. A
plugin-owned batched channel (the worker posts arrays past core RPC, the
provider fans them out through `publishedHook`) would cut the round trips by
three orders of magnitude without touching core or changing delivery order. Not
built.

### The worker may not import the React barrel

`emi-replay.worker.ts` takes `createDatasourceWorker` from
`@workspace/ormi-core/datasources/worker`, never from
`@workspace/ormi-core/datasources`. The latter re-exports
`global-datasource-provider`, which reaches the dashboard barrel, which imports
`react-grid-layout/css/styles.css` — and a stylesheet in a worker's chunk list
is fetched by `importScripts`, which cannot execute CSS. The worker then dies
before `init`, so every panel reads offline and _none of the guards below can
fire_: they all live downstream of a worker that runs.

This shipped once. It is worth knowing why it got that far — it is invisible in
development (source aliases, no CSS chunk split) and it passes typecheck, lint
and every unit test, because nothing about it is a type error or a logic error.
It exists only in a production bundle. `import type` from the full barrel is
fine and stays; only runtime values move. The check is
`grep '^import' dist/**/*.worker.js`.

### The registry must exist before the datasource goes READY

`EmiReplayProvider` calls `getDatasourceSubscriptionRegistry(pluginsManager)`
before it starts the worker. That line looks pointless — the result is thrown
away, and the run store builds the registry itself — and it is load-bearing.

The registry learns which datasources are ready from a `DATASOURCE_READY`
listener it registers **in its constructor**. A READY fired before the registry
existed is a READY it never hears, and `subscribe` for a datasource it does not
know to be ready does not fire `-subscribe`: it parks the intent waiting for a
READY that has already happened and will not repeat.

On this page that ordering was not a race, it was a guarantee. The run store
built the registry inside `startIngest`, which needs a resolved topic bundle,
which needs `listTopics`, which needs `init` — the very call whose resolution
fires READY. So the registry was always born too late, every EMI wire stayed
idle, the worker was never asked to subscribe, autoplay (deferred to the first
subscribe) never fired, and the bag never played.

The symptom is worth recognising because it looks like nothing is wrong: the
datasource connects, the badge goes green, topic discovery resolves a full
bundle, and every panel sits on "Connecting to 'EMI'…" forever. The foxglove and
rosbridge plugins build the registry in their own providers, which is why they
never showed this.

### Provenance comes off the settings, not off an id

`isReplay` reads `bagName` from the topic's settings. It used to compare
`datasource_id` against the definition id, which is always false: on a
`Datasource` record `datasource_id` _is_ the definition id, but on a
`DatasourceTopic` every plugin sets it to `settings.id` — the per-instance
`datasource_<uuid>` core mints when the source is added. Same field name, two
meanings. The test fixture carried the definition id, a value the runtime never
produces, so the bug passed its tests; the only symptom was every replayed
survey being archived and exported as though collected live.

### Nothing fails silently

Four failures used to end in the console with ten panels reading "offline" and
nothing connecting the two. Each now says what happened _and_ what to do, at the
place the operator can act:

| failure                        | caught                               | where it is said                                                                               |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Too large                      | before any read                      | the picker refuses, with the ceiling and the `ros2 bag convert` advice                         |
| Not a SQLite file              | a 16-byte range read                 | the picker — this catches `metadata.yaml` and `.mcap` for one small read instead of a gigabyte |
| The read itself fails          | `try`/`catch` around `arrayBuffer()` | the picker, with `NotReadableError` translated into its three real causes                      |
| Not a rosbag2, or no EMI topic | the worker, after opening            | the panels, in place of the offline card                                                       |

`NotReadableError` deserves the translation. The browser snapshots a picked file
and revalidates it at read time, so its own wording ("permission problems")
sends people to `chmod`, which is almost never it. The three real causes are: the
bag is still being written (`ros2 bag record` running, or a `-wal`/`-journal`
sibling), the file is somewhere a **Snap or Flatpak** browser cannot reach
(`/mnt`, `/media`, another user's home), or it moved.

**How the worker reports.** `init` deliberately does not reject — the host calls
`listTopics` from inside the `AVAILABLE_TOPICS` filter chain, which has no
per-filter isolation, so a rejection would take topic discovery down for _every_
datasource in the app. But not rejecting must not mean not reporting.
`DatasourceWorkerContext` has no failure channel and core is immutable, so the
worker posts a plain message of its own: core's RPC client dispatches only on
`rpc/response` and `rpc/event`, so an unknown `type` passes it by untouched and
the provider — which owns the `Worker` object — picks it up and writes it into
`replay-status.ts` for the panels to render.

## The cockpit

Ten widgets and a page at `/plugin-pages/teodor-emi`, plus the standard map
widget carrying this plugin's four marker types. The panels are contributed by
the **page**, for as long as it is open — see below for why that is not the same
as registering them from the plugin constructor.

Two animated explainers were built and then removed: `emi-walkthrough`, five
pipeline stages on a playhead, and `emi-row-model`, a synthetic pass over a
synthetic object. Both taught the pipeline well and neither showed the operator
their own survey, which is what a cockpit panel is for.

### The page runs the FLEX engine, not GRID

A grid gives every panel a rectangle in fixed 30 px row units, and these panels
do not want rectangles — they want **shares of the window**. The signal stack is
five coil panels dividing whatever height exists; the rail should stay a
full-height column on a laptop and on a 4K display. On the grid each of those
was a number chosen for one screen size, and a shorter window pushed panels below
the fold instead of making them smaller.

The rail sits on the outside edge, not between the panels. It is a control
surface rather than a reading, and in the middle it split the two things it
changes — comparing a signal against the map meant looking past the sliders.

FlexLayout also gives something the grid cannot express: **tabsets**. Mission
control and the exporter bracket a survey and are idle in between, so they share
one tab strip rather than spending a third of a column each.

The engines namespace their state — `layouts["grid"]` versus `layouts["flex"]` —
and a layout under the wrong key is not an error anywhere: the engine finds
nothing and falls back to stacking every panel into one tab strip, which reads as
a broken cockpit rather than a misconfigured one. Hence the local-storage key
moved to `teodor-emi-cockpit-v2` with the engine change, the restore refuses a
payload with no `flex` key, and `default-cockpit.test.ts` asserts that every tab
names a widget and every widget has a tab.

### The panels belong to the page, not to the app

`WIDGETS_LIST` is global. A plugin that pushes onto it from its constructor
offers every panel to every workspace in the app — and an EMI panel on a
dashboard with no EMI run behind it resolves no source and renders an offline
card, so that was ten wrong answers in every picker.

The cockpit page registers them instead, in a layout effect, and removes them on
unmount. The page holds the shell's own `loading` skeleton until the filter is
in place, because the shell reads `WIDGETS_LIST` during **render**: without that
gate the first render resolves an empty registry and the restored cockpit comes
back as a row of "widget not found" tiles.

The map is the exception and stays global — it is the standard map widget, and
this plugin only contributes marker types to it.

### One cursor, two pictures

The charts and the map show one recording, so pointing at either puts a playhead
on the other. Both directions write the same `emiCursorAtom` the time panels
already share — one piece of state, so they agree rather than approximately
agree.

**Map → panels** uses maplibre's own layer-scoped listeners
(`map.on("mousemove", layerId, …)`), not react-map-gl's `interactiveLayerIds`:
that prop lives on the `<Map>` element and the `<Map>` element belongs to the
standard map widget, so listening directly is the difference between a feature
here and a change to `ormi-std-widgets`. Each feature carries the index the
cursor speaks in and the sample the export key is built from, so the handler
needs no lookup back into the replay. Only the _replayed_ detections are
listened on — the recorded marks are what the robot decided on the day and hold
no index into the current replay, so a cursor set from one would name a
detection that is not the one under the pointer.

**Panels → map** draws two marks. The robot at the cursor's time — nearest fix
sample, found by binary search over the timebase, because a survey is a hundred
thousand samples and this runs on every pointer frame — with a halo so it stays
findable at whole-survey extent. And a ring around the detection under the
cursor, so pointing at a peak on the chart and at its mark on the map name the
same thing. The overlay is rendered by the detections layer and only there: all
three layers would collide on source id.

Clicking a mark on the map picks it for export, exactly as clicking a peak does.
A survey is read on the map, and having to go and find the same detection in a
time series in order to select it is the wrong way round. The discriminator is
the feature's `det`, not its `target`: a replayed detection carries **both** — its
own index and the id of the target it belongs to — so branching on `target` first
made a detection click select the chain and a barycentre click select the chain
rather than the barycentre.

### Picking marks by hand

Export takes a hand-picked subset, and **a click picks the mark that was clicked
and nothing else** — in either direction. A detection does not drag in the target
it was folded into, and a **barycentre does not drag in the detections it
averages**.

That last one is the point of having barycentres at all. A target is its own
exportable object: an operator who picks the averaged position of four passes
wants that position, not the four detections behind it, and the members are one
click each when they _are_ what is wanted. Picking briefly expanded a click into
the whole chain — plausible, and wrong: picking is a manual tool, so a click that
quietly adds three more marks elsewhere is the tool deciding instead.

Two key spaces in one set, disjoint by construction rather than by convention:
`coil:iPeak` for a detection, `t:<id>` for a target. Never indices into `geoNew`
or `targets` — an index means nothing across a parameter change, since moving the
threshold rebuilds the list and index 3 is now a different detection, and a
selection stored that way would silently export marks nobody picked.

The two keys are not equally durable, and the difference is worth knowing. A
coil and the sample it peaked on are properties of the _recording_: a detection
that survives a parameter change keeps its key. A target id is a position in the
associator's output, which the next parameter change renumbers — so a picked
barycentre is a pick on the current association. Either way a key that no longer
matches is counted in the export's `selection_unmatched` rather than dropped
quietly, and `selected` counts both kinds.

One consequence to keep in mind when reading an export: a picked barycentre
arrives with no detections under it. That is not a broken document — it is the
averaged position, exported as the thing it is.

Empty means everything. An operator who has picked nothing wants the survey, not
a file with no features in it.

### The cockpit saves itself

The shell saves only when its save button is pressed. On a workspace dashboard
that is right — a save is a deliberate edit to a document other people open.
Here it is not: the layout, the widget settings and the datasource list are one
operator's working setup, lost to a reload and paid for by the person who
arranged them.

So `CockpitAutosave` (in `emi-mission-page.tsx`) turns the shell's own change
detection into a write: when `hasChanged` goes true it calls the same `save()`
the toolbar button calls, a second later. Two things follow from _where_ it sits
rather than from anything it does — the shell renders a skeleton instead of its
children until `onLoad` resolves, so it cannot exist during the window where it
would overwrite the saved cockpit with the default one; and `hasChanged` is
false until the state really differs, so it cannot write a no-op.

It re-arms on `hasChanged`, not on the state, which makes it a throttle rather
than a debounce — a continuous splitter drag is written about once a second
instead of once at the end, so a drag that never quite settles is still saved.

Storage is per-browser (`packages/utils` has a `useLocalStorage`, but its writes
return `void`, and a silently swallowed quota error is exactly what autosave
must not have — the page keeps the raw `setItem` so `onSave` can report failure).
The bag's bytes are, as ever, not in there: a restored datasource comes back
with a key whose buffer this page's memory has never held, and waits for the
file to be picked again.

### One run, one replay, one subscription

`src/state/emi-store.ts` is a `globalThis`-pinned module singleton holding the
current `EmiRun` and a refcount. The first widget to mount starts topic
discovery and the subscriptions; the last to unmount stops them. Widgets read it
through `useSyncExternalStore` with an identity-stable, change-fresh snapshot —
the React-Compiler rule in `AGENTS.md`, not a preference.

`useEmiReplay()` memoises **one** replay across every mounted panel, keyed on the
run revision and the parameter object's identity. Parameters are read through
`useDeferredValue`, which is the coalescing the tuning loop needs: a slider that
invalidates the rolling medians must not recompute the baseline per pixel of
travel.

The timebase is `/teodora/emi/gnss` — nothing else is sampled at the EMI rate, so
nothing else can define the row index every per-sample column is keyed on. The
other topics are latest-wins and are read when a sample lands. `/emi/raw` is still read
and still stored, though nothing displays it since the walkthrough was removed —
the detector never touched it either. Dropping the subscription and its five
columns would shrink every stored mission, and would change the mission format,
so it is a deliberate separate change rather than a tidy-up.

### The EMI device's stamps are not monotonic, and that is not a seek

Measured across the reference set (`~/Repos/RMA/emi_ws/bags`, ten readable
recordings, ~230 000 EMI samples): **every** recording carries samples whose
`header.stamp` is _behind_ the one before it, at 0.07 %–3.04 % of samples, with
backwards jumps of up to **53 seconds** while the recorder's own clock advanced
14 ms. They are isolated — the sample after is back on cadence — and the longest
run of consecutive out-of-order samples anywhere in the set is **two**.

The builder used to read any backwards step over 0.5 s as a replay seek and
rebuild the run from it. On a 21-minute survey that fired **136 times**, and the
cockpit showed 233 samples over 10 seconds out of 41 385 over 1283 — the tail
after the last reset. Every panel was correct about a recording that was 0.6 %
of the one that had been opened, which is the failure mode worth naming: nothing
errored, nothing was empty, and the numbers were real.

The discriminator is persistence, not magnitude (a bad stamp is _larger_ than
most seeks): a seek stays behind the run's high-water mark forever, an outlier
does not. `SEEK_CONFIRM_SAMPLES = 8` sits well clear of the observed artefact and
still confirms a genuine seek within a quarter of a second. An out-of-order
sample is dropped and counted in `BuilderStatus.droppedOutOfOrder`; the same
mechanism bounds the damage from a _forward_ stamp jump to eight samples.

The same measurement pass found two recordings whose SQLite image is malformed
and one too large to open — worth knowing before blaming the cockpit for a bag
that will not load.

### The map draws the recording's transform tree, not an inferred rake

`EmiRun.frameTree` carries every `tf_static` frame resolved into `base_link` and
flattened to 2-D (`resolveFrameTree`). Nothing in the detector reads it — the
rake in `offsets` is what places a detection — and it exists so the map's robot
ghosts can be stroked edge for edge and node for node, as the offline report
draws them. A ghost inferred from five coil offsets is a shape, and a shape can
be drawn plausibly while the georeferencing behind it is wrong; the real tree
carries the antenna, the GNSS receiver, the lidar and the camera boom (16 nodes,
15 edges on this robot), so the ghost has a front, a back and a known scale.

Two things it must get right, both of which were wrong at some point:

- **The pose indices are the placement's**, resolved through the exported
  `poseIndices()` against the `GeoConfig` the replay published — not `iPeak` for
  both position and heading.
- **The tree is shifted onto the georeferencing frame's origin** before it is
  rotated. `GeoConfig.frame` travels with the result for this; drawing a
  `base_link` tree against an `xsens_link` fix displaces the robot by the lever
  arm, which is the exact quantity the frame choice exists to expose.

It rides in `MissionHeader.frameTree` as an optional field — a header written
before it existed reads back as absent and the map draws no ghosts, which is what
it did then, so no format bump.

### Why the charts are canvas and not uPlot

This was an open question in the plan and the answer is canvas. uPlot is a
dependency of the monorepo and the standard time-series widget uses it, so the
reuse instinct was right — but it is the wrong tool for these panels, for reasons
about the data rather than about taste:

- **Decimation.** A survey is 10⁵ samples per coil; five coils × two traces is a
  million points per repaint. uPlot has no decimation, so holding the budget
  means reducing to one min/max pair per pixel column first — which is the whole
  of `strokeMinMax`. Having done that, uPlot is left drawing axes.
- **One vertical scale across five instances.** The coil panels are a single
  comparison; five uPlot instances each own their scale.
- **Per-pixel moving threshold curves and the band between them**, and the
  **cross-coil links drawn between panels**, need a canvas spanning the stack
  regardless of what draws inside each one.

The substrate is `src/charts/canvas-chart.ts`: DPI, ticks, a floored log
projection, min/max decimation. Roughly forty lines of axis code buy the rest.

### What each panel is for

| widget                  | question it answers                                                         |
| ----------------------- | --------------------------------------------------------------------------- |
| `emi-coil-signal-stack` | What did each coil see, against the threshold it was actually judged by?    |
| `emi-motion`            | Was this stretch a survey at all — or was the robot parked, or turning?     |
| `emi-coil-array`        | Where is an object relative to the rake, and which coil should see it next? |
| `emi-params-rail`       | Every number that changes the result, with the result beside it.            |
| `emi-threshold-sweep`   | How much of the difference is the algorithm rather than the setting?        |
| `emi-lag-scatter`       | Does the cross-coil geometry hold?                                          |
| `emi-repeatability`     | Does a detection come back on another pass?                                 |
| `emi-tables`            | The counts, the targets, and whether the replay reproduces the recording.   |
| `emi-mission-control`   | Start a survey, stop it, reopen a stored one.                               |
| `emi-export`            | Write the run out as GeoJSON, with the tuning it was read at.               |

Four map marker types (`TeodorEMITrack`, `TeodorEMIDetections`,
`TeodorEMITargets`, `TeodorEMIGhosts`) extend the standard map widget. They draw
the **shared replay**, not their selected topic, so the marks on the map answer
to the parameter rail; the topic only names the layer and scopes its toggle. The
shipped cockpit places the map with all four configured — they were registered
and shipped for a while with nothing on the page showing them, which made "where
the detections land" something you had to know to go and add.

Picking is wired on **invisible hit layers** — a transparent circle of radius 11
on the same source, drawn beneath the visible mark. maplibre's delegated
listeners query a single pixel, so a 4-pixel mark demanded 4-pixel aim. The
listeners are also bound unconditionally rather than behind a `map.getLayer`
check: maplibre re-resolves a delegated listener's layers on every event, so
binding before the layer exists is free and self-healing, while the check made
the binding depend on whether the effect ran before or after react-map-gl added
the layer — a race that silently dropped picking for the rest of the session.

`TeodorEMITrack` is the driven path, and it is the layer the other three are read
against: a detection means "here", a target means "here, more than once", and
neither can be judged without the ground the robot actually covered — marks with
no path through them cannot distinguish a stretch that was surveyed and clear
from one that was never surveyed. The rules live in `map-markers/driven-track.ts`
so they can be tested, because both are invisible on screen:

- **Thinned to 0.15 m between vertices**, well under the coil spacing, so nothing
  the map is asked to judge changes. On a 21-minute survey that is 1193 vertices
  from 41 105 samples.
- **Broken, never bridged**, wherever the fix went away or jumped more than 5 m
  between consecutive samples. A track that silently spans a dropout looks
  exactly like one that does not, and on a coverage map it asserts the opposite
  of what happened.

### Deviations worth knowing

- **The rail is not JSON Forms.** JSON Forms produces a form; the rail's value is
  that a parameter can be dragged and the panels answer while the finger is down.
  The widget's own settings schema is JSON Forms like every other widget's.
- **The run library is in memory and session-only.** Repeatability compares runs
  opened one after another in the same tab; switching the replay source, or
  opening a stored mission, archives the run it replaces (capped, oldest
  dropped). The _missions_ are persisted; this in-session comparison list is not.
- **The trust tab verifies less than the offline tool does.** It compares the
  replayed _shipped_ detector against the alerts the recording contains — never
  the current detector, which the recording did not produce. The offline tool
  additionally checks offset removal and bit-exact EMA against `pipeline.py`;
  those need a reference implementation and are not claimed here.

## Recording a mission

`src/mission/` turns the ingest into a survey with a beginning and an end. The
ingest itself changes nothing: it has been building a run from whatever source is
wired since the first panel mounted. What a mission adds is a **boundary** the
operator drew, and **durability**.

### The states

`idle → recording → stopped`, and back to `idle` on discard or on the next start.
There is deliberately no `paused`: a gap in a survey is a gap in the _ground
covered_, and a run whose timebase silently skips four minutes would draw a
straight line through unswept terrain on every map in the cockpit.

Pressing record clears the run first — the mission's first sample is the one
after the press, not whatever the page had accumulated since it was opened.
Stopping does **not** disconnect: the source keeps streaming into the run, which
is then longer than the mission inside it.

### Why the run is persisted, and not the messages

The plan called for a recorded mission to replay back through
`teodor-emi-replay-source`, the same path a `.db3` takes. It does not, for two
reasons that only became visible once the ingest existed:

- **There are no messages to persist.** The subscription registry hands the
  ingest _decoded_ values; the CDR frames are consumed and released inside the
  datasource worker. Writing a bag would mean re-encoding every message from a
  run they have already left.
- **The acceptance test is identity.** "Stop a mission, reopen it offline, get
  identical numbers" is a property of the format. An `EmiRun` is the input to
  every panel, the detector and the exporter; persisting it and loading it back
  _is_ identity. Round-tripping through synthesised messages would re-run
  timebase resolution, tf lookup and georeferencing, and would have to be argued
  to be lossless rather than being so by construction.

### Chunked spill

A survey is tens of megabytes of typed arrays, so rewriting the whole run every
few seconds would spend the budget copying data that has not changed. The
columns are append-only, so `run-codec.ts` writes a fixed block of samples
(`CHUNK_SAMPLES = 2048`, about a minute at 32 Hz) once and never touches it
again. What a crash costs is the tail of the last incomplete block.

The header is rewritten behind every block, because it carries the sample count
and the sparse alert and target lists — recovery clamps to the count it finds, so
a stale header would discard exactly the samples the spill existed to save.

Reassembly **enforces contiguity**. A mission interrupted mid-write can leave a
hole, and copying the later blocks in at their recorded offsets would leave a
band of zeros in the middle of the survey: flat signal at latitude zero, which
reads as _data_ and not as _absence_. The run stops at the hole and reports what
was lost.

`endedAt === null` is the whole recovery signal: the header is written on the
first commit and only an explicit stop fills it in, so a header still carrying
null on the next page load is a mission the browser was closed on. It is offered
as interrupted rather than tidied away.

**Recovery trusts the chunks, not the header.** The header is rewritten _after_
its blocks, so a crash in that window leaves it claiming the count from the
previous spill — three samples, after the first one. Clamping the reassembly to
that would hand back a three-sample mission with nothing missing and no warning,
which is the one outcome the chunked format exists to prevent. The header's count
is used only to _report_ what was lost.

### Two guards that are not where they look like they belong

**A generation token, not a busy flag.** A spill is a loop of awaits, and start
or discard can land in the middle of one. The loop therefore captures an epoch
and re-checks it after every write; without that it would carry on writing the
previous run's samples under the _next_ mission's id, at the previous mission's
offsets — producing a mission whose first block is missing, which then recovers
as empty. Stop is the one caller that _waits_ for an in-flight spill rather than
skipping it: skipping is how a survey loses its last minute at the exact moment
the operator pressed stop.

**Run identity is checked at the commit, not inside the spill.** The spill is
only _called_ once a whole block has accumulated, so a guard living inside it
cannot see a run that shrank — and by the time the replacement has grown past the
old offset the evidence is gone. It compares the run **object**, because
`EmiRunBuilder.reset()` (a confirmed seek, or an explicit clear) rebuilds a fresh
run under the _same id_.

### Failure is a state, not a message

Once a write fails, no further spill is attempted — so `writeFailed` is carried
separately from the error line and rendered as its own standing banner. An error
string cleared by the next successful action (re-reading the mission list happens
on every widget mount) would remove the warning permanently while the survey
quietly stopped being written down.

### Adoption

Opening a stored mission does not go through a datasource. `adoptEmiRun()` puts
the loaded run in the store's snapshot, and the live ingest **stops** for as long
as it is shown — a message arriving meanwhile would append to a builder nothing
is displaying. `emiHealth` therefore keys on "a run with samples", not on "a
bundle is wired": gating on the bundle would show _offline_ over a complete
survey.

### Storage

IndexedDB (`ormi-teodor-emi`, stores `missions` and `chunks` keyed
`[missionId, seq]`), behind a `MissionStorage` interface. The interface is not
ceremony: the state machine is where the interesting mistakes live — spill
accounting, recovery, stop while a write is in flight — and it lets those be
tested against an in-memory double instead of a browser database the test runner
does not have. The same double is the honest fallback where IndexedDB is refused,
and the widget says so rather than letting the operator discover it at the end of
the day.

## Export

`src/mission/geojson.ts` writes the run out as a `FeatureCollection`, built and
downloaded entirely in the page — nothing is uploaded, because the tool has to
work on a laptop in a field and the survey is the operator's data to move.

Three points matter:

- **The parameters travel in the file.** A detection list is a function of its
  tuning: the same recording at a MAD factor of 8 and of 20 is two different
  maps, both honest. The whole `EmiParams` goes into the collection's foreign
  `properties`, so a reading can be reproduced and defended six months later.
- **Three kinds of target, kept apart.** The robot's two trackers each publish
  targets and the replay computes its own; they routinely disagree, and that
  disagreement is often the finding. `source` (`fixed+gate`, `fixed+chain`,
  `replay`) keeps them stylable apart rather than merged into one
  authoritative-looking layer.
- **Absence is `null`, never `0`.** A chain-associated target consulted no gate;
  exporting `gate_used: 0` would state a gate of zero metres.
- **A feature that cannot be placed is dropped and counted.** `NaN` reaches the
  exporter by two ordinary routes — a robot target published with no fix
  sub-message, a detection georeferenced from a fixless sample — and
  `JSON.stringify` writes it as `[null, null]`, which is not a position. _One_
  such feature makes the whole document fail to load in QGIS, so the collection
  carries an `unplaceable` count instead.

Tracks are decimated to a 0.25 m floor — well below the rake's own 0.4 m row
spacing, so no manoeuvre the geometry can resolve is lost, while the jitter of a
32 Hz antenna is. Two details follow from what a track _claims_:

- **A dropout cuts the line.** A gap in the fix longer than half a second ends
  the feature and starts a new one. Bridging it would draw the robot straight
  across ground it never swept — the same lie the mission state machine refuses
  to tell by having no `paused` state. A robot standing still is not a gap: the
  test is on the last sample that _had_ a fix, not the last vertex kept.
- **Coil tracks are thinned against each coil's own travel.** A pivot moves the
  body a few centimetres while a coil 0.4 m out sweeps an arc; decimating on the
  body would chord straight across it, in the one layer whose entire purpose is
  what was actually swept.

## The detector

`src/detector/` is a pure port of `report/detector.js`, which is itself verified
against `pipeline.py` and the C++ nodes. Two details are load-bearing and must
not be "cleaned up": `Math.trunc` in the EMA (the C++ assigns through an `int`
every sample) and the truncated integer release threshold.

It is held to the reference by a committed fixture — 4000 real samples, the seven
parameter sets `check_js.py` pins, compared detection for detection with exact
integer amplitude equality. Regenerate with
`src/detector/__tests__/fixtures/generate.py` against an `emi_ws` checkout.

Deliberate deltas from the reference are listed in `src/detector/index.ts`: a
non-finite heading is guarded (unguarded, it turns every `>` acceptance test
into an unconditional accept and collapses a run into one target), and the
cross-coil spatial hash is sized on `hypot(along, cross)` rather than `max`.
