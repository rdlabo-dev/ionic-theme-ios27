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

CONTROLS = ("button", "button-short", "toggle", "segment", "range", "tabs", "search", "alert", "action-sheet", "navigation")
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


def crop_roi(img: Image.Image, scale: float, overlay: bool = False) -> np.ndarray:
    x0, x1, y0, y1 = (0, img.width / scale, 0, img.height / scale) if overlay else ROI
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
            crop = crop_roi(img, scale, control in ("alert", "action-sheet", "navigation"))
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
                    "roi": "full viewport" if control in ("alert", "action-sheet", "navigation") else "control strip",
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
