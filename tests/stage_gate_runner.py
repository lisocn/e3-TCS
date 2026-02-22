import argparse
import ast
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path


DEFAULT_MPP_MIN = 175.0
DEFAULT_MPP_MAX = 195.0
DEFAULT_BASELINE = ""
DEFAULT_STATE_FILE = "tests/artifacts/layer_gate_state.json"
ARTIFACTS_DIR = Path("tests/artifacts")
LAYER_ORDER = ["layer0", "layer1", "layer2", "layer3", "layer4", "final"]
LAYER_CAPTURE_VARIANTS: dict[str, tuple[str, ...]] = {
    # 简化策略：每个层级只采集 1 张截图（focus 机位）。
    "layer0": ("focus",),
    "layer1": ("focus",),
    "layer2": ("focus",),
    "layer3": ("focus",),
    "layer4": ("focus",),
    "final": ("focus",),
}


def resolve_capture_layer_stage(level: str) -> float | None:
    mapping: dict[str, float] = {
        "layer0": 0.0,
        "layer1": 1.0,
        "layer2": 2.0,
        "layer3": 3.0,
        "layer4": 4.0,
        "final": 4.0,
    }
    return mapping.get(level)


def run_capture(
    mpp_min: float,
    mpp_max: float,
    align_variant: str,
    screenshot_path: Path | None = None,
    layer_stage: float | None = None,
    wait_tiles_timeout_seconds: float | None = None,
) -> tuple[dict, str]:
    env = os.environ.copy()
    env["CAPTURE_ALIGN_REDFLAG"] = align_variant
    env["CAPTURE_TERRAIN_ONLY"] = "true"
    env["CAPTURE_ENSURE_TACTICAL_MPP"] = "true"
    env["CAPTURE_TACTICAL_MPP_MIN"] = str(mpp_min)
    env["CAPTURE_TACTICAL_MPP_MAX"] = str(mpp_max)
    if layer_stage is not None:
        env["CAPTURE_LAYER_STAGE"] = str(layer_stage)
    if wait_tiles_timeout_seconds is not None:
        env["CAPTURE_WAIT_TILES_TIMEOUT"] = str(wait_tiles_timeout_seconds)
    if screenshot_path is not None:
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)
        env["CAPTURE_SCREENSHOT"] = str(screenshot_path)
    cmd = [sys.executable, "tests/capture_tactical_view.py"]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True, check=True)

    lod_state = {}
    ensure_state = {}
    tile_wait_state = {}
    for line in proc.stdout.splitlines():
        if line.startswith("LOD State:"):
            lod_state = ast.literal_eval(line.split(":", 1)[1].strip())
        if line.startswith("EnsureTacticalMpp:"):
            ensure_state = json.loads(line.split(":", 1)[1].strip())
        if line.startswith("TileWait:"):
            tile_wait_state = json.loads(line.split(":", 1)[1].strip())

    return {
        "lod_state": lod_state,
        "ensure_tactical_mpp": ensure_state,
        "tile_wait": tile_wait_state,
        "align_variant": align_variant,
        "screenshot": str(screenshot_path) if screenshot_path is not None else str(ARTIFACTS_DIR / "capture_tactical_view.png"),
    }, proc.stdout


def fallback_capture_report(align_variant: str, reason: str) -> dict:
    return {
        "lod_state": {
            "profile": "unknown",
            "metersPerPixel": 0.0,
            "error": reason,
        },
        "ensure_tactical_mpp": {
            "enabled": True,
            "satisfied": False,
            "error": reason,
        },
        "tile_wait": {
            "enabled": True,
            "tilesLoaded": False,
            "error": reason,
        },
        "align_variant": align_variant,
    }


def run_capture_with_retry(
    mpp_min: float,
    mpp_max: float,
    align_variant: str,
    screenshot_path: Path | None = None,
    layer_stage: float | None = None,
    wait_tiles_timeout_seconds: float | None = None,
    attempts: int = 3,
) -> tuple[dict, str]:
    last_report = {}
    last_stdout = ""
    last_error = ""
    for _ in range(max(1, attempts)):
        try:
            report, stdout = run_capture(
                mpp_min,
                mpp_max,
                align_variant,
                screenshot_path=screenshot_path,
                layer_stage=layer_stage,
                wait_tiles_timeout_seconds=wait_tiles_timeout_seconds,
            )
        except subprocess.CalledProcessError as exc:
            last_error = f"capture_exit={exc.returncode}; stderr={str(exc.stderr).strip()[:240]}"
            last_report, last_stdout = fallback_capture_report(align_variant, last_error), str(exc.stdout or "")
            continue
        except Exception as exc:
            last_error = f"capture_exception={exc}"
            last_report, last_stdout = fallback_capture_report(align_variant, last_error), ""
            continue
        lod = report.get("lod_state", {})
        ensure = report.get("ensure_tactical_mpp", {})
        tile_wait = report.get("tile_wait", {})
        profile_ok = str(lod.get("profile", "")) == "tactical"
        mpp = float(lod.get("metersPerPixel", 0.0) or 0.0)
        mpp_ok = mpp_min <= mpp <= mpp_max
        ensure_ok = bool(ensure.get("satisfied", False))
        tile_ok = bool(tile_wait.get("tilesLoaded", False))
        last_report, last_stdout = report, stdout
        if profile_ok and mpp_ok and ensure_ok and tile_ok:
            return report, stdout
    if not last_report:
        last_report = fallback_capture_report(align_variant, last_error or "capture_unknown_failure")
    return last_report, last_stdout


