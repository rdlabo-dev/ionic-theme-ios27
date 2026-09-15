#!/usr/bin/env python3
"""Visualize native/Web screenshot and motion artifacts. Diagnostic only — not parity verdicts."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "ios26-parity-matplotlib"))
os.environ.setdefault("XDG_CACHE_HOME", str(Path(tempfile.gettempdir()) / "ios26-parity-font-cache"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

CONTROLS = ("button", "button-short", "fab", "toggle", "segment", "range", "tabs", "tabs-motion", "search", "alert", "action-sheet", "navigation") + tuple(
    f"tabs-{content}-{count}" for content in ("count", "icons") for count in range(1, 6)
)
APPEARANCES = ("light", "dark")
AMP = 4
ROI = (0, 400, 200, 430)  # x0,x1,y0,y1 pt
TMAX = 1.3
# control, native path, web path or None, web part or None
MOTION = (
    ("button", "Glass/0", "Glass/0", None),
    ("toggle", "Toggle/0/2", None, "handle"),
    ("range", "Range/0/1", None, "knob"),
    ("alert", "window/1/3", "@web-alert", None),
    ("action-sheet", "window/1/3", "@web-action-sheet", None),
)
# UIKit paths verified in kjOhTB/FSpkxf; selection layers can change at handoff.
# Web selectors choose the rendered lens, then the actual checked surface.
# No temporal interpolation and no fabricated zero-sized geometry at handoff.
SHELL_MOTION = (
    ("button", "Glass/0", "Glass/0", None),
    ("segment", "@native-segment", "@web-segment", None),
    ("tabs", "Tabs/0/0/1", "@web-tabs", None),
)
NOTE = (
    "whole-ROI diagnostic RGB MAE for the cropped region; "
    "NOT pass/fail parity or contour metrics"
)


def load_manifest(root: Path) -> dict[str, Path]:
    data = json.loads((root / "attachments" / "manifest.json").read_text())
    out: dict[str, Path] = {}
    for item in data:
        for att in item.get("attachments") or []:
            name, exported = att.get("suggestedHumanReadableName"), att.get("exportedFileName")
            if name and exported:
                out[name] = root / "attachments" / exported
    return out


def find_image(index: dict[str, Path], control: str, renderer: str, appearance: str):
    prefix = f"{control}-{renderer}-{appearance}-rest_"
    for name, path in index.items():
        if name.startswith(prefix):
            return name, path
    return None


def load_metrics(root: Path) -> dict[tuple[str, str, str], dict]:
    out = {}
    build_path = root / "build.json"
    build = json.loads(build_path.read_text()) if build_path.exists() else None
    for path in sorted((root / "metrics").glob("*.json")):
        env = json.loads(path.read_text())
        # Reinstalling a Simulator app can preserve old Documents. Never chart
        # those samples as if they came from the selected build.
        if build and env.get("build") != build:
            continue
        out[(env["control"], env["renderer"], env["appearance"])] = env
    return out


def crop_roi(img: Image.Image, scale: float, overlay: bool = False, bottom: bool = False) -> np.ndarray:
    x0, x1, y0, y1 = (0, img.width / scale, 0, img.height / scale) if overlay else ROI
    if bottom:
        x0, x1, y0, y1 = 0, img.width / scale, max(0, img.height / scale - 150), img.height / scale
    arr = np.asarray(img.convert("RGB"))
    return arr[int(round(y0 * scale)) : int(round(y1 * scale)), int(round(x0 * scale)) : int(round(x1 * scale))]


def comparison(root: Path, index: dict[str, Path], metrics: dict, appearance: str, reference: str) -> list[dict]:
    rows, errors, ref_shape = [], [], None
    ref_label = f"{reference} rest"
    for control in CONTROLS:
        if not any((control, renderer, appearance) in metrics for renderer in (reference, "web")):
            continue
        cells, sources, scales, crops = [], {}, {}, {}
        for renderer in (reference, "web"):
            hit = find_image(index, control, renderer, appearance)
            env = metrics.get((control, renderer, appearance))
            if not hit or not env or not env.get("scale"):
                cells.append(None)
                continue
            name, path = hit
            if not path.is_file():
                cells.append(None)
                continue
            scale = float(env["scale"])
            img = Image.open(path)
            expected = (round(env["width"] * scale), round(env["height"] * scale))
            if img.size != expected:
                raise SystemExit(f"screenshot/viewport mismatch {path.name}: {img.size} vs {expected}")
            crop = crop_roi(img, scale, control in ("alert", "action-sheet", "navigation"), control.startswith(("tabs-count-", "tabs-icons-")))
            sources[renderer], scales[renderer], crops[renderer] = name, scale, crop
            cells.append(crop)
        if reference in crops and "web" in crops:
            a, b = crops[reference], crops["web"]
            if a.shape != b.shape:
                raise SystemExit(f"dimension mismatch {control}/{appearance}: {reference}{a.shape} vs web{b.shape}")
            ref_shape = ref_shape or a.shape
            cells.append(np.clip(np.abs(a.astype(np.float32) - b.astype(np.float32)) * AMP, 0, 255).astype(np.uint8))
            errors.append(
                {
                    "control": control,
                    "appearance": appearance,
                    "reference": reference,
                    f"{reference}_file": sources[reference],
                    "web_file": sources["web"],
                    f"scale_{reference}": scales[reference],
                    "scale_web": scales["web"],
                    "pixel_scale": scales[reference],
                    "rgb_mae": float(np.mean(np.abs(a.astype(np.float64) - b.astype(np.float64)))),
                    "label": NOTE,
                    "kind": "whole-ROI diagnostic",
                    "roi": "bottom 150pt" if control.startswith(("tabs-count-", "tabs-icons-")) else "full viewport" if control in ("alert", "action-sheet", "navigation") else "control strip",
                }
            )
        else:
            cells.append(None)
            errors.append(
                {
                    "control": control,
                    "appearance": appearance,
                    "reference": reference,
                    f"{reference}_file": sources.get(reference),
                    "web_file": sources.get("web"),
                    f"scale_{reference}": scales.get(reference),
                    "scale_web": scales.get("web"),
                    "pixel_scale": scales.get(reference) or scales.get("web"),
                    "rgb_mae": None,
                    "label": NOTE,
                    "kind": "whole-ROI diagnostic",
                    "status": "missing evidence",
                }
            )
        rows.append((control, cells))

    if not rows:
        return errors
    fig, axes = plt.subplots(len(rows), 3, figsize=(9, 2.2 * len(rows)), squeeze=False)
    for r, (control, cells) in enumerate(rows):
        for c, title in enumerate((ref_label, "web rest", f"|RGB|×{AMP}")):
            ax = axes[r][c]
            ax.set_xticks([])
            ax.set_yticks([])
            if r == 0:
                ax.set_title(title, fontsize=10)
            if c == 0:
                ax.set_ylabel(control, fontsize=10)
            img = cells[c]
            if img is None:
                ax.set_facecolor("#f0f0f0")
                ax.text(0.5, 0.5, "missing evidence", transform=ax.transAxes, ha="center", va="center", color="crimson", fontsize=9)
                ax.set_xlim(0, 1)
                ax.set_ylim(0, 1)
            else:
                ax.imshow(img)
    fig.suptitle(f"comparison ({appearance}, ref={reference}) — diagnostic collage, not a parity claim", fontsize=11)
    fig.tight_layout()
    out_name = f"comparison-{appearance}.png" if reference == "native" else f"shell-comparison-{appearance}.png"
    fig.savefig(root / out_name, dpi=120)
    plt.close(fig)
    return errors


def first_anchor(samples: list, allow_down: bool):
    for s in samples:
        if s.get("event") == "pointerdown":
            return float(s["t"]), "pointerdown"
    if allow_down:
        for s in samples:
            if s.get("event") == "down":
                return float(s["t"]), "down"
    return None, None


def pick_layer(sample: dict, path: str | None, part: str | None):
    layers = sample.get("layers") or []
    def visible(layer):
        return layer.get("w", 0) > 0 and layer.get("h", 0) > 0 and not layer.get("hidden", False)
    if path in ("@web-alert", "@web-action-sheet"):
        wrapper = path.removeprefix("@web-") + "-wrapper"
        return next((layer for layer in layers if wrapper in str(layer.get("class", "")).split() and visible(layer)), None)
    if path == "@native-segment":
        return next((layer for target in ("Segment/4/2", "Segment/4/0") for layer in layers
                     if layer.get("path") == target and visible(layer)), None)
    if path in ("@web-segment", "@web-tabs"):
        segment = path == "@web-segment"
        lens = next((layer for layer in layers if "ios26-segment-lens" in str(layer.get("class", "")).split() and visible(layer)), None)
        if segment and lens:
            return lens
        clone = next((layer for layer in layers if "ion-cloned-element" in str(layer.get("class", "")).split() and visible(layer)), None)
        selected = clone or next((layer for layer in layers
            if ("segment-button-checked" if segment else "tab-selected") in str(layer.get("class", "")).split() and visible(layer)), None)
        if selected:
            target_part = "indicator-background" if segment else "native"
            return next((layer for layer in layers if layer.get("path", "").startswith(selected["path"] + "/")
                         and target_part in (layer.get("part") or "").split() and visible(layer)), None)
        return None
    for layer in layers:
        if path is not None and layer.get("path") == path:
            return layer
        if part is not None and part in (layer.get("part") or "").split():
            return layer
    return None


def motion_series(env: dict | None, path: str | None, part: str | None, allow_down: bool):
    if not env:
        return None, None, "missing metrics"
    samples = env.get("samples") or []
    t0, which = first_anchor(samples, allow_down)
    if t0 is None:
        return None, which, "missing event"
    xs, ws, hs = [], [], []
    for s in samples:
        if "layers" not in s:
            continue
        t = float(s["t"]) - t0
        if t < 0 or t > TMAX:
            continue
        layer = pick_layer(s, path, part)
        xs.append(t)
        ws.append(float(layer["w"]) if layer else np.nan)
        hs.append(float(layer["h"]) if layer else np.nan)
    if not xs or not np.isfinite(ws).any():
        return None, which, "missing layer"
    return (np.asarray(xs), np.asarray(ws), np.asarray(hs)), which, None


def motion_plot(root: Path, metrics: dict, reference: str) -> None:
    table = tuple(row for row in (MOTION if reference == "native" else SHELL_MOTION)
                  if any((row[0], renderer, appearance) in metrics
                         for renderer in (reference, "web") for appearance in APPEARANCES))
    if not table:
        return
    fig, axes = plt.subplots(len(table), 2, figsize=(10, 3.2 * len(table)), squeeze=False)
    for r, (control, rpath, wpath, part) in enumerate(table):
        for c, key, ylabel in ((0, "w", "width (pt)"), (1, "h", "height (pt)")):
            ax = axes[r][c]
            drawn, notes = False, []
            for appearance in APPEARANCES:
                for renderer, allow_down, path, p in (
                    (reference, True, rpath, None),
                    ("web", False, wpath, part),
                ):
                    data, which, err = motion_series(metrics.get((control, renderer, appearance)), path, p, allow_down)
                    label = f"{renderer}/{appearance}" + (f" [{which}]" if which else "")
                    if err:
                        notes.append(f"{label}: {err}")
                        continue
                    ts, ws, hs = data
                    ax.plot(ts, ws if key == "w" else hs, label=label, lw=1.2)
                    drawn = True
            ax.set_xlim(0, TMAX)
            ax.set_xlabel("t − anchor (s)")
            ax.set_ylabel(ylabel)
            ax.set_title(f"{control}: {reference} {rpath} vs web {wpath or f'part={part}'}", fontsize=9)
            if drawn:
                ax.legend(fontsize=7, loc="best")
            else:
                ax.text(0.5, 0.5, "missing", transform=ax.transAxes, ha="center", va="center", color="crimson")
            if notes:
                ax.text(0.01, 0.02, "\n".join(notes), transform=ax.transAxes, fontsize=6, va="bottom", color="0.35")
    fig.suptitle("motion (raw pt, event-aligned; no normalization / no fitted shift)", fontsize=11)
    fig.tight_layout()
    out_name = "motion.png" if reference == "native" else "shell-motion.png"
    fig.savefig(root / out_name, dpi=120)
    plt.close(fig)


def short_button_plot(root: Path, metrics: dict) -> None:
    """Keep all five observed press lengths; XCTest target durations are not clocks."""
    if not any(key[0] == "button-short" for key in metrics):
        return
    fig, axes = plt.subplots(5, 2, figsize=(10, 13), squeeze=False)
    entries = []
    for column, appearance in enumerate(APPEARANCES):
        for renderer in ("native", "web"):
            env = metrics.get(("button-short", renderer, appearance))
            if not env:
                continue
            samples = env["samples"]
            downs = [s["t"] for s in samples if s.get("event") == "pointerdown"]
            for index, down in enumerate(downs[:5]):
                up = next((s["t"] for s in samples if s.get("event") == "pointerup" and s["t"] >= down), None)
                stop = min(down + 1, downs[index + 1] if index + 1 < len(downs) else down + 1)
                points = []
                for sample in samples:
                    if not down <= sample["t"] < stop or "layers" not in sample:
                        continue
                    layer = pick_layer(sample, "Glass/0", None)
                    points.append((sample["t"] - down, layer["w"] if layer else np.nan))
                if not points:
                    continue
                ts, ws = np.asarray(points).T
                hold = (up - down) * 1000 if up is not None else None
                peak = int(np.nanargmax(ws)) if np.isfinite(ws).any() else None
                entries.append({"appearance": appearance, "renderer": renderer, "press": index + 1,
                                "hold_ms": hold, "peak_width_pt": float(ws[peak]) if peak is not None else None,
                                "peak_after_down_ms": float(ts[peak] * 1000) if peak is not None else None})
                ax = axes[index][column]
                ax.plot(ts * 1000, ws, label=f"{renderer}: hold {hold:.1f}ms" if hold is not None else renderer)
                ax.set_title(f"{appearance}, press {index + 1}", fontsize=9)
                ax.set_xlabel("ms after pointerdown")
                ax.set_ylabel("width (pt)")
                ax.set_xlim(0, 1000)
                ax.legend(fontsize=8)
    fig.suptitle("Actual short presses — input-aligned, no fitted shift; differing holds are not equal stimuli")
    fig.tight_layout()
    fig.savefig(root / "button-short-motion.png", dpi=120)
    plt.close(fig)
    (root / "button-short-motion.json").write_text(json.dumps({
        "disclaimer": "Diagnostic peaks, not parity acceptance. Compare actual input durations before comparing curves.",
        "entries": entries,
    }, indent=2) + "\n")


def tabs_plot(root: Path, metrics: dict) -> None:
    """Remove the platter transform before comparing lens deformation.

    Delivered input durations and sampling gaps remain visible. No fitted time
    shift or skipped-frame interpolation is used to turn this into a verdict.
    """
    summaries = []
    for appearance in APPEARANCES:
        series = {}
        for renderer in ("native", "web"):
            env = metrics.get(("tabs-motion", renderer, appearance))
            if not env:
                continue
            samples = env["samples"]
            downs = [s for s in samples if s.get("event") == "pointerdown"]
            path = "Tabs/0/0/1" if renderer == "native" else "@web-tabs"
            for index, down in enumerate(downs):
                before = next((s for s in reversed(samples) if s["t"] < down["t"] and "layers" in s), None)
                if not before:
                    continue
                bar0 = pick_layer(before, "Tabs/0" if renderer == "native" else "Tabs", None)
                lens0 = pick_layer(before, path, None)
                if not bar0 or not lens0:
                    continue
                up = next((s for s in samples if s.get("event") == "pointerup" and s["t"] > down["t"]), None)
                if not up:
                    continue
                stop = min(up["t"] + 1.1, downs[index + 1]["t"] if index + 1 < len(downs) else up["t"] + 1.1)
                points = []
                center0 = lens0["x"] + lens0["w"] / 2 - bar0["x"]
                for frame in samples:
                    if "layers" not in frame or not down["t"] <= frame["t"] < stop:
                        continue
                    bar = pick_layer(frame, "Tabs/0" if renderer == "native" else "Tabs", None)
                    lens = pick_layer(frame, path, None)
                    if not bar or not lens or bar["w"] <= 0:
                        continue
                    scale = bar["w"] / bar0["w"]
                    points.append([frame["t"] - down["t"],
                                   (lens["x"] + lens["w"] / 2 - bar["x"]) / scale - center0,
                                   lens["w"] / scale - lens0["w"], lens["h"] / scale - lens0["h"], bar["w"] - bar0["w"]])
                if not points:
                    continue
                values = np.asarray(points)
                gaps = np.diff(values[:, 0])
                hold = (up["t"] - down["t"]) * 1000
                entry = {"appearance": appearance, "renderer": renderer, "press": index + 1, "hold_ms": hold,
                         "rest_platter_pt": [bar0["w"], bar0["h"]], "rest_lens_pt": [lens0["w"], lens0["h"]],
                         "largest_frame_gap_ms": float(gaps.max() * 1000) if len(gaps) else None,
                         "samples": points}
                summaries.append(entry)
                series[(renderer, index)] = (values, hold)
        if not series:
            continue
        count = max(key[1] for key in series) + 1
        fig, axes = plt.subplots(count, 4, figsize=(15, 2.5 * count), squeeze=False)
        for (renderer, index), (values, hold) in series.items():
            # Break plotted lines across missing intervals instead of drawing a
            # smooth-looking fabricated native trajectory through a long gap.
            breaks = np.where(np.diff(values[:, 0]) > 0.05)[0] + 1
            chunks = np.split(values, breaks)
            for column, label in enumerate(("center travel", "extra lens width", "extra lens height", "extra platter width")):
                ax = axes[index][column]
                for part_index, chunk in enumerate(chunks):
                    ax.plot(chunk[:, 0] * 1000, chunk[:, column + 1], color="C0" if renderer == "native" else "C1",
                            label=f"{renderer} hold {hold:.1f}ms" if part_index == 0 else None)
                ax.axvline(hold, color="C0" if renderer == "native" else "C1", linestyle=":", linewidth=0.8)
                ax.set_title(f"Press {index + 1}: {label} (pt)", fontsize=9)
                ax.set_xlabel("ms from actual pointerdown")
                ax.legend(fontsize=7)
        fig.suptitle(f"iOS26 tabs / {appearance}: input-aligned; different hold durations are different stimuli")
        fig.tight_layout(rect=(0, 0, 1, 0.98))
        fig.savefig(root / f"tabs-motion-{appearance}.png", dpi=120)
        plt.close(fig)
    if summaries:
        errors = []
        full_errors = []
        for native in (entry for entry in summaries if entry["renderer"] == "native"):
            web = next((entry for entry in summaries if entry["renderer"] == "web"
                        and entry["appearance"] == native["appearance"] and entry["press"] == native["press"]), None)
            if not web:
                continue
            ns = np.asarray(native["samples"])
            differences = []
            full_differences = []
            for point in web["samples"]:
                index = int(np.searchsorted(ns[:, 0], point[0]))
                if index == 0 or index == len(ns):
                    continue
                a, b = ns[index - 1], ns[index]
                if b[0] - a[0] > 0.04:
                    continue
                ratio = (point[0] - a[0]) / (b[0] - a[0])
                difference = np.abs(np.asarray(point[1:]) - (a[1:] + (b[1:] - a[1:]) * ratio))
                full_differences.append(difference)
                if point[0] <= 0.65:
                    differences.append(difference)
            if differences:
                errors.append({"appearance": native["appearance"], "press": native["press"],
                               "native_hold_ms": native["hold_ms"], "web_hold_ms": web["hold_ms"],
                               "hold_difference_within_5ms": abs(native["hold_ms"] - web["hold_ms"]) <= 5,
                               "compared_frames": len(differences),
                               "mean_absolute_error_pt": np.mean(differences, axis=0).tolist(),
                               "max_absolute_error_pt": np.max(differences, axis=0).tolist()})
            if full_differences:
                full_errors.append({"appearance": native["appearance"], "press": native["press"],
                                    "native_hold_ms": native["hold_ms"], "web_hold_ms": web["hold_ms"],
                                    "hold_difference_within_5ms": abs(native["hold_ms"] - web["hold_ms"]) <= 5,
                                    "compared_frames": len(full_differences),
                                    "mean_absolute_error_pt": np.mean(full_differences, axis=0).tolist(),
                                    "max_absolute_error_pt": np.max(full_differences, axis=0).tolist()})
        (root / "tabs-motion.json").write_text(json.dumps({
            "disclaimer": "Diagnostic recordings, not a parity verdict. Raw samples retained; no fitted time shift. See error_method for limited interpolation.",
            "columns": ["seconds_from_down", "center_travel_pt", "extra_lens_width_pt", "extra_lens_height_pt", "extra_platter_width_pt"],
            "error_method": "First 650ms from actual pointerdown. Native linear interpolation only across gaps <=40ms. Different holds remain flagged, not equivalent stimuli. Error columns follow geometry columns above.",
            "early_window_errors": errors,
            "full_window_method": "From actual down through up+1.1s or the next down, whichever occurs first; interpolate native only across gaps <=40ms. Different delivered holds remain flagged.",
            "full_window_errors": full_errors,
            "entries": summaries,
        }, indent=2) + "\n")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Diagnostic native/shell vs web parity collage (not a verdict).")
    parser.add_argument("artifact_dir", type=Path, help="Artifact directory with attachments/, metrics/, build.json")
    parser.add_argument(
        "--reference",
        choices=("native", "shell"),
        default="native",
        help="Screenshot/motion reference renderer (default: native)",
    )
    args = parser.parse_args(argv[1:])
    root = args.artifact_dir.resolve()
    reference = args.reference
    index, metrics = load_manifest(root), load_metrics(root)
    errors = []
    for appearance in APPEARANCES:
        errors.extend(comparison(root, index, metrics, appearance, reference))
    errors_name = "image-errors.json" if reference == "native" else "shell-image-errors.json"
    (root / errors_name).write_text(
        json.dumps(
            {
                "description": NOTE,
                "disclaimer": "Diagnostic whole-ROI RGB MAE only. Not pass/fail parity. Not contour metrics.",
                "reference": reference,
                "amplification_display_only": AMP,
                "roi_pt": {"x0": ROI[0], "x1": ROI[1], "y0": ROI[2], "y1": ROI[3]},
                "entries": errors,
            },
            indent=2,
        )
        + "\n"
    )
    motion_plot(root, metrics, reference)
    if reference == "native":
        short_button_plot(root, metrics)
        tabs_plot(root, metrics)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
