import argparse
import ast
import json
import os
import subprocess
import sys
from pathlib import Path


DEFAULT_MPP_MIN = 175.0
DEFAULT_MPP_MAX = 195.0
DEFAULT_BASELINE = ""


def run_capture(mpp_min: float, mpp_max: float, align_variant: str) -> tuple[dict, str]:
    env = os.environ.copy()
    env["CAPTURE_ALIGN_REDFLAG"] = align_variant
    env["CAPTURE_TERRAIN_ONLY"] = "true"
    env["CAPTURE_ENSURE_TACTICAL_MPP"] = "true"
    env["CAPTURE_TACTICAL_MPP_MIN"] = str(mpp_min)
    env["CAPTURE_TACTICAL_MPP_MAX"] = str(mpp_max)
    cmd = [sys.executable, "tests/capture_tactical_view.py"]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True, check=True)

    lod_state = {}
    ensure_state = {}
    for line in proc.stdout.splitlines():
        if line.startswith("LOD State:"):
            lod_state = ast.literal_eval(line.split(":", 1)[1].strip())
        if line.startswith("EnsureTacticalMpp:"):
            ensure_state = json.loads(line.split(":", 1)[1].strip())

    return {
        "lod_state": lod_state,
        "ensure_tactical_mpp": ensure_state,
        "align_variant": align_variant,
    }, proc.stdout


def run_capture_with_retry(
    mpp_min: float,
    mpp_max: float,
    align_variant: str,
    attempts: int = 3,
) -> tuple[dict, str]:
    last_report = {}
    last_stdout = ""
    for _ in range(max(1, attempts)):
        report, stdout = run_capture(mpp_min, mpp_max, align_variant)
        lod = report.get("lod_state", {})
        ensure = report.get("ensure_tactical_mpp", {})
        profile_ok = str(lod.get("profile", "")) == "tactical"
        mpp = float(lod.get("metersPerPixel", 0.0) or 0.0)
        mpp_ok = mpp_min <= mpp <= mpp_max
        ensure_ok = bool(ensure.get("satisfied", False))
        last_report, last_stdout = report, stdout
        if profile_ok and mpp_ok and ensure_ok:
            return report, stdout
    return last_report, last_stdout


def run_quantify(window_preset: str, baseline_path: Path | None) -> dict:
    cmd = [
        sys.executable,
        "tests/quantify_tactical_metrics.py",
        "--window-preset",
        window_preset,
    ]
    if baseline_path is not None:
        cmd.extend(["--baseline", str(baseline_path)])
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def build_gate_checks(level: str, wide_q: dict, mudpit_q: dict) -> dict[str, bool]:
    wc = wide_q["redflag_style"]["current_components"]
    mc = mudpit_q["redflag_style"]["current_components"]
    ws = float(wide_q["redflag_style"]["distance_score_current_to_ref"])
    ms = float(mudpit_q["redflag_style"]["distance_score_current_to_ref"])

    thresholds = {
        "draft": {
            "score": 0.68,
            "delta_e": 42.0,
            "hue": 0.12,
            "global_edge": 0.75,
            "ridge_edge": 0.85,
            "shadow_brown": 0.75,
            "shadow_warm": 0.80,
            "plain_luma": 0.35,
            "plain_sat_std": 2.80,
            "plain_brown": 1.00,
            "plain_lowfreq": 0.50,
            "plain_highpass": 0.35,
        },
        "target": {
            "score": 0.56,
            "delta_e": 35.0,
            "hue": 0.108,
            "global_edge": 0.30,
            "ridge_edge": 0.28,
            "shadow_brown": 0.56,
            "shadow_warm": 0.66,
            "plain_luma": 0.52,
            "plain_sat_std": 0.95,
            "plain_brown": 0.30,
            "plain_lowfreq": 0.18,
            "plain_highpass": 0.24,
        },
        "final": {
            "score": 0.44,
            "delta_e": 30.5,
            "hue": 0.091,
            "global_edge": 0.30,
            "ridge_edge": 0.28,
            "shadow_brown": 0.36,
            "shadow_warm": 0.47,
            "plain_luma": 0.41,
            "plain_sat_std": 0.65,
            "plain_brown": 0.20,
            "plain_lowfreq": 0.20,
            "plain_highpass": 0.26,
        },
    }[level]

    return {
        "wide.score_le": ws <= thresholds["score"],
        "mudpit.score_le": ms <= thresholds["score"],
        "wide.delta_e_mean_le": float(wc.get("delta_e_mean", 999.0)) <= thresholds["delta_e"],
        "wide.hue_dist_mean_le": float(wc.get("hue_dist_mean", 9.9)) <= thresholds["hue"],
        "wide.global_edge_rel_le": float(wc.get("global_edge_rel", 9.9)) <= thresholds["global_edge"],
        "wide.ridge_edge_rel_le": float(wc.get("ridge_edge_rel", 9.9)) <= thresholds["ridge_edge"],
        "wide.shadow_brownness_rel_le": float(wc.get("shadow_brownness_rel", 9.9)) <= thresholds["shadow_brown"],
        "wide.shadow_warmth_rel_le": float(wc.get("shadow_warmth_rel", 9.9)) <= thresholds["shadow_warm"],
        "mudpit.plain_luma_mean_rel_le": float(mc.get("plain_luma_mean_rel", 9.9)) <= thresholds["plain_luma"],
        "mudpit.plain_sat_std_rel_le": float(mc.get("plain_sat_std_rel", 9.9)) <= thresholds["plain_sat_std"],
        "mudpit.plain_brown_ratio_rel_le": float(mc.get("plain_brown_ratio_rel", 9.9)) <= thresholds["plain_brown"],
        "mudpit.plain_lowfreq_ratio_rel_le": float(mc.get("plain_lowfreq_ratio_rel", 9.9)) <= thresholds["plain_lowfreq"],
        "mudpit.plain_highpass_std_rel_le": float(mc.get("plain_highpass_std_rel", 9.9)) <= thresholds["plain_highpass"],
    }