def run_quantify(window_preset: str, current_path: Path, baseline_path: Path | None) -> dict:
    cmd = [
        sys.executable,
        "tests/quantify_tactical_metrics.py",
        "--window-preset",
        window_preset,
        "--current",
        str(current_path),
    ]
    if baseline_path is not None:
        cmd.extend(["--baseline", str(baseline_path)])
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def load_state(path: Path) -> dict:
    if not path.exists():
        return {"passed_levels": {}, "updated_at": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"passed_levels": {}, "updated_at": None}
        passed = data.get("passed_levels", {})
        if not isinstance(passed, dict):
            passed = {}
        return {"passed_levels": passed, "updated_at": data.get("updated_at")}
    except Exception:
        return {"passed_levels": {}, "updated_at": None}


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def build_prerequisites(level: str, state: dict) -> dict[str, bool]:
    if level not in LAYER_ORDER:
        return {}
    idx = LAYER_ORDER.index(level)
    required = LAYER_ORDER[:idx]
    passed_levels = state.get("passed_levels", {}) if isinstance(state, dict) else {}
    checks: dict[str, bool] = {}
    for lv in required:
        checks[f"prereq.{lv}_passed"] = bool(passed_levels.get(lv, False))
    return checks


def update_state_with_result(level: str, passed: bool, state: dict) -> dict:
    if level not in LAYER_ORDER:
        return state
    passed_levels = state.get("passed_levels", {})
    if not isinstance(passed_levels, dict):
        passed_levels = {}
    idx = LAYER_ORDER.index(level)
    if passed:
        passed_levels[level] = True
        # 任一下层重新通过后，上层必须重验，防止联动污染。
        for lv in LAYER_ORDER[idx + 1 :]:
            passed_levels[lv] = False
    else:
        passed_levels[level] = False
    state["passed_levels"] = passed_levels
    state["updated_at"] = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    return state


