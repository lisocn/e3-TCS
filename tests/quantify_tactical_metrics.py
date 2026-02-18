import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def load_luma(path: Path) -> np.ndarray:
    rgb = load_rgb(path)
    # ITU-R BT.709 luma.
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def sobel_mean(luma: np.ndarray) -> float:
    padded = np.pad(luma, ((1, 1), (1, 1)), mode="edge")
    gx = (
        -1.0 * padded[:-2, :-2]
        + 1.0 * padded[:-2, 2:]
        - 2.0 * padded[1:-1, :-2]
        + 2.0 * padded[1:-1, 2:]
        - 1.0 * padded[2:, :-2]
        + 1.0 * padded[2:, 2:]
    )
    gy = (
        -1.0 * padded[:-2, :-2]
        - 2.0 * padded[:-2, 1:-1]
        - 1.0 * padded[:-2, 2:]
        + 1.0 * padded[2:, :-2]
        + 2.0 * padded[2:, 1:-1]
        + 1.0 * padded[2:, 2:]
    )
    return float(np.hypot(gx, gy).mean())


def crop_ratio(luma: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    h, w = luma.shape
    x0, y0, x1, y1 = box
    ix0 = max(0, min(w - 1, int(round(x0 * w))))
    iy0 = max(0, min(h - 1, int(round(y0 * h))))
    ix1 = max(ix0 + 1, min(w, int(round(x1 * w))))
    iy1 = max(iy0 + 1, min(h, int(round(y1 * h))))
    return luma[iy0:iy1, ix0:ix1]


def get_windows(preset: str) -> tuple[tuple[float, float, float, float], tuple[float, float, float, float]]:
    key = preset.strip().lower()
    if key in ("mudpit", "step3_plain"):
        # mudpit 机位：平原问题区位于画面中下部偏中。
        ridge = (0.32, 0.20, 0.84, 0.46)
        plain = (0.30, 0.44, 0.84, 0.88)
        return ridge, plain
    # default wide/focus
    ridge = (0.46, 0.18, 0.82, 0.46)
    plain = (0.14, 0.58, 0.50, 0.86)
    return ridge, plain


def calc_metrics(luma: np.ndarray, preset: str = "wide") -> dict[str, float]:
    ridge_box, plain_box = get_windows(preset)
    ridge_window = crop_ratio(luma, ridge_box)
    plain_window = crop_ratio(luma, plain_box)
    return {
        "global_luma_mean": float(luma.mean()),
        "global_luma_std": float(luma.std()),
        "global_edge_mean": sobel_mean(luma),
        "plain_luma_std": float(plain_window.std()),
        "plain_edge_mean": sobel_mean(plain_window),
        "ridge_edge_mean": sobel_mean(ridge_window),
    }


def down_up_blur_luma(luma: np.ndarray, scale: int = 8) -> np.ndarray:
    h, w = luma.shape
    small_w = max(4, w // scale)
    small_h = max(4, h // scale)
    src = Image.fromarray(np.clip(luma * 255.0, 0, 255).astype(np.uint8), mode="L")
    low = src.resize((small_w, small_h), Image.Resampling.BILINEAR).resize((w, h), Image.Resampling.BILINEAR)
    return np.asarray(low, dtype=np.float32) / 255.0


def highpass_std_luma(luma: np.ndarray, scale: int = 8) -> float:
    low = down_up_blur_luma(luma, scale=scale)
    hp = luma - low
    return float(hp.std())


def luma_span(luma: np.ndarray, lo: float = 10.0, hi: float = 90.0) -> float:
    return float(np.percentile(luma, hi) - np.percentile(luma, lo))


def active_bin_ratio(values: np.ndarray, bins: int = 24, min_bin_frac: float = 0.015) -> float:
    hist, _ = np.histogram(values, bins=bins, range=(0.0, 1.0))
    total = max(1, int(hist.sum()))
    active = np.count_nonzero(hist >= int(total * min_bin_frac))
    return float(active / bins)


def resize_rgb_like(rgb: np.ndarray, target_w: int, target_h: int) -> np.ndarray:
    src = Image.fromarray(np.clip(rgb * 255.0, 0, 255).astype(np.uint8), mode="RGB")
    resized = src.resize((target_w, target_h), Image.Resampling.BILINEAR)
    return np.asarray(resized, dtype=np.float32) / 255.0


def rgb_to_ycbcr(rgb: np.ndarray) -> np.ndarray:
    # BT.601 full-range approximation.
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 0.564 * (b - y) + 0.5
    cr = 0.713 * (r - y) + 0.5
    return np.stack([y, cb, cr], axis=-1)


def rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]
    mx = np.max(rgb, axis=-1)
    mn = np.min(rgb, axis=-1)
    d = mx - mn
    h = np.zeros_like(mx)
    mask = d > 1e-6
    i = (mx == r) & mask
    h[i] = ((g[i] - b[i]) / d[i]) % 6.0
    i = (mx == g) & mask
    h[i] = ((b[i] - r[i]) / d[i]) + 2.0
    i = (mx == b) & mask
    h[i] = ((r[i] - g[i]) / d[i]) + 4.0
    h = h / 6.0
    s = np.where(mx > 1e-6, d / mx, 0.0)
    v = mx
    return np.stack([h, s, v], axis=-1)


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    # sRGB -> XYZ -> Lab (D65)
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float32,
    )
    xyz = linear @ m.T
    x = xyz[..., 0] / 0.95047
    y = xyz[..., 1] / 1.00000
    z = xyz[..., 2] / 1.08883
    eps = 216.0 / 24389.0
    kappa = 24389.0 / 27.0

    def f(t: np.ndarray) -> np.ndarray:
        return np.where(t > eps, np.cbrt(t), (kappa * t + 16.0) / 116.0)

    fx = f(x)
    fy = f(y)
    fz = f(z)
    l = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([l, a, b], axis=-1)


def calc_style_metrics(rgb: np.ndarray, preset: str = "wide") -> dict[str, float]:
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    hsv = rgb_to_hsv(rgb)
    ycbcr = rgb_to_ycbcr(rgb)
    y = ycbcr[..., 0]
    cb = ycbcr[..., 1]
    cr = ycbcr[..., 2]
    hist, _ = np.histogram(y, bins=32, range=(0.0, 1.0), density=True)
    hist = hist / np.maximum(1e-8, hist.sum())
    shadow_mask = (luma < 0.38) & (hsv[..., 1] > 0.08)
    if np.any(shadow_mask):
        shadow_luma_mean = float(luma[shadow_mask].mean())
        shadow_warmth = float((rgb[..., 0] - rgb[..., 2])[shadow_mask].mean())
        shadow_brownness = float(
            (
                (rgb[..., 0] - rgb[..., 2])
                - 0.35 * np.abs(rgb[..., 0] - rgb[..., 1])
            )[shadow_mask].mean()
        )
    else:
        shadow_luma_mean = 0.0
        shadow_warmth = 0.0
        shadow_brownness = 0.0
    base = calc_metrics(luma, preset=preset)
    # Plain 区域窗口（与 plain_edge 一致），用于“泥水感”相关颜色统计。
    h, w, _ = rgb.shape
    _ridge_box, plain_box = get_windows(preset)
    x0, y0, x1, y1 = plain_box
    ix0 = max(0, min(w - 1, int(round(x0 * w))))
    iy0 = max(0, min(h - 1, int(round(y0 * h))))
    ix1 = max(ix0 + 1, min(w, int(round(x1 * w))))
    iy1 = max(iy0 + 1, min(h, int(round(y1 * h))))
    plain_rgb3 = rgb[iy0:iy1, ix0:ix1, :]
    plain_hsv = rgb_to_hsv(plain_rgb3)
    plain_luma = 0.2126 * plain_rgb3[..., 0] + 0.7152 * plain_rgb3[..., 1] + 0.0722 * plain_rgb3[..., 2]
    plain_sat = plain_hsv[..., 1]
    plain_hue_deg = plain_hsv[..., 0] * 360.0
    plain_brown_mask = ((plain_hue_deg >= 20.0) & (plain_hue_deg <= 50.0) & (plain_sat > 0.15))
    plain_low = down_up_blur_luma(plain_luma, scale=8)
    plain_low_std = float(plain_low.std())
    plain_hp_std = highpass_std_luma(plain_luma, scale=8)
    plain_lowfreq_ratio = plain_low_std / max(1e-6, float(plain_luma.std()))
    plain_sat_bin_ratio = active_bin_ratio(plain_sat, bins=20, min_bin_frac=0.01)
    return {
        **base,
        "cb_mean": float(cb.mean()),
        "cb_std": float(cb.std()),
        "cr_mean": float(cr.mean()),
        "cr_std": float(cr.std()),
        "shadow_luma_mean": shadow_luma_mean,
        "shadow_warmth": shadow_warmth,
        "shadow_brownness": shadow_brownness,
        "plain_luma_mean": float(plain_luma.mean()),
        "plain_sat_std": float(plain_sat.std()),
        "plain_brown_ratio": float(plain_brown_mask.mean()),
        "plain_lowfreq_ratio": plain_lowfreq_ratio,
        "plain_highpass_std": plain_hp_std,
        "plain_luma_span_p10_p90": luma_span(plain_luma, 10.0, 90.0),
        "plain_sat_bin_ratio": plain_sat_bin_ratio,
        "luma_hist_l1_anchor": float(np.abs(hist).sum()),  # kept for shape compatibility
        "luma_hist": hist.tolist(),
    }


def style_distance(
    subject: dict[str, float],
    reference: dict[str, float],
    subject_rgb: np.ndarray,
    reference_rgb: np.ndarray,
) -> dict[str, float]:
    def rel(a: float, b: float) -> float:
        return abs(a - b) / max(1e-6, abs(b))

    hist_subject = np.asarray(subject["luma_hist"], dtype=np.float32)
    hist_ref = np.asarray(reference["luma_hist"], dtype=np.float32)
    hist_l1 = float(np.abs(hist_subject - hist_ref).sum())
    lab_subject = rgb_to_lab(subject_rgb)
    lab_ref = rgb_to_lab(reference_rgb)
    delta_e_mean = float(np.linalg.norm(lab_subject - lab_ref, axis=-1).mean())

    hsv_subject = rgb_to_hsv(subject_rgb)
    hsv_ref = rgb_to_hsv(reference_rgb)
    hue_delta = np.abs(hsv_subject[..., 0] - hsv_ref[..., 0])
    hue_circ = np.minimum(hue_delta, 1.0 - hue_delta)
    hue_dist_mean = float(hue_circ.mean())

    components = {
        "luma_mean_rel": rel(subject["global_luma_mean"], reference["global_luma_mean"]),
        "luma_std_rel": rel(subject["global_luma_std"], reference["global_luma_std"]),
        "global_edge_rel": rel(subject["global_edge_mean"], reference["global_edge_mean"]),
        "plain_edge_rel": rel(subject["plain_edge_mean"], reference["plain_edge_mean"]),
        "ridge_edge_rel": rel(subject["ridge_edge_mean"], reference["ridge_edge_mean"]),
        "cb_mean_rel": rel(subject["cb_mean"], reference["cb_mean"]),
        "cb_std_rel": rel(subject["cb_std"], reference["cb_std"]),
        "cr_mean_rel": rel(subject["cr_mean"], reference["cr_mean"]),
        "cr_std_rel": rel(subject["cr_std"], reference["cr_std"]),
        "shadow_luma_mean_rel": rel(subject["shadow_luma_mean"], reference["shadow_luma_mean"]),
        "shadow_warmth_rel": rel(subject["shadow_warmth"], reference["shadow_warmth"]),
        "shadow_brownness_rel": rel(subject["shadow_brownness"], reference["shadow_brownness"]),
        "plain_luma_mean_rel": rel(subject["plain_luma_mean"], reference["plain_luma_mean"]),
        "plain_sat_std_rel": rel(subject["plain_sat_std"], reference["plain_sat_std"]),
        "plain_brown_ratio_rel": rel(subject["plain_brown_ratio"], reference["plain_brown_ratio"]),
        "plain_lowfreq_ratio_rel": rel(subject["plain_lowfreq_ratio"], reference["plain_lowfreq_ratio"]),
        "plain_highpass_std_rel": rel(subject["plain_highpass_std"], reference["plain_highpass_std"]),
        "plain_luma_span_rel": rel(subject["plain_luma_span_p10_p90"], reference["plain_luma_span_p10_p90"]),
        "plain_sat_bin_ratio_rel": rel(subject["plain_sat_bin_ratio"], reference["plain_sat_bin_ratio"]),
        "luma_hist_l1": hist_l1,
        "delta_e_mean": delta_e_mean,
        "hue_dist_mean": hue_dist_mean,
    }
    score = (
        0.12 * components["luma_mean_rel"]
        + 0.10 * components["luma_std_rel"]
        + 0.10 * components["global_edge_rel"]
        + 0.10 * components["plain_edge_rel"]
        + 0.10 * components["ridge_edge_rel"]
        + 0.05 * components["cb_mean_rel"]
        + 0.05 * components["cb_std_rel"]
        + 0.05 * components["cr_mean_rel"]
        + 0.05 * components["cr_std_rel"]
        + 0.06 * components["shadow_luma_mean_rel"]
        + 0.06 * components["shadow_warmth_rel"]
        + 0.06 * components["shadow_brownness_rel"]
        + 0.10 * (components["delta_e_mean"] / 30.0)
        + 0.10 * (components["hue_dist_mean"] / 0.10)
        + 0.02 * components["luma_hist_l1"]
    )
    return {"score": float(score), "components": components}


def pct_delta(current: float, baseline: float) -> float:
    if abs(baseline) < 1e-8:
        return 0.0
    return (current - baseline) / baseline * 100.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--baseline",
        default="",
    )
    parser.add_argument(
        "--current",
        default="tests/artifacts/capture_tactical_view.png",
    )
    parser.add_argument(
        "--reference",
        default="RedFlag.jpg",
    )
    parser.add_argument(
        "--window-preset",
        default="wide",
        help="Metric window preset: wide|mudpit",
    )
    args = parser.parse_args()

    baseline_path = Path(args.baseline) if args.baseline else None
    current_path = Path(args.current)
    reference_path = Path(args.reference)
    if baseline_path is not None and not baseline_path.exists():
        raise FileNotFoundError(f"Baseline image not found: {baseline_path}")
    if not current_path.exists():
        raise FileNotFoundError(f"Current image not found: {current_path}")
    if not reference_path.exists():
        raise FileNotFoundError(f"Reference image not found: {reference_path}")

    current = calc_metrics(load_luma(current_path), preset=args.window_preset)
    baseline = calc_metrics(load_luma(baseline_path), preset=args.window_preset) if baseline_path else None
    delta = {k: pct_delta(current[k], baseline[k]) for k in current} if baseline else {}
    gate = {}

    # RedFlag style distance: lower is closer.
    ref_rgb = load_rgb(reference_path)
    ref_h, ref_w = ref_rgb.shape[0], ref_rgb.shape[1]
    current_rgb = resize_rgb_like(load_rgb(current_path), ref_w, ref_h)
    ref_style = calc_style_metrics(ref_rgb, preset=args.window_preset)
    current_style = calc_style_metrics(current_rgb, preset=args.window_preset)
    current_dist = style_distance(current_style, ref_style, current_rgb, ref_rgb)
    baseline_dist = None
    style_improvement_pct = None
    if baseline_path is not None:
        baseline_rgb = resize_rgb_like(load_rgb(baseline_path), ref_w, ref_h)
        baseline_style = calc_style_metrics(baseline_rgb, preset=args.window_preset)
        baseline_dist = style_distance(baseline_style, ref_style, baseline_rgb, ref_rgb)
        style_improvement_pct = (
            (baseline_dist["score"] - current_dist["score"])
            / max(1e-6, baseline_dist["score"])
            * 100.0
        )

    print(
        json.dumps(
            {
                "baseline": str(baseline_path) if baseline_path else None,
                "current": str(current_path),
                "reference": str(reference_path),
                "window_preset": args.window_preset,
                "metrics": current,
                "delta_pct_vs_baseline": delta,
                "gate": gate,
                "redflag_style": {
                    "distance_score_baseline_to_ref": baseline_dist["score"] if baseline_dist else None,
                    "distance_score_current_to_ref": current_dist["score"],
                    "improvement_pct_vs_baseline": style_improvement_pct,
                    "baseline_components": baseline_dist["components"] if baseline_dist else None,
                    "current_components": current_dist["components"],
                    "gate": {},
                },
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
