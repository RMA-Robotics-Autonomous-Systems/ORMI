/**
 * The EMI detector as ORMI runs it.
 *
 * A port of `emi_ws/tools/report/detector.js`, which is itself a verified port
 * of `tools/pipeline.py` and the C++ nodes. Three implementations have to
 * agree, and the links are checked: `pipeline.py --verify` against the recorded
 * topics, `check_js.py` against the browser detector, and the tests beside this
 * module against the fixtures `check_js.py` produces.
 *
 * Pure TypeScript: no React, no DOM, no datasource. It is fed an
 * {@link EmiRun} and parameters, and returns numbers.
 *
 * ## Intended deltas from `detector.js`
 *
 * This is a fourth implementation alongside the C++, `pipeline.py` and
 * `detector.js`, and the value of that chain is that nothing drifts silently.
 * Where this port deliberately differs, it is listed here rather than left to
 * be discovered as a disagreement:
 *
 * 1. **Non-finite heading is guarded.** `georeference` drops the detection,
 *    `chainTargets` opens a new target, `geometryPairs` drops the pair and
 *    `coilPaths` skips the sample. The reference indexes unguarded, where a
 *    NaN heading silently turns the acceptance tests — all `>` comparisons —
 *    into unconditional accepts and collapses a run into one target.
 * 2. **`trackTargets` sets `confirmed`.** The reference computes it for chain
 *    association only; both associators answer the same question here.
 * 3. **`geometryPairs` sizes its spatial hash on `hypot(along, cross)`** rather
 *    than `max`, which is what the acceptance box can actually reach once the
 *    heading is not axis-aligned. The reference drops those pairs.
 *
 * Everything else — the EMA truncation, the truncated integer release
 * threshold, the legacy shared message stamp, the MAD windows and freeze
 * semantics, the gate ordering and the running centroid — is line-for-line.
 */

export * from "./run-types";
export * from "./params";
export * from "./detector-types";
export * from "./ema";
export * from "./atr";
export * from "./mad";
export * from "./georeference";
export * from "./associate";
export * from "./geometry";
export * from "./replay";