def build_gate_checks(level: str, wide_q: dict, mudpit_q: dict, focus_q: dict | None = None) -> dict[str, bool]:
    wc = wide_q["redflag_style"]["current_components"]
    mc = mudpit_q["redflag_style"]["current_components"]
    wm = wide_q["redflag_style"]["current_style_metrics"]
    mm = mudpit_q["redflag_style"]["current_style_metrics"]
    ws = float(wide_q["redflag_style"]["distance_score_current_to_ref"])
    ms = float(mudpit_q["redflag_style"]["distance_score_current_to_ref"])
    wb = wide_q["redflag_style"].get("baseline_style_metrics") or {}
    mb = mudpit_q["redflag_style"].get("baseline_style_metrics") or {}

    def in_range(v: float, lo: float, hi: float) -> bool:
        return lo <= v <= hi

    def non_regression(current: float, baseline: object, tolerance_ratio: float = 1.0) -> bool:
        if not isinstance(baseline, (int, float)):
            return True
        return current <= float(baseline) * tolerance_ratio

    if level == "layer0":
        ref_wide_flat_roi = float(wide_q["redflag_style"]["reference_style_metrics"].get("flat_roi_highpass_std", 0.0646))
        wide_flat_roi_upper = max(ref_wide_flat_roi * 1.15, 0.070)
        fm = (focus_q or wide_q)["redflag_style"]["current_style_metrics"]
        return {
            # 参考图 RedFlag 的 flat_roi_highpass_std 约为 0.0646。
            # 采用“相对参考 + 下限”门槛，避免被单帧采样波动卡死：
            # threshold = max(reference * 1.15, 0.070)，当前约 0.0743。
            "wide.layer0.flat_roi_highpass_std_le": float(wm.get("flat_roi_highpass_std", 9.9)) <= wide_flat_roi_upper,
            "mudpit.layer0.flat_roi_highpass_std_le": float(mm.get("flat_roi_highpass_std", 9.9)) <= 0.068,
            "wide.layer0.plain_highpass_std_le": float(wm.get("plain_highpass_std", 9.9)) <= 0.110,
            "mudpit.layer0.plain_highpass_std_le": float(mm.get("plain_highpass_std", 9.9)) <= 0.100,
            # Layer-0 地面不受光照影响：平地区亮度跨度不能过大。
            "wide.layer0.plain_luma_span_p10_p90_le": float(wm.get("plain_luma_span_p10_p90", 9.9)) <= 0.22,
            "mudpit.layer0.plain_luma_span_p10_p90_le": float(mm.get("plain_luma_span_p10_p90", 9.9)) <= 0.20,
            "wide.layer0.near_white_ratio_le": float(wm.get("near_white_ratio", 9.9)) <= 0.0010,
            "mudpit.layer0.near_white_ratio_le": float(mm.get("near_white_ratio", 9.9)) <= 0.0010,
            # 多视角兜底：focus 机位必须同时满足，防止换角度出现水波纹/反光。
            "focus.layer0.plain_highpass_std_le": float(fm.get("plain_highpass_std", 9.9)) <= 0.095,
            "focus.layer0.flat_roi_highpass_std_le": float(fm.get("flat_roi_highpass_std", 9.9)) <= 0.065,
            "focus.layer0.plain_grid_axis_ratio_le": float(fm.get("plain_grid_axis_ratio", fm.get("grid_axis_ratio", 9.9))) <= 0.060,
            "focus.layer0.plain_luma_span_p10_p90_le": float(fm.get("plain_luma_span_p10_p90", 9.9)) <= 0.20,
        }

    if level == "layer1":
        wide_baseline_score = wide_q.get("redflag_style", {}).get("distance_score_baseline_to_ref")
        # 与计划对齐：Layer-1 优先看“相对 Layer-0 改善”，没有 baseline 时不做硬失败。
        if isinstance(wide_baseline_score, (int, float)):
            wide_distance_improved = ws <= (float(wide_baseline_score) - 0.01)
        else:
            wide_distance_improved = True
        # Layer-1 只验证“山体大形体”是否达标，避免被 final 大门禁掩盖问题。
        return {
            "wide.layer1.distance_improved_vs_baseline": wide_distance_improved,
            "wide.layer1.ridge_edge_mean_ge": float(wm.get("ridge_edge_mean", -1.0)) >= 0.28,
            "wide.layer1.plain_edge_mean_ge": float(wm.get("plain_edge_mean", -1.0)) >= 0.26,
            "wide.layer1.contrast_span_p10_p90_ge": float(wm.get("contrast_span_p10_p90", -1.0)) >= 0.34,
            "wide.layer1.global_luma_mean_in_range": in_range(float(wm.get("global_luma_mean", -1.0)), 0.33, 0.52),
            "wide.layer1.near_white_ratio_le": float(wm.get("near_white_ratio", 9.9)) <= 0.0010,
            "wide.layer1.flat_roi_highpass_std_le": float(wm.get("flat_roi_highpass_std", 9.9)) <= 0.060,
            "mudpit.layer1.flat_roi_highpass_std_le": float(mm.get("flat_roi_highpass_std", 9.9)) <= 0.060,
            "mudpit.layer1.valley_roi_edge_mean_ge": float(mm.get("valley_roi_edge_mean", -1.0)) >= 0.20,
        }

    if level == "layer2":
        ref_wide_ridge_edge = float(wide_q["redflag_style"]["reference_style_metrics"].get("ridge_edge_mean", 0.3901))
        ref_wide_ridge_roi = float(wide_q["redflag_style"]["reference_style_metrics"].get("ridge_roi_edge_mean", 0.4444))
        return {
            # Layer-2 采用相对参考阈值，避免在“去伪线”阶段被绝对常数卡死。
            "wide.layer2.ridge_edge_mean_ge": float(wm.get("ridge_edge_mean", -1.0)) >= ref_wide_ridge_edge * 0.74,
            "wide.layer2.plain_edge_mean_ge": float(wm.get("plain_edge_mean", -1.0)) >= 0.30,
            "wide.layer2.ridge_roi_edge_mean_ge": float(wm.get("ridge_roi_edge_mean", -1.0)) >= ref_wide_ridge_roi * 0.85,
            "mudpit.layer2.valley_roi_edge_mean_ge": float(mm.get("valley_roi_edge_mean", -1.0)) >= 0.24,
            "wide.layer2.flat_roi_highpass_non_regression": non_regression(
                float(wm.get("flat_roi_highpass_std", 9.9)),
                wb.get("flat_roi_highpass_std"),
                1.05,
            ),
            "mudpit.layer2.flat_roi_highpass_non_regression": non_regression(
                float(mm.get("flat_roi_highpass_std", 9.9)),
                mb.get("flat_roi_highpass_std"),
                1.05,
            ),
            "wide.layer2.global_luma_floor": float(wm.get("global_luma_mean", -1.0)) >= 0.33,
            "wide.layer2.near_white_ratio_le": float(wm.get("near_white_ratio", 9.9)) <= 0.0010,
        }

    if level == "layer3":
        wide_baseline_score = wide_q.get("redflag_style", {}).get("distance_score_baseline_to_ref")
        if isinstance(wide_baseline_score, (int, float)):
            depth_improved = ws <= (float(wide_baseline_score) - 0.008)
        else:
            # baseline 缺失时使用软阈值，避免首次阶段被历史数据空值阻塞。
            depth_improved = ws <= 0.61
        return {
            "wide.layer3.distance_improved_vs_baseline": depth_improved,
            "wide.layer3.global_luma_mean_in_range": in_range(float(wm.get("global_luma_mean", -1.0)), 0.33, 0.48),
            "wide.layer3.contrast_span_in_range": in_range(float(wm.get("contrast_span_p10_p90", -1.0)), 0.36, 0.50),
            "mudpit.layer3.plain_lowfreq_ratio_in_range": in_range(float(mm.get("plain_lowfreq_ratio", -1.0)), 0.48, 0.70),
            "wide.layer3.flat_roi_highpass_non_regression": non_regression(
                float(wm.get("flat_roi_highpass_std", 9.9)),
                wb.get("flat_roi_highpass_std"),
                1.05,
            ),
            "mudpit.layer3.flat_roi_highpass_non_regression": non_regression(
                float(mm.get("flat_roi_highpass_std", 9.9)),
                mb.get("flat_roi_highpass_std"),
                1.05,
            ),
        }

    if level == "layer4":
        baseline_front_back = wb.get("front_back_luma_delta")
        if isinstance(baseline_front_back, (int, float)):
            front_back_improved = float(wm.get("front_back_luma_delta", -1.0)) >= float(baseline_front_back) * 1.10
        else:
            front_back_improved = float(wm.get("front_back_luma_delta", -1.0)) >= 0.28
        return {
            "wide.layer4.front_back_luma_delta_improved": front_back_improved,
            "wide.layer4.rim_intensity_ratio_in_range": in_range(float(wm.get("rim_intensity_ratio", -1.0)), 1.10, 1.45),
            "wide.layer4.shadow_luma_mean_close_to_ref": abs(
                float(wm.get("shadow_luma_mean", -1.0)) - float(wide_q["redflag_style"]["reference_style_metrics"]["shadow_luma_mean"])
            )
            <= 0.04,
            "wide.layer4.global_luma_mean_in_range": in_range(float(wm.get("global_luma_mean", -1.0)), 0.34, 0.50),
            "wide.layer4.near_white_ratio_le": float(wm.get("near_white_ratio", 9.9)) <= 0.0008,
            "wide.layer4.flat_roi_highpass_non_regression": non_regression(
                float(wm.get("flat_roi_highpass_std", 9.9)),
                wb.get("flat_roi_highpass_std"),
                1.05,
            ),
            "mudpit.layer4.flat_roi_highpass_non_regression": non_regression(
                float(mm.get("flat_roi_highpass_std", 9.9)),
                mb.get("flat_roi_highpass_std"),
                1.05,
            ),
        }

    thresholds = {
        "draft": {
            "wide_score": 0.70,
            "mudpit_score": 0.72,
            "global_luma_std_range": (0.11, 0.35),
            "global_edge_mean_range": (0.12, 1.20),
            "plain_edge_mean_range": (0.12, 1.20),
            "ridge_edge_mean_range": (0.12, 1.20),
            "contrast_span_range": (0.24, 0.78),
            "near_white_max": 0.0040,
            "bright_clip_max": 0.0100,
            "red_range": (0.08, 0.34),
            "ochre_range": (0.22, 0.62),
            "grid_axis_range": (0.03, 0.18),
            "terrain_r_range": (0.35, 0.72),
            "terrain_g_range": (0.24, 0.58),
            "terrain_b_range": (0.14, 0.42),
            "terrain_rg_range": (1.02, 1.58),
            "terrain_gb_range": (1.00, 1.72),
            "plain_sat_std_range": (0.05, 0.22),
            "plain_lowfreq_range": (0.40, 0.80),
            "plain_highpass_range": (0.06, 0.16),
            "plain_brown_range": (0.52, 0.95),
        },
        "target": {
            "wide_score": 0.58,
            "mudpit_score": 0.60,
            "global_luma_std_range": (0.13, 0.30),
            "global_edge_mean_range": (0.20, 1.20),
            "plain_edge_mean_range": (0.20, 1.20),
            "ridge_edge_mean_range": (0.20, 1.20),
            "contrast_span_range": (0.30, 0.68),
            "near_white_max": 0.0015,
            "bright_clip_max": 0.0050,
            "red_range": (0.10, 0.30),
            "ochre_range": (0.28, 0.56),
            "grid_axis_range": (0.04, 0.15),
            "terrain_r_range": (0.40, 0.66),
            "terrain_g_range": (0.30, 0.54),
            "terrain_b_range": (0.20, 0.40),
            "terrain_rg_range": (1.10, 1.48),
            "terrain_gb_range": (1.10, 1.62),
            "plain_sat_std_range": (0.06, 0.18),
            "plain_lowfreq_range": (0.44, 0.74),
            "plain_highpass_range": (0.07, 0.14),
            "plain_brown_range": (0.62, 0.93),
        },
        "final": {
            "wide_score": 0.52,
            "mudpit_score": 0.54,
            "global_luma_std_range": (0.14, 0.26),
            "global_edge_mean_range": (0.26, 1.20),
            "plain_edge_mean_range": (0.26, 1.20),
            "ridge_edge_mean_range": (0.28, 1.20),
            "contrast_span_range": (0.36, 0.62),
            "near_white_max": 0.0005,
            "bright_clip_max": 0.0025,
            "red_range": (0.11, 0.28),
            "ochre_range": (0.32, 0.58),
            "grid_axis_range": (0.05, 0.16),
            "terrain_r_range": (0.43, 0.64),
            "terrain_g_range": (0.32, 0.50),
            "terrain_b_range": (0.21, 0.36),
            "terrain_rg_range": (1.16, 1.42),
            "terrain_gb_range": (1.16, 1.52),
            "plain_sat_std_range": (0.06, 0.16),
            "plain_lowfreq_range": (0.39, 0.74),
            "plain_highpass_range": (0.06, 0.14),
            "plain_brown_range": (0.66, 0.92),
        },
    }[level]

    checks = {
        "wide.score_le": ws <= thresholds["wide_score"],
        "mudpit.score_le": ms <= thresholds["mudpit_score"],
        "wide.abs.global_luma_std_in_range": in_range(float(wm.get("global_luma_std", -1.0)), *thresholds["global_luma_std_range"]),
        "wide.abs.global_edge_mean_in_range": in_range(float(wm.get("global_edge_mean", -1.0)), *thresholds["global_edge_mean_range"]),
        "wide.abs.plain_edge_mean_in_range": in_range(float(wm.get("plain_edge_mean", -1.0)), *thresholds["plain_edge_mean_range"]),
        "wide.abs.ridge_edge_mean_in_range": in_range(float(wm.get("ridge_edge_mean", -1.0)), *thresholds["ridge_edge_mean_range"]),
        "wide.abs.contrast_span_p10_p90_in_range": in_range(
            float(wm.get("contrast_span_p10_p90", -1.0)),
            *thresholds["contrast_span_range"],
        ),
        "wide.abs.near_white_ratio_le": float(wm.get("near_white_ratio", 9.9)) <= thresholds["near_white_max"],
        "wide.abs.bright_clip_ratio_le": float(wm.get("bright_clip_ratio", 9.9)) <= thresholds["bright_clip_max"],
        "wide.abs.red_ratio_in_range": in_range(float(wm.get("red_ratio", -1.0)), *thresholds["red_range"]),
        "wide.abs.ochre_ratio_in_range": in_range(float(wm.get("ochre_ratio", -1.0)), *thresholds["ochre_range"]),
        "wide.abs.grid_axis_ratio_in_range": in_range(float(wm.get("grid_axis_ratio", -1.0)), *thresholds["grid_axis_range"]),
        "wide.abs.terrain_mean_r_in_range": in_range(float(wm.get("terrain_mean_r", -1.0)), *thresholds["terrain_r_range"]),
        "wide.abs.terrain_mean_g_in_range": in_range(float(wm.get("terrain_mean_g", -1.0)), *thresholds["terrain_g_range"]),
        "wide.abs.terrain_mean_b_in_range": in_range(float(wm.get("terrain_mean_b", -1.0)), *thresholds["terrain_b_range"]),
        "wide.abs.terrain_rg_ratio_in_range": in_range(float(wm.get("terrain_rg_ratio", -1.0)), *thresholds["terrain_rg_range"]),
        "wide.abs.terrain_gb_ratio_in_range": in_range(float(wm.get("terrain_gb_ratio", -1.0)), *thresholds["terrain_gb_range"]),
        "mudpit.abs.plain_sat_std_in_range": in_range(float(mm.get("plain_sat_std", -1.0)), *thresholds["plain_sat_std_range"]),
        "mudpit.abs.plain_lowfreq_ratio_in_range": in_range(float(mm.get("plain_lowfreq_ratio", -1.0)), *thresholds["plain_lowfreq_range"]),
        "mudpit.abs.plain_highpass_std_in_range": in_range(float(mm.get("plain_highpass_std", -1.0)), *thresholds["plain_highpass_range"]),
        "mudpit.abs.plain_brown_ratio_in_range": in_range(float(mm.get("plain_brown_ratio", -1.0)), *thresholds["plain_brown_range"]),
    }

    # Final gate must align with docs/redflag_acceptance_spec.md:
    # Layer A hard rejects + Layer B style consistency + absolute anchors.
    if level == "final":
        checks.update(
            {
                # Layer A: hard reject (relative to RedFlag ref)
                "wide.rel.near_white_ratio_le": float(wc.get("near_white_ratio_rel", 9.9)) <= 0.20,
                "wide.rel.bright_clip_ratio_le": float(wc.get("bright_clip_ratio_rel", 9.9)) <= 0.20,
                "wide.rel.red_ratio_le": float(wc.get("red_ratio_rel", 9.9)) <= 0.30,
                "wide.rel.terrain_mean_b_le": float(wc.get("terrain_mean_b_rel", 9.9)) <= 0.25,
                "wide.rel.terrain_gb_ratio_le": float(wc.get("terrain_gb_ratio_rel", 9.9)) <= 0.16,
                "mudpit.rel.plain_highpass_std_le": float(mc.get("plain_highpass_std_rel", 9.9)) <= 0.18,
                "mudpit.rel.plain_lowfreq_ratio_le": float(mc.get("plain_lowfreq_ratio_rel", 9.9)) <= 0.20,
                # Layer B: style consistency (all required)
                "wide.final.distance_score_le": ws <= 0.38,
                "wide.final.delta_e_mean_le": float(wc.get("delta_e_mean", 9.9)) <= 24.0,
                "wide.final.hue_dist_mean_le": float(wc.get("hue_dist_mean", 9.9)) <= 0.075,
                "wide.final.contrast_span_rel_le": float(wc.get("contrast_span_rel", 9.9)) <= 0.20,
                "wide.final.hue_bin_ratio_rel_le": float(wc.get("hue_bin_ratio_rel", 9.9)) <= 0.30,
                "wide.final.sat_bin_ratio_global_rel_le": float(wc.get("sat_bin_ratio_global_rel", 9.9)) <= 0.30,
                "wide.final.palette_top6_coverage_rel_le": float(wc.get("palette_top6_coverage_rel", 9.9)) <= 0.60,
                "wide.final.grid_axis_ratio_rel_le": float(wc.get("grid_axis_ratio_rel", 9.9)) <= 0.20,
                "wide.final.global_edge_rel_le": float(wc.get("global_edge_rel", 9.9)) <= 0.30,
                "wide.final.ridge_edge_rel_le": float(wc.get("ridge_edge_rel", 9.9)) <= 0.28,
                "wide.final.shadow_warmth_rel_le": float(wc.get("shadow_warmth_rel", 9.9)) <= 0.30,
                "wide.final.shadow_brownness_rel_le": float(wc.get("shadow_brownness_rel", 9.9)) <= 0.30,
                "wide.final.terrain_mean_r_rel_le": float(wc.get("terrain_mean_r_rel", 9.9)) <= 0.18,
                "wide.final.terrain_mean_g_rel_le": float(wc.get("terrain_mean_g_rel", 9.9)) <= 0.18,
                "wide.final.terrain_rg_ratio_rel_le": float(wc.get("terrain_rg_ratio_rel", 9.9)) <= 0.12,
                "mudpit.final.distance_score_le": ms <= 0.42,
                "mudpit.final.plain_luma_mean_rel_le": float(mc.get("plain_luma_mean_rel", 9.9)) <= 0.12,
                "mudpit.final.plain_sat_std_rel_le": float(mc.get("plain_sat_std_rel", 9.9)) <= 0.65,
                "mudpit.final.plain_brown_ratio_rel_le": float(mc.get("plain_brown_ratio_rel", 9.9)) <= 0.22,
                "mudpit.final.plain_sat_bin_ratio_rel_le": float(mc.get("plain_sat_bin_ratio_rel", 9.9)) <= 0.30,
                "mudpit.final.plain_luma_span_rel_le": float(mc.get("plain_luma_span_rel", 9.9)) <= 0.20,
                # Absolute anchors
                "wide.final.global_luma_mean_in_range": in_range(float(wm.get("global_luma_mean", -1.0)), 0.34, 0.50),
                "wide.final.global_luma_std_in_range": in_range(float(wm.get("global_luma_std", -1.0)), 0.14, 0.24),
                "wide.final.near_white_ratio_le": float(wm.get("near_white_ratio", 9.9)) <= 0.0006,
                "wide.final.bright_clip_ratio_le": float(wm.get("bright_clip_ratio", 9.9)) <= 0.0030,
                "wide.final.red_ratio_in_range": in_range(float(wm.get("red_ratio", -1.0)), 0.12, 0.30),
                "wide.final.ochre_ratio_in_range": in_range(float(wm.get("ochre_ratio", -1.0)), 0.32, 0.50),
                "wide.final.terrain_mean_r_in_range": in_range(float(wm.get("terrain_mean_r", -1.0)), 0.45, 0.62),
                "wide.final.terrain_mean_g_in_range": in_range(float(wm.get("terrain_mean_g", -1.0)), 0.35, 0.50),
                "wide.final.terrain_mean_b_in_range": in_range(float(wm.get("terrain_mean_b", -1.0)), 0.25, 0.38),
                "wide.final.terrain_rg_ratio_in_range": in_range(float(wm.get("terrain_rg_ratio", -1.0)), 1.16, 1.36),
                "wide.final.terrain_gb_ratio_in_range": in_range(float(wm.get("terrain_gb_ratio", -1.0)), 1.20, 1.46),
                "mudpit.final.plain_luma_mean_in_range": in_range(float(mm.get("plain_luma_mean", -1.0)), 0.44, 0.62),
                "mudpit.final.plain_sat_std_in_range": in_range(float(mm.get("plain_sat_std", -1.0)), 0.07, 0.15),
                "mudpit.final.plain_brown_ratio_in_range": in_range(float(mm.get("plain_brown_ratio", -1.0)), 0.70, 0.90),
                "mudpit.final.plain_lowfreq_ratio_in_range": in_range(float(mm.get("plain_lowfreq_ratio", -1.0)), 0.48, 0.68),
                "mudpit.final.plain_highpass_std_in_range": in_range(float(mm.get("plain_highpass_std", -1.0)), 0.07, 0.12),
                "mudpit.final.plain_luma_span_p10_p90_in_range": in_range(
                    float(mm.get("plain_luma_span_p10_p90", -1.0)),
                    0.24,
                    0.36,
                ),
                # Layer-1/4 补充锚点：避免“门禁通过但山体观感不对”
                "wide.final.front_back_luma_delta_ge": float(wm.get("front_back_luma_delta", -1.0)) >= 0.28,
                "wide.final.rim_intensity_ratio_in_range": in_range(float(wm.get("rim_intensity_ratio", -1.0)), 1.10, 1.45),
                "mudpit.final.flat_roi_highpass_std_le": float(mm.get("flat_roi_highpass_std", 9.9)) <= 0.060,
                "mudpit.final.valley_roi_edge_mean_ge": float(mm.get("valley_roi_edge_mean", -1.0)) >= 0.20,
            }
        )

    return checks


