import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def load_luma(path: Path) -> np.ndarray:
    rgb = load_rgb(path)
    # ITU-R BT.709 luma.
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def sobel_mean(luma: np.ndarray) -> float:
    return float(sobel_map(luma).mean())


def sobel_map(luma: np.ndarray) -> np.ndarray:
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
    return np.hypot(gx, gy)


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
    if key == "focus":
        # focus 机位：专门覆盖“中部大平地 + 两侧山体边缘”，用于 layer0 水波纹/反光验收。
        ridge = (0.55, 0.24, 0.90, 0.48)
        plain = (0.34, 0.38, 0.86, 0.90)
        return ridge, plain
    # default wide
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


def topk_color_coverage(rgb: np.ndarray, levels: int = 16, k: int = 6) -> float:
    q = np.clip((rgb * (levels - 1)).round().astype(np.int32), 0, levels - 1)
    code = q[..., 0] * levels * levels + q[..., 1] * levels + q[..., 2]
    flat = code.reshape(-1)
    _, counts = np.unique(flat, return_counts=True)
    counts = np.sort(counts)[::-1]
    return float(counts[:k].sum() / max(1, flat.size))


def fft_grid_axis_ratio(luma: np.ndarray) -> float:
    f = np.fft.fftshift(np.fft.fft2(luma))
    mag = np.abs(f)
    h, w = mag.shape
    cy, cx = h // 2, w // 2
    yy, xx = np.ogrid[:h, :w]
    rr = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
    rmin = min(h, w) * 0.06
    rmax = min(h, w) * 0.42
    hf_mask = (rr >= rmin) & (rr <= rmax)
    axis_mask = (np.abs(yy - cy) <= 2) | (np.abs(xx - cx) <= 2)
    total = float(mag[hf_mask].sum()) + 1e-6
    axis_e = float(mag[hf_mask & axis_mask].sum())
    return axis_e / total


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
    ridge_box, plain_box = get_windows(preset)
    rx0, ry0, rx1, ry1 = ridge_box
    rix0 = max(0, min(w - 1, int(round(rx0 * w))))
    riy0 = max(0, min(h - 1, int(round(ry0 * h))))
    rix1 = max(rix0 + 1, min(w, int(round(rx1 * w))))
    riy1 = max(riy0 + 1, min(h, int(round(ry1 * h))))
    ridge_rgb3 = rgb[riy0:riy1, rix0:rix1, :]
    ridge_luma = 0.2126 * ridge_rgb3[..., 0] + 0.7152 * ridge_rgb3[..., 1] + 0.0722 * ridge_rgb3[..., 2]
    ridge_edge = sobel_map(ridge_luma)
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
    plain_edge = sobel_map(plain_luma)
    plain_grid_axis_ratio = fft_grid_axis_ratio(plain_luma)
    plain_edge_p30 = float(np.percentile(plain_edge, 30.0))
    flat_mask_plain = plain_edge <= plain_edge_p30
    plain_hp = plain_luma - down_up_blur_luma(plain_luma, scale=8)
    if np.any(flat_mask_plain):
        flat_roi_highpass_std = float(plain_hp[flat_mask_plain].std())
        valley_roi_edge_mean = float(plain_edge[plain_luma <= np.percentile(plain_luma, 20.0)].mean())
    else:
        flat_roi_highpass_std = plain_hp_std
        valley_roi_edge_mean = float(plain_edge.mean())

    ridge_p75 = float(np.percentile(ridge_luma, 75.0))
    ridge_p25 = float(np.percentile(ridge_luma, 25.0))
    ridge_front_mask = ridge_luma >= ridge_p75
    ridge_back_mask = ridge_luma <= ridge_p25
    if np.any(ridge_front_mask):
        ridge_front_luma_mean = float(ridge_luma[ridge_front_mask].mean())
        ridge_roi_edge_mean = float(ridge_edge[ridge_front_mask].mean())
    else:
        ridge_front_luma_mean = float(ridge_luma.mean())
        ridge_roi_edge_mean = float(ridge_edge.mean())
    if np.any(ridge_back_mask):
        ridge_back_luma_mean = float(ridge_luma[ridge_back_mask].mean())
    else:
        ridge_back_luma_mean = float(ridge_luma.mean())
    front_back_luma_delta = ridge_front_luma_mean - ridge_back_luma_mean
    rim_intensity_ratio = ridge_roi_edge_mean / max(1e-6, float(ridge_edge.mean()))
    hue_deg = hsv[..., 0] * 360.0
    sat = hsv[..., 1]
    val = hsv[..., 2]
    red_mask = (((hue_deg <= 20.0) | (hue_deg >= 340.0)) & (sat > 0.22) & (val > 0.18))
    ochre_mask = ((hue_deg >= 28.0) & (hue_deg <= 54.0) & (sat > 0.18) & (val > 0.18))
    near_white_ratio = float(((rgb[..., 0] > 0.90) & (rgb[..., 1] > 0.90) & (rgb[..., 2] > 0.90)).mean())
    bright_clip_ratio = float((luma > 0.90).mean())
    terrain_mask = (luma > 0.12) & (luma < 0.82) & (sat > 0.05)
    terrain_rgb = rgb[terrain_mask] if np.any(terrain_mask) else rgb.reshape(-1, 3)
    terrain_mean_r = float(terrain_rgb[:, 0].mean())
    terrain_mean_g = float(terrain_rgb[:, 1].mean())
    terrain_mean_b = float(terrain_rgb[:, 2].mean())
    terrain_rg_ratio = terrain_mean_r / max(1e-6, terrain_mean_g)
    terrain_gb_ratio = terrain_mean_g / max(1e-6, terrain_mean_b)
    return {
        **base,
        "contrast_span_p10_p90": luma_span(luma, 10.0, 90.0),
        "cb_mean": float(cb.mean()),
        "cb_std": float(cb.std()),
        "cr_mean": float(cr.mean()),
        "cr_std": float(cr.std()),
        "hue_bin_ratio": active_bin_ratio(hsv[..., 0], bins=24, min_bin_frac=0.01),
        "sat_bin_ratio_global": active_bin_ratio(hsv[..., 1], bins=24, min_bin_frac=0.01),
        "palette_top6_coverage": topk_color_coverage(rgb, levels=16, k=6),
        "grid_axis_ratio": fft_grid_axis_ratio(luma),
        "shadow_luma_mean": shadow_luma_mean,
        "shadow_warmth": shadow_warmth,
        "shadow_brownness": shadow_brownness,
        "plain_luma_mean": float(plain_luma.mean()),
        "plain_sat_std": float(plain_sat.std()),
        "plain_brown_ratio": float(plain_brown_mask.mean()),
        "plain_lowfreq_ratio": plain_lowfreq_ratio,
        "plain_highpass_std": plain_hp_std,
        "plain_grid_axis_ratio": plain_grid_axis_ratio,
        "plain_luma_span_p10_p90": luma_span(plain_luma, 10.0, 90.0),
        "plain_sat_bin_ratio": plain_sat_bin_ratio,
        "flat_roi_highpass_std": flat_roi_highpass_std,
        "ridge_roi_edge_mean": ridge_roi_edge_mean,
        "valley_roi_edge_mean": valley_roi_edge_mean,
        "front_back_luma_delta": front_back_luma_delta,
        "rim_intensity_ratio": rim_intensity_ratio,
        "near_white_ratio": near_white_ratio,
        "bright_clip_ratio": bright_clip_ratio,
        "red_ratio": float(red_mask.mean()),
        "ochre_ratio": float(ochre_mask.mean()),
        "terrain_mean_r": terrain_mean_r,
        "terrain_mean_g": terrain_mean_g,
        "terrain_mean_b": terrain_mean_b,
        "terrain_rg_ratio": terrain_rg_ratio,
        "terrain_gb_ratio": terrain_gb_ratio,
        "luma_hist_l1_anchor": float(np.abs(hist).sum()),  # kept for shape compatibility
        "luma_hist": hist.tolist(),
    }


