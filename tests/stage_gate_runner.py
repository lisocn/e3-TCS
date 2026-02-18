import argparse
import ast
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path


DEFAULT_MPP_MIN = 175.0
DEFAULT_MPP_MAX = 195.0
STEP0_BASELINE = Path("tests/artifacts/capture_tactical_baseline_step0.png")


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


def run_quantify(baseline_path: Path, window_preset: str) -> dict:
    cmd = [
        sys.executable,
        "tests/quantify_tactical_metrics.py",
        "--baseline",
        str(baseline_path),
        "--window-preset",
        window_preset,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def resolve_step_baseline(step: int, align_variant: str) -> tuple[Path, bool]:
    if step == 3 and align_variant == "mudpit":
        candidate = Path("tests/artifacts/capture_tactical_baseline_step2_mudpit.png")
        return candidate, not candidate.exists()
    if step <= 1:
        return STEP0_BASELINE, False
    candidate = Path(f"tests/artifacts/capture_tactical_baseline_step{step - 1}.png")
    if candidate.exists():
        return candidate, False
    return STEP0_BASELINE, True


def detect_current_step(todo_path: Path) -> int:
    text = todo_path.read_text(encoding="utf-8")
    m = re.search(r"Step\s+(\d+):\s*in progress", text)
    if m:
        return int(m.group(1))
    # fallback: 若没有 in progress，取最小 pending step（含区间写法 Step 4-5: pending）。
    pending_single = [int(x) for x in re.findall(r"Step\s+(\d+):\s*pending", text)]
    pending_range = [
        int(start)
        for start, _end in re.findall(r"Step\s+(\d+)-(\d+):\s*pending", text)
    ]
    candidates = pending_single + pending_range
    if candidates:
        return min(candidates)
    raise RuntimeError("Cannot detect current step from TODO.md (no in-progress or pending step)")


def build_step_checks(step: int, q: dict) -> dict:
    d = q["delta_pct_vs_baseline"]
    style = q.get("redflag_style", {})
    style_comp = style.get("current_components", {})

    if step == 1:
        return {
            "ridge_edge_mean_ge_-5": d["ridge_edge_mean"] >= -5.0,
            "plain_edge_mean_ge_-5": d["plain_edge_mean"] >= -5.0,
            "global_edge_mean_ge_-5": d["global_edge_mean"] >= -5.0,
            "global_luma_mean_ge_-8": d["global_luma_mean"] >= -8.0,
        }
    if step == 2:
        return {
            # Step 2 聚焦“阴影进入深褐色域”，因此以 shadow 指标为主门禁。
            "redflag_shadow_brownness_rel_le_0_30": float(style_comp.get("shadow_brownness_rel", 9.9)) <= 0.30,
            "redflag_shadow_warmth_rel_le_0_30": float(style_comp.get("shadow_warmth_rel", 9.9)) <= 0.30,
            "redflag_shadow_luma_rel_le_0_20": float(style_comp.get("shadow_luma_mean_rel", 9.9)) <= 0.20,
            # 防回退护栏：结构信号不能明显劣化。
            "redflag_global_edge_rel_le_0_32": float(style_comp.get("global_edge_rel", 9.9)) <= 0.32,
            "redflag_plain_edge_rel_le_0_78": float(style_comp.get("plain_edge_rel", 9.9)) <= 0.78,
            "redflag_ridge_edge_rel_le_0_26": float(style_comp.get("ridge_edge_rel", 9.9)) <= 0.26,
        }
    if step == 3:
        return {
            # Step 3 聚焦“去泥/水感”：颗粒增量 + RedFlag 平原统计（色彩/频率/离散度）三重约束。
            "plain_edge_mean_ge_+1_0pct_vs_prev_step": d["plain_edge_mean"] >= 1.0,
            "plain_luma_std_ge_+0_5pct_vs_prev_step": d["plain_luma_std"] >= 0.5,
            "redflag_plain_luma_mean_rel_le_0_10": float(style_comp.get("plain_luma_mean_rel", 9.9)) <= 0.10,
            "redflag_plain_sat_std_rel_le_0_40": float(style_comp.get("plain_sat_std_rel", 9.9)) <= 0.40,
            "redflag_plain_brown_ratio_rel_le_0_16": float(style_comp.get("plain_brown_ratio_rel", 9.9)) <= 0.16,
            "redflag_plain_lowfreq_ratio_rel_le_0_18": float(style_comp.get("plain_lowfreq_ratio_rel", 9.9)) <= 0.18,
            "redflag_plain_highpass_std_rel_le_0_26": float(style_comp.get("plain_highpass_std_rel", 9.9)) <= 0.26,
            "redflag_plain_sat_bin_ratio_rel_le_0_22": float(style_comp.get("plain_sat_bin_ratio_rel", 9.9)) <= 0.22,
            # 防止靠整体压暗/牺牲山脊来“刷”局部指标。
            "ridge_edge_mean_ge_-2pct_vs_prev_step": d["ridge_edge_mean"] >= -2.0,
            "global_luma_mean_ge_-4pct_vs_prev_step": d["global_luma_mean"] >= -4.0,
            # 延续 Step 2 护栏。
            "redflag_shadow_brownness_rel_le_0_30": float(style_comp.get("shadow_brownness_rel", 9.9)) <= 0.30,
            "redflag_global_edge_rel_le_0_32": float(style_comp.get("global_edge_rel", 9.9)) <= 0.32,
        }
    if step == 4:
        return {
            "redflag_delta_e_mean_le_22": float(style_comp.get("delta_e_mean", 999.0)) <= 22.0,
            "redflag_hue_dist_mean_le_0_060": float(style_comp.get("hue_dist_mean", 9.9)) <= 0.060,
            "redflag_ridge_edge_rel_le_0_20": float(style_comp.get("ridge_edge_rel", 9.9)) <= 0.20,
            "redflag_plain_edge_rel_le_0_64": float(style_comp.get("plain_edge_rel", 9.9)) <= 0.64,
            "redflag_global_edge_rel_le_0_24": float(style_comp.get("global_edge_rel", 9.9)) <= 0.24,
            "redflag_shadow_brownness_rel_le_0_30": float(style_comp.get("shadow_brownness_rel", 9.9)) <= 0.30,
        }
    if step == 5:
        # Step 5 参数包固化：量化上至少不回退 Step 4 质量基线，复用 Step 4 阈值。
        return {
            "redflag_delta_e_mean_le_22": float(style_comp.get("delta_e_mean", 999.0)) <= 22.0,
            "redflag_hue_dist_mean_le_0_060": float(style_comp.get("hue_dist_mean", 9.9)) <= 0.060,
            "redflag_ridge_edge_rel_le_0_20": float(style_comp.get("ridge_edge_rel", 9.9)) <= 0.20,
            "redflag_plain_edge_rel_le_0_64": float(style_comp.get("plain_edge_rel", 9.9)) <= 0.64,
            "redflag_global_edge_rel_le_0_24": float(style_comp.get("global_edge_rel", 9.9)) <= 0.24,
        }
    return {"manual_gate_required": False}


def get_stage_gate(
    step: int,
    q: dict,
    mpp_min: float,
    mpp_max: float,
    capture_report: dict,
    q_guard: dict | None = None,
    capture_guard: dict | None = None,
) -> dict:
    lod_state = capture_report.get("lod_state", {})
    ensure_state = capture_report.get("ensure_tactical_mpp", {})
    profile = str(lod_state.get("profile", ""))
    mpp = float(lod_state.get("metersPerPixel", 0.0) or 0.0)
    ensure_ok = bool(ensure_state.get("satisfied", False))

    preconditions = {
        "profile_is_tactical": profile == "tactical",
        "mpp_in_target_range": mpp_min <= mpp <= mpp_max,
        "ensure_tactical_mpp_satisfied": ensure_ok,
    }
    if q_guard is not None and capture_guard is not None:
        guard_lod = capture_guard.get("lod_state", {})
        guard_ensure = capture_guard.get("ensure_tactical_mpp", {})
        guard_profile = str(guard_lod.get("profile", ""))
        guard_mpp = float(guard_lod.get("metersPerPixel", 0.0) or 0.0)
        preconditions.update(
            {
                "guard_profile_is_tactical": guard_profile == "tactical",
                "guard_mpp_in_target_range": mpp_min <= guard_mpp <= mpp_max,
                "guard_ensure_tactical_mpp_satisfied": bool(guard_ensure.get("satisfied", False)),
            }
        )

    # 累积门禁：当前 step 必须同时满足所有前序 step 的检查项。
    upper = max(1, step)
    per_step_checks = {}
    for s in range(1, upper + 1):
        source_q = q_guard if (q_guard is not None and s <= 2 and step >= 3) else q
        per_step_checks[f"step_{s}"] = build_step_checks(s, source_q)
    checks = {}
    for key, value in per_step_checks.items():
        checks.update({f"{key}.{k}": v for k, v in value.items()})

    stage_pass = all(preconditions.values()) and all(checks.values())
    return {
        "current_step": step,
        "preconditions": preconditions,
        "checks_per_step": per_step_checks,
        "checks": checks,
        "all_passed": stage_pass,
        "next_step": step + 1 if stage_pass else step,
    }


def save_step_baseline(step: int, current_image: Path) -> Path:
    out = Path(f"tests/artifacts/capture_tactical_baseline_step{step}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(current_image, out)
    return out


def auto_advance_todo(todo_path: Path, current_step: int) -> bool:
    text = todo_path.read_text(encoding="utf-8")
    today = date.today().isoformat()

    current_pattern = rf"(Step\s+{current_step}:\s*)in progress"
    next_step = current_step + 1
    next_pattern = rf"(Step\s+{next_step}:\s*)pending"

    updated = re.sub(current_pattern, rf"\1completed (auto gate passed on {today})", text, count=1)
    updated2 = re.sub(next_pattern, r"\1in progress", updated, count=1)
    if updated2 == updated:
        # 处理区间写法，例如 "Step 4-5: pending"
        range_pattern = re.compile(r"^(\s*)(\d+)\.\s*Step\s+(\d+)-(\d+):\s*pending\s*$", re.MULTILINE)
        replaced = False

        def repl(match: re.Match) -> str:
            nonlocal replaced
            indent, _idx, start_s, end_s = match.groups()
            start = int(start_s)
            end = int(end_s)
            if not (start <= next_step <= end):
                return match.group(0)
            lines = []
            for s in range(start, end + 1):
                status = "in progress" if s == next_step else "pending"
                lines.append(f"{indent}{s}. Step {s}: {status}")
            replaced = True
            return "\n".join(lines)

        updated2 = range_pattern.sub(repl, updated2, count=1)
        if not replaced:
            # 如果没有找到下一步 pending，保持原文本。
            updated2 = updated

    if updated2 != text:
        todo_path.write_text(updated2, encoding="utf-8")
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--step", type=int, default=0, help="0 means auto-detect from TODO.md")
    parser.add_argument("--todo", default="TODO.md")
    parser.add_argument("--mpp-min", type=float, default=DEFAULT_MPP_MIN)
    parser.add_argument("--mpp-max", type=float, default=DEFAULT_MPP_MAX)
    parser.add_argument("--auto-advance", action="store_true")
    args = parser.parse_args()

    todo_path = Path(args.todo)
    step = args.step if args.step > 0 else detect_current_step(todo_path)

    align_variant = "mudpit" if step == 3 else "wide"
    capture_report, capture_stdout = run_capture_with_retry(args.mpp_min, args.mpp_max, align_variant)
    baseline_path, baseline_fallback = resolve_step_baseline(step, align_variant)
    bootstrap_baseline_created = False
    if baseline_fallback:
        raise RuntimeError(
            f"Required baseline missing for step={step}, align={align_variant}: {baseline_path}. "
            "Create and freeze this baseline explicitly before running gate."
        )
    quantify_report = run_quantify(baseline_path, align_variant)

    guard_capture_report = None
    guard_quantify_report = None
    if step >= 3:
        guard_capture_report, _guard_stdout = run_capture_with_retry(args.mpp_min, args.mpp_max, "wide")
        guard_baseline_path, _guard_fallback = resolve_step_baseline(1, "wide")
        guard_quantify_report = run_quantify(guard_baseline_path, "wide")

    gate_report = get_stage_gate(
        step,
        quantify_report,
        args.mpp_min,
        args.mpp_max,
        capture_report,
        q_guard=guard_quantify_report,
        capture_guard=guard_capture_report,
    )

    advanced = False
    saved_baseline = None
    if gate_report["all_passed"] and args.auto_advance:
        current_image = Path(quantify_report.get("current", "tests/artifacts/capture_tactical_view.png"))
        if current_image.exists():
            saved_baseline = str(save_step_baseline(step, current_image))
        advanced = auto_advance_todo(todo_path, step)

    print(
        json.dumps(
            {
                "capture": capture_report,
                "capture_align_variant": align_variant,
                "baseline": {
                    "used": str(baseline_path),
                    "fallback_to_step0": baseline_fallback,
                    "bootstrap_created": bootstrap_baseline_created,
                    "saved_on_pass": saved_baseline,
                },
                "quantify": quantify_report,
                "quantify_guard_wide": guard_quantify_report,
                "stage_gate": gate_report,
                "todo_auto_advanced": advanced,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    # 附带完整 capture 输出，便于定位失败原因。
    print("\n=== CAPTURE RAW OUTPUT ===")
    print(capture_stdout.strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