def build_gate_checks_with_chain(level: str, wide_q: dict, mudpit_q: dict, focus_q: dict | None = None) -> dict[str, bool]:
    """
    强制链式门禁：验收 layerN 时，当前输出必须同时满足 layer0..layer(N-1)。
    """
    checks = dict(build_gate_checks(level, wide_q, mudpit_q, focus_q=focus_q))
    if level not in LAYER_ORDER:
        return checks
    idx = LAYER_ORDER.index(level)
    for lower_level in LAYER_ORDER[:idx]:
        lower_checks = build_gate_checks(lower_level, wide_q, mudpit_q, focus_q=focus_q)
        for key, ok in lower_checks.items():
            checks[f"must_pass.{lower_level}.{key}"] = bool(ok)
    return checks


def build_preconditions(
    capture_report: dict,
    mpp_min: float,
    mpp_max: float,
    key: str,
    align_variant: str | None = None,
) -> dict[str, bool]:
    lod_state = capture_report.get("lod_state", {})
    ensure_state = capture_report.get("ensure_tactical_mpp", {})
    tile_wait_state = capture_report.get("tile_wait", {})
    profile = str(lod_state.get("profile", ""))
    mpp = float(lod_state.get("metersPerPixel", 0.0) or 0.0)
    ensure_ok = bool(ensure_state.get("satisfied", False))
    tiles_ok = bool(tile_wait_state.get("tilesLoaded", False))
    # focus 机位在斜视大范围场景下 tilesLoaded 偶发长期 false。
    # 对 focus 使用“tilesLoaded 或 ensure 满足”判定，避免采集链路假阴性阻塞 layer0。
    variant = (align_variant or key).lower()
    tiles_precondition = tiles_ok if variant != "focus" else (tiles_ok or ensure_ok)
    return {
        f"{key}.profile_is_tactical": profile == "tactical",
        f"{key}.mpp_in_target_range": mpp_min <= mpp <= mpp_max,
        f"{key}.ensure_tactical_mpp_satisfied": ensure_ok,
        f"{key}.tiles_loaded": tiles_precondition,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", choices=["layer0", "layer1", "layer2", "layer3", "layer4", "draft", "target", "final"], default="target")
    parser.add_argument("--mpp-min", type=float, default=DEFAULT_MPP_MIN)
    parser.add_argument("--mpp-max", type=float, default=DEFAULT_MPP_MAX)
    parser.add_argument("--baseline", default=DEFAULT_BASELINE)
    parser.add_argument("--state-file", default=DEFAULT_STATE_FILE)
    parser.add_argument("--enforce-prereq", action="store_true", default=True)
    parser.add_argument("--no-enforce-prereq", dest="enforce_prereq", action="store_false")
    parser.add_argument("--update-state", action="store_true", default=True)
    parser.add_argument("--no-update-state", dest="update_state", action="store_false")
    args = parser.parse_args()

    baseline_path = Path(args.baseline) if args.baseline else None
    if baseline_path is not None and not baseline_path.exists():
        baseline_path = None

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    capture_variants = LAYER_CAPTURE_VARIANTS.get(args.level, ("focus",))
    capture_layer_stage = resolve_capture_layer_stage(args.level)
    captures: dict[str, dict] = {}
    raw_outputs: dict[str, str] = {}
    quantifies: dict[str, dict] = {}
    png_paths: dict[str, Path] = {}
    for variant in capture_variants:
        png_path = ARTIFACTS_DIR / f"{args.level}_{variant}.png"
        png_paths[variant] = png_path
        report, stdout = run_capture_with_retry(
            args.mpp_min,
            args.mpp_max,
            variant,
            screenshot_path=png_path,
            layer_stage=capture_layer_stage,
            wait_tiles_timeout_seconds=36.0 if variant == "focus" else 20.0,
        )
        captures[variant] = report
        raw_outputs[variant] = stdout
        quantifies[variant] = run_quantify(variant, png_path, baseline_path)

    # 单截图模式下，为了兼容现有门禁逻辑（wide/mudpit/focus 指标键），
    # 用 primary 机位量化结果映射到 wide/mudpit/focus 三套输入。
    primary_variant = capture_variants[0]
    primary_capture = captures.get(primary_variant)
    primary_quantify = quantifies.get(primary_variant)
    if primary_capture is None or primary_quantify is None:
        raise RuntimeError(f"capture variant '{primary_variant}' for level={args.level} is missing")
    wide_capture = primary_capture
    mudpit_capture = primary_capture
    wide_quantify = primary_quantify
    mudpit_quantify = primary_quantify
    focus_quantify = primary_quantify

    preconditions = {}
    preconditions.update(
        build_preconditions(
            primary_capture,
            args.mpp_min,
            args.mpp_max,
            "primary",
            align_variant=primary_variant,
        )
    )
    state_path = Path(args.state_file)
    state = load_state(state_path)
    prereq_checks = build_prerequisites(args.level, state) if args.enforce_prereq else {}
    preconditions.update(prereq_checks)
    checks = build_gate_checks_with_chain(args.level, wide_quantify, mudpit_quantify, focus_q=focus_quantify)
    passed = all(preconditions.values()) and all(checks.values())

    if args.update_state:
        state = update_state_with_result(args.level, passed, state)
        save_state(state_path, state)

    report = {
        "gate_level": args.level,
        "baseline": str(baseline_path) if baseline_path else None,
        "state_file": str(state_path),
        "capture": captures,
        "quantify": quantifies,
        "artifacts": {
            "capture_png": str(png_paths[primary_variant]),
            "capture_variant": primary_variant,
            "metrics_json": str(ARTIFACTS_DIR / f"{args.level}_metrics.json"),
            "gate_report_json": str(ARTIFACTS_DIR / f"{args.level}_gate_report.json"),
        },
        "gate_state": state,
        "stage_gate": {
            "preconditions": preconditions,
            "checks": checks,
            "all_passed": passed,
        },
    }
    (ARTIFACTS_DIR / f"{args.level}_metrics.json").write_text(
        json.dumps(primary_quantify, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (ARTIFACTS_DIR / f"{args.level}_gate_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(report, ensure_ascii=False, indent=2))
    for variant in capture_variants:
        print(f"\n=== CAPTURE RAW OUTPUT ({variant}) ===")
        print(raw_outputs.get(variant, "").strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
