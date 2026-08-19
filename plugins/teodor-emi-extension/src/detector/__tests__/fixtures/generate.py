#!/usr/bin/env python3
"""Freeze a slice of a real recording, plus what the Python reference makes of
it, as a fixture the TypeScript detector is tested against.

This is the third link in the chain the source toolchain already maintains:

    C++ on the robot  ==  emi_ws/tools/pipeline.py   (pipeline.py --verify)
    pipeline.py       ==  report/detector.js         (emi_ws/tools/check_js.py)
    pipeline.py       ==  this plugin's detector     (the fixture below)

Run it from an `emi_ws` checkout that has a populated `bags_cache/`; the output
is committed so the tests need neither ROS, nor the bags, nor this script:

    python3 generate.py --emi-ws ~/Repos/RMA/emi_ws --bag track3_1 --samples 4000

The slice is contiguous and starts at sample 0, so the EMA warm-up and the MAD
baseline are identical on both sides. It is not meant to reproduce any
particular recording's totals — only to make the two implementations agree
sample for sample on the same input.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import sys
from pathlib import Path

import numpy as np

# The parameter sets check_js.py pins, verbatim: the shipped defaults, the
# recorded behaviour, and the corners where two implementations could plausibly
# disagree — hysteresis boundaries, a dwell that suppresses, a gate that never
# opens, and both MAD configurations.
PARAM_SETS = [
    dict(label="shipped", threshold=5000, ratio=0.75, dwell=0.0, alpha=0.45,
         frame="xsens_link", yawAt="peak", mode="schmitt",
         gate=0.45, gateMode="covariance", sigmaRef=0.15, minScale=0.30, sigmaMax=0.60),
    dict(label="legacy", threshold=5000, ratio=1.0, dwell=0.0, alpha=0.45,
         frame="base_link", yawAt="release", mode="legacy",
         gate=0.45, gateMode="covariance", sigmaRef=0.15, minScale=0.30, sigmaMax=0.60),
    dict(label="low-threshold", threshold=600, ratio=0.85, dwell=0.0, alpha=0.45,
         frame="xsens_link", yawAt="peak", mode="schmitt",
         gate=0.45, gateMode="fixed", sigmaRef=0.15, minScale=0.30, sigmaMax=0.60),
    dict(label="dwell", threshold=5000, ratio=0.75, dwell=2.0, alpha=0.45,
         frame="xsens_link", yawAt="peak", mode="schmitt",
         gate=0.9, gateMode="fixed", sigmaRef=0.15, minScale=0.30, sigmaMax=0.0),
    dict(label="mad-15", threshold=5000, ratio=0.75, dwell=0.0, alpha=0.45,
         frame="xsens_link", yawAt="peak", mode="schmitt",
         gate=0.45, gateMode="covariance", sigmaRef=0.15, minScale=0.30, sigmaMax=0.60,
         detector="mad", madFactor=15.0, madBaselineS=16.0, madDetectS=0.5,
         madRearm=0.8, madFreeze="off", madStride=8),
    dict(label="mad-30-frozen", threshold=5000, ratio=0.75, dwell=0.0, alpha=0.45,
         frame="xsens_link", yawAt="peak", mode="schmitt",
         gate=0.9, gateMode="fixed", sigmaRef=0.15, minScale=0.30, sigmaMax=0.0,
         detector="mad", madFactor=30.0, madBaselineS=8.0, madDetectS=0.25,
         madRearm=0.6, madFreeze="on", madStride=8),
    dict(label="odd-alpha", threshold=3000, ratio=0.55, dwell=0.5, alpha=0.15,
         frame="xsens_link", yawAt="release", mode="schmitt",
         gate=0.45, gateMode="covariance", sigmaRef=0.5, minScale=0.30, sigmaMax=5.0),
]


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def load_arrays(sv, name: str, n_max: int):
    """Decode the payload the browser would receive, sliced to n_max samples."""
    payload = sv.BagPayload(name)
    meta = payload.meta
    ncoil = len(meta["coil_ids"])
    blob = payload.blob

    A = {}
    for key, spec in meta["layout"].items():
        dt = np.float32 if spec["dtype"] == "f4" else np.int32
        cnt = int(np.prod(spec["shape"]))
        A[key] = np.frombuffer(blob, dtype=dt, count=cnt, offset=spec["offset"])

    n = min(int(meta["n_samples"]), n_max)
    sliced = {
        "sig1": A["sig1"].reshape(-1, ncoil)[:n].astype(np.int32),
        "sig2": A["sig2"].reshape(-1, ncoil)[:n].astype(np.int32),
        "t": A["t"][:n].astype(np.float64),
        "sx": A["sx"][:n].astype(np.float64),
        "sy": A["sy"][:n].astype(np.float64),
        "syaw": A["syaw"][:n].astype(np.float64),
        "ssig": A["ssig"][:n].astype(np.float64),
    }
    return meta, sliced, n, ncoil


def reference(pl, meta, S, n, ncoil, p):
    """Run the Python reference over the sliced arrays."""
    sig1 = S["sig1"].astype(np.int64)
    sig2 = S["sig2"].astype(np.int64)
    t = S["t"]

    params = pl.Params(
        atr_threshold=p["threshold"], atr_release_ratio=p["ratio"],
        atr_rearm_dwell_s=p["dwell"], atr_mode=p["mode"], ema_alpha=p["alpha"],
        gnss_frame=p["frame"], yaw_at=p["yawAt"],
        gate_base_m=p["gate"], gate_mode=p["gateMode"],
        gate_sigma_ref_m=p["sigmaRef"], gate_min_scale=p["minScale"],
        gate_sigma_max_m=p["sigmaMax"],
        detector=p.get("detector", "fixed"),
        mad_factor=p.get("madFactor", 15.0),
        mad_baseline_s=p.get("madBaselineS", 16.0),
        mad_detect_s=p.get("madDetectS", 0.5),
        mad_rearm=p.get("madRearm", 0.8),
        mad_freeze=p.get("madFreeze", "off") == "on",
        mad_stride=p.get("madStride", 8),
    )

    f1 = pl.ema_filter(sig1, params.ema_alpha)
    f2 = pl.ema_filter(sig2, params.ema_alpha)
    if params.detector == "mad":
        value = np.maximum(f1, f2)
        rate = meta["sample_rate_hz"]
        wb = max(8, int(math.floor(params.mad_baseline_s * rate + 0.5)))
        wd = max(1, int(math.floor(params.mad_detect_s * rate + 0.5)))
        med, mad, det = pl.mad_baseline(value, wb, wd, params.mad_stride)
        dets = pl.run_mad(t, value, meta["coil_ids"], med, mad, det, params)
    else:
        dets = pl.run_atr(t, f1, f2, meta["coil_ids"], params)

    offs = meta["coil_offsets"].get(p["frame"], {})
    idx_of = {round(float(x), 6): i for i, x in enumerate(t)}
    geo = []
    for d in dets:
        key = d.t_published if params.atr_mode == "legacy" else d.t_peak
        i_pos = idx_of.get(round(float(key), 6))
        i_rel = idx_of.get(round(float(d.t_release), 6))
        if i_pos is None or i_rel is None:
            continue
        i_yaw = i_rel if params.yaw_at == "release" else i_pos
        off = offs.get(str(d.coil))
        if off is None:
            continue
        yaw = float(S["syaw"][i_yaw])
        cy, sy = np.cos(yaw), np.sin(yaw)
        geo.append({
            "t": float(t[i_pos]), "coil": int(d.coil), "amp": int(d.amplitude),
            "x": float(S["sx"][i_pos]) + cy * off[0] - sy * off[1],
            "y": float(S["sy"][i_pos]) + sy * off[0] + cy * off[1],
            "sigma": float(S["ssig"][i_pos]),
        })

    targets = track_metres(pl, geo, params)
    return {
        "label": p["label"],
        "nDets": len(geo),
        "nTargets": len(targets),
        "dets": [[round(g["t"], 4), g["coil"], g["amp"],
                  round(g["x"], 4), round(g["y"], 4)] for g in geo],
        "targets": [[t_["n_detections"], t_["best_amp"], round(t_["best_x"], 4),
                     round(t_["best_y"], 4), 1 if t_["degraded_fix"] else 0]
                    for t_ in targets],
    }


def track_metres(pl, geo, params):
    """Association in local metres — the identical rule as the C++."""
    targets = []
    for d in geo:
        sigma = d["sigma"] if np.isfinite(d["sigma"]) else 0.0
        gate = pl.gate_for(sigma, params)
        best, best_d = None, float("inf")
        for t in targets:
            dd = float(np.hypot(d["x"] - t["cx"], d["y"] - t["cy"]))
            if dd < best_d:
                best_d, best = dd, t
        if best is not None and gate > 0.0 and best_d <= gate:
            best["members"].append(d)
            n = len(best["members"])
            best["cx"] += (d["x"] - best["cx"]) / n
            best["cy"] += (d["y"] - best["cy"]) / n
            if d["amp"] > best["best_amp"]:
                best["best_amp"] = d["amp"]
                best["best_x"], best["best_y"] = d["x"], d["y"]
        else:
            targets.append({
                "members": [d], "cx": d["x"], "cy": d["y"],
                "best_amp": d["amp"], "best_x": d["x"], "best_y": d["y"],
                "degraded_fix": gate == 0.0,
            })
    for t in targets:
        t["n_detections"] = len(t["members"])
    return targets


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--emi-ws", required=True, type=Path,
                    help="path to the emi_ws checkout")
    ap.add_argument("--bag", default="track3_1",
                    help="substring of the cached bag name to use")
    ap.add_argument("--samples", type=int, default=4000)
    ap.add_argument("--out", type=Path,
                    default=Path(__file__).with_name("detector-reference.json"))
    args = ap.parse_args()

    sys.path.insert(0, str(args.emi_ws / "tools"))
    import pipeline as pl  # noqa: E402
    import serve as sv  # noqa: E402

    names = [n for n in pl.list_bags([]) if (sv.CACHE / f"{n}.npz").exists()]
    match = [n for n in names if args.bag in n]
    if not match:
        print(f"no cached bag matching {args.bag!r}; have: {names}", file=sys.stderr)
        return 2
    name = match[0]

    meta, S, n, ncoil = load_arrays(sv, name, args.samples)
    cases = [reference(pl, meta, S, n, ncoil, p) for p in PARAM_SETS]

    doc = {
        "_comment": "Generated by generate.py from the Python reference. "
                    "Do not hand-edit; regenerate against emi_ws instead.",
        "bag": name,
        "n": n,
        "ncoil": ncoil,
        "coilIds": [int(c) for c in meta["coil_ids"]],
        "sampleRateHz": float(meta["sample_rate_hz"]),
        "coilOffsets": {
            frame: {str(k): [float(v[0]), float(v[1])] for k, v in offs.items()}
            for frame, offs in meta["coil_offsets"].items()
        },
        "arrays": {k: b64(v) for k, v in S.items()},
        "params": PARAM_SETS,
        "cases": cases,
    }
    args.out.write_text(json.dumps(doc))
    total = sum(c["nDets"] for c in cases)
    print(f"{args.out} — {name}, {n} samples, "
          f"{len(cases)} cases, {total} detections total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