def style_distance(
    subject: dict[str, float],
    reference: dict[str, float],
    subject_rgb: np.ndarray,
    reference_rgb: np.ndarray,
) -> dict[str, Any]:
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
        "contrast_span_rel": rel(subject["contrast_span_p10_p90"], reference["contrast_span_p10_p90"]),
        "luma_mean_rel": rel(subject["global_luma_mean"], reference["global_luma_mean"]),
        "luma_std_rel": rel(subject["global_luma_std"], reference["global_luma_std"]),
        "global_edge_rel": rel(subject["global_edge_mean"], reference["global_edge_mean"]),
        "plain_edge_rel": rel(subject["plain_edge_mean"], reference["plain_edge_mean"]),
        "ridge_edge_rel": rel(subject["ridge_edge_mean"], reference["ridge_edge_mean"]),
        "cb_mean_rel": rel(subject["cb_mean"], reference["cb_mean"]),
        "cb_std_rel": rel(subject["cb_std"], reference["cb_std"]),
        "cr_mean_rel": rel(subject["cr_mean"], reference["cr_mean"]),
        "cr_std_rel": rel(subject["cr_std"], reference["cr_std"]),
        "hue_bin_ratio_rel": rel(subject["hue_bin_ratio"], reference["hue_bin_ratio"]),
        "sat_bin_ratio_global_rel": rel(subject["sat_bin_ratio_global"], reference["sat_bin_ratio_global"]),
        "palette_top6_coverage_rel": rel(subject["palette_top6_coverage"], reference["palette_top6_coverage"]),
        "grid_axis_ratio_rel": rel(subject["grid_axis_ratio"], reference["grid_axis_ratio"]),
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
        "flat_roi_highpass_std_rel": rel(subject["flat_roi_highpass_std"], reference["flat_roi_highpass_std"]),
        "ridge_roi_edge_mean_rel": rel(subject["ridge_roi_edge_mean"], reference["ridge_roi_edge_mean"]),
        "valley_roi_edge_mean_rel": rel(subject["valley_roi_edge_mean"], reference["valley_roi_edge_mean"]),
        "front_back_luma_delta_rel": rel(subject["front_back_luma_delta"], reference["front_back_luma_delta"]),
        "rim_intensity_ratio_rel": rel(subject["rim_intensity_ratio"], reference["rim_intensity_ratio"]),
        "near_white_ratio_rel": rel(subject["near_white_ratio"], reference["near_white_ratio"]),
        "bright_clip_ratio_rel": rel(subject["bright_clip_ratio"], reference["bright_clip_ratio"]),
        "red_ratio_rel": rel(subject["red_ratio"], reference["red_ratio"]),
        "ochre_ratio_rel": rel(subject["ochre_ratio"], reference["ochre_ratio"]),
        "terrain_mean_r_rel": rel(subject["terrain_mean_r"], reference["terrain_mean_r"]),
        "terrain_mean_g_rel": rel(subject["terrain_mean_g"], reference["terrain_mean_g"]),
        "terrain_mean_b_rel": rel(subject["terrain_mean_b"], reference["terrain_mean_b"]),
        "terrain_rg_ratio_rel": rel(subject["terrain_rg_ratio"], reference["terrain_rg_ratio"]),
        "terrain_gb_ratio_rel": rel(subject["terrain_gb_ratio"], reference["terrain_gb_ratio"]),
        "luma_hist_l1": hist_l1,
        "delta_e_mean": delta_e_mean,
        "hue_dist_mean": hue_dist_mean,
    }
    score = (
        0.12 * components["near_white_ratio_rel"]
        + 0.09 * components["bright_clip_ratio_rel"]
        + 0.10 * components["red_ratio_rel"]
        + 0.12 * components["ochre_ratio_rel"]
        + 0.10 * components["grid_axis_ratio_rel"]
        + 0.10 * components["plain_highpass_std_rel"]
        + 0.06 * components["plain_lowfreq_ratio_rel"]
        + 0.05 * components["plain_sat_std_rel"]
        + 0.06 * components["terrain_mean_r_rel"]
        + 0.06 * components["terrain_mean_g_rel"]
        + 0.05 * components["terrain_mean_b_rel"]
        + 0.04 * components["terrain_rg_ratio_rel"]
        + 0.04 * components["terrain_gb_ratio_rel"]
        + 0.03 * components["contrast_span_rel"]
        + 0.03 * components["luma_mean_rel"]
        + 0.02 * components["luma_std_rel"]
        + 0.03 * components["ridge_edge_rel"]
        + 0.03 * components["ridge_roi_edge_mean_rel"]
        + 0.03 * components["valley_roi_edge_mean_rel"]
        + 0.02 * components["front_back_luma_delta_rel"]
        + 0.02 * components["rim_intensity_ratio_rel"]
        + 0.02 * components["flat_roi_highpass_std_rel"]
        + 0.04 * (components["delta_e_mean"] / 30.0)
        + 0.04 * (components["hue_dist_mean"] / 0.10)
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
        help="Metric window preset: wide|focus|mudpit",
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
    baseline_style = None
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
                    "baseline_style_metrics": baseline_style,
                    "reference_style_metrics": ref_style,
                    "current_style_metrics": current_style,
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