def build_preconditions(capture_report: dict, mpp_min: float, mpp_max: float, key: str) -> dict[str, bool]:
    lod_state = capture_report.get("lod_state", {})
    ensure_state = capture_report.get("ensure_tactical_mpp", {})
    profile = str(lod_state.get("profile", ""))
    mpp = float(lod_state.get("metersPerPixel", 0.0) or 0.0)
    ensure_ok = bool(ensure_state.get("satisfied", False))
    return {
        f"{key}.profile_is_tactical": profile == "tactical",
        f"{key}.mpp_in_target_range": mpp_min <= mpp <= mpp_max,
        f"{key}.ensure_tactical_mpp_satisfied": ensure_ok,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", choices=["draft", "target", "final"], default="target")
    parser.add_argument("--mpp-min", type=float, default=DEFAULT_MPP_MIN)
    parser.add_argument("--mpp-max", type=float, default=DEFAULT_MPP_MAX)
    parser.add_argument("--baseline", default=DEFAULT_BASELINE)
    args = parser.parse_args()

    baseline_path = Path(args.baseline) if args.baseline else None
    if baseline_path is not None and not baseline_path.exists():
        baseline_path = None

    wide_capture, wide_stdout = run_capture_with_retry(args.mpp_min, args.mpp_max, "wide")
    wide_quantify = run_quantify("wide", baseline_path)

    mudpit_capture, mudpit_stdout = run_capture_with_retry(args.mpp_min, args.mpp_max, "mudpit")
    mudpit_quantify = run_quantify("mudpit", baseline_path)

    preconditions = {}
    preconditions.update(build_preconditions(wide_capture, args.mpp_min, args.mpp_max, "wide"))
    preconditions.update(build_preconditions(mudpit_capture, args.mpp_min, args.mpp_max, "mudpit"))
    checks = build_gate_checks(args.level, wide_quantify, mudpit_quantify)
    passed = all(preconditions.values()) and all(checks.values())

    print(
        json.dumps(
            {
                "gate_level": args.level,
                "baseline": str(baseline_path) if baseline_path else None,
                "capture": {
                    "wide": wide_capture,
                    "mudpit": mudpit_capture,
                },
                "quantify": {
                    "wide": wide_quantify,
                    "mudpit": mudpit_quantify,
                },
                "stage_gate": {
                    "preconditions": preconditions,
                    "checks": checks,
                    "all_passed": passed,
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    print("\n=== CAPTURE RAW OUTPUT (wide) ===")
    print(wide_stdout.strip())
    print("\n=== CAPTURE RAW OUTPUT (mudpit) ===")
    print(mudpit_stdout.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
