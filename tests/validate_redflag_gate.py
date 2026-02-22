import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.quantify_tactical_metrics import calc_style_metrics, load_rgb


REFERENCE_PATH = Path("RedFlag.jpg")


FINAL_ABS_RANGES = {
    "wide.global_luma_mean": (0.34, 0.50),
    "wide.global_luma_std": (0.14, 0.24),
    "wide.near_white_ratio": (0.0, 0.0006),
    "wide.bright_clip_ratio": (0.0, 0.0030),
    "wide.red_ratio": (0.12, 0.30),
    "wide.ochre_ratio": (0.32, 0.50),
    "wide.terrain_mean_r": (0.45, 0.62),
    "wide.terrain_mean_g": (0.35, 0.50),
    "wide.terrain_mean_b": (0.25, 0.38),
    "wide.terrain_rg_ratio": (1.16, 1.36),
    "wide.terrain_gb_ratio": (1.20, 1.46),
    "mudpit.plain_luma_mean": (0.44, 0.62),
    "mudpit.plain_sat_std": (0.07, 0.15),
    "mudpit.plain_brown_ratio": (0.70, 0.90),
    "mudpit.plain_lowfreq_ratio": (0.48, 0.68),
    "mudpit.plain_highpass_std": (0.07, 0.12),
    "mudpit.plain_luma_span_p10_p90": (0.24, 0.36),
}


def in_range(v: float, lo: float, hi: float) -> bool:
    return lo <= v <= hi


def check_reference_anchor(ref_w: dict, ref_m: dict) -> list[str]:
    failures: list[str] = []
    lookup = {
        "wide.global_luma_mean": ref_w["global_luma_mean"],
        "wide.global_luma_std": ref_w["global_luma_std"],
        "wide.near_white_ratio": ref_w["near_white_ratio"],
        "wide.bright_clip_ratio": ref_w["bright_clip_ratio"],
        "wide.red_ratio": ref_w["red_ratio"],
        "wide.ochre_ratio": ref_w["ochre_ratio"],
        "wide.terrain_mean_r": ref_w["terrain_mean_r"],
        "wide.terrain_mean_g": ref_w["terrain_mean_g"],
        "wide.terrain_mean_b": ref_w["terrain_mean_b"],
        "wide.terrain_rg_ratio": ref_w["terrain_rg_ratio"],
        "wide.terrain_gb_ratio": ref_w["terrain_gb_ratio"],
        "mudpit.plain_luma_mean": ref_m["plain_luma_mean"],
        "mudpit.plain_sat_std": ref_m["plain_sat_std"],
        "mudpit.plain_brown_ratio": ref_m["plain_brown_ratio"],
        "mudpit.plain_lowfreq_ratio": ref_m["plain_lowfreq_ratio"],
        "mudpit.plain_highpass_std": ref_m["plain_highpass_std"],
        "mudpit.plain_luma_span_p10_p90": ref_m["plain_luma_span_p10_p90"],
    }
    for key, (lo, hi) in FINAL_ABS_RANGES.items():
        if not in_range(float(lookup[key]), lo, hi):
            failures.append(f"reference_anchor_out_of_range: {key}={lookup[key]:.6f} not in [{lo}, {hi}]")
    return failures


def make_white_overlay(rgb: np.ndarray) -> np.ndarray:
    return np.clip(rgb * 0.78 + 0.22, 0.0, 1.0)


def make_red_shift(rgb: np.ndarray) -> np.ndarray:
    out = rgb.copy()
    out[..., 0] = np.clip(out[..., 0] * 1.20 + 0.03, 0.0, 1.0)
    out[..., 1] = np.clip(out[..., 1] * 0.84, 0.0, 1.0)
    out[..., 2] = np.clip(out[..., 2] * 0.76, 0.0, 1.0)
    return out


def make_noisy(rgb: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    yy, xx = np.mgrid[0:h, 0:w]
    wave = (
        np.sin(xx * 0.95) * 0.085
        + np.sin(yy * 0.81) * 0.085
        + np.sin((xx + yy) * 0.70) * 0.065
    )
    out = rgb.copy()
    for c in range(3):
        out[..., c] = np.clip(out[..., c] + wave, 0.0, 1.0)
    return out


def main() -> int:
    if not REFERENCE_PATH.exists():
        raise FileNotFoundError(f"Missing reference image: {REFERENCE_PATH}")

    base = load_rgb(REFERENCE_PATH)
    ref_w = calc_style_metrics(base, preset="wide")
    ref_m = calc_style_metrics(base, preset="mudpit")

    failures: list[str] = []
    failures.extend(check_reference_anchor(ref_w, ref_m))

    # 方向性校验 1：加白后 near_white / bright_clip 必须升高并越界
    white_w = calc_style_metrics(make_white_overlay(base), preset="wide")
    white_caught = (
        white_w["near_white_ratio"] > FINAL_ABS_RANGES["wide.near_white_ratio"][1]
        or white_w["bright_clip_ratio"] > FINAL_ABS_RANGES["wide.bright_clip_ratio"][1]
    )
    if not white_caught:
        failures.append("white_overlay_not_caught_by_white_metrics")

    # 方向性校验 2：偏红后 red_ratio 或 terrain_rg_ratio 必须越界
    red_w = calc_style_metrics(make_red_shift(base), preset="wide")
    red_ok = (
        red_w["red_ratio"] > FINAL_ABS_RANGES["wide.red_ratio"][1]
        or red_w["terrain_rg_ratio"] > FINAL_ABS_RANGES["wide.terrain_rg_ratio"][1]
    )
    if not red_ok:
        failures.append("red_shift_not_caught_by_color_metrics")

    # 方向性校验 3：加噪后 mudpit 高频应越界
    noisy_m = calc_style_metrics(make_noisy(base), preset="mudpit")
    if noisy_m["plain_highpass_std"] <= FINAL_ABS_RANGES["mudpit.plain_highpass_std"][1]:
        failures.append("noise_not_caught_by_plain_highpass_std")

    report = {
        "reference": str(REFERENCE_PATH),
        "status": "pass" if not failures else "fail",
        "failures": failures,
        "sanity": {
            "reference_wide": {
                "near_white_ratio": ref_w["near_white_ratio"],
                "bright_clip_ratio": ref_w["bright_clip_ratio"],
                "red_ratio": ref_w["red_ratio"],
                "ochre_ratio": ref_w["ochre_ratio"],
            },
            "white_overlay_wide": {
                "near_white_ratio": white_w["near_white_ratio"],
                "bright_clip_ratio": white_w["bright_clip_ratio"],
            },
            "red_shift_wide": {
                "red_ratio": red_w["red_ratio"],
                "terrain_rg_ratio": red_w["terrain_rg_ratio"],
            },
            "noise_mudpit": {
                "plain_highpass_std": noisy_m["plain_highpass_std"],
            },
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
