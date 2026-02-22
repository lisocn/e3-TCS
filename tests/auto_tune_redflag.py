import argparse
import json
import math
import random
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "src" / "config.ts"
ARTIFACT_DIR = PROJECT_ROOT / "tests" / "artifacts"
REPORT_PATH = ARTIFACT_DIR / "auto_tune_redflag_report.json"
BEST_IMAGE_PATH = ARTIFACT_DIR / "capture_tactical_autotune_best.png"
SEEN_SIGNATURES_PATH = ARTIFACT_DIR / "auto_tune_seen_signatures.json"


PARAM_SPECS: dict[str, dict[str, Any]] = {
    "colorLow": {
        "type": "choice",
        "values": ["#150a00", "#1a0f00", "#221306"],
    },
    "colorHigh": {
        "type": "choice",
        "values": ["#9a5f09", "#a9770a", "#b8860b", "#c08814"],
    },
    "colorRidge": {
        "type": "choice",
        "values": ["#d8a43a", "#f0c64a"],
    },
    "toneGamma": {"type": "float", "min": 1.12, "max": 1.34, "step": 0.02},
    "toneShadowFloor": {"type": "float", "min": 0.18, "max": 0.30, "step": 0.02},
    "redFlagSlopeStart": {"type": "float", "min": 0.08, "max": 0.18, "step": 0.02},
    "redFlagSlopeEnd": {"type": "float", "min": 0.74, "max": 0.84, "step": 0.02},
    "redFlagHardBand": {"type": "float", "min": 0.82, "max": 0.94, "step": 0.02},
    "redFlagWarmBias": {"type": "float", "min": 0.24, "max": 0.62, "step": 0.02},
    "redFlagLutIntensity": {"type": "float", "min": 0.08, "max": 0.30, "step": 0.02},
}

PHASE_KEYS: dict[str, list[str]] = {
    "color": [
        "colorLow",
        "colorHigh",
        "colorRidge",
        "toneGamma",
        "toneShadowFloor",
        "redFlagWarmBias",
        "redFlagLutIntensity",
    ],
    "structure": [
        "redFlagSlopeStart",
        "redFlagSlopeEnd",
        "redFlagHardBand",
    ],
}

FAILED_TO_KEYS: dict[str, list[str]] = {
    "wide.abs.global_luma_std_in_range": ["toneGamma", "toneShadowFloor", "colorHigh", "colorRidge"],
    "wide.abs.global_edge_mean_in_range": ["redFlagHardBand", "redFlagSlopeStart", "redFlagSlopeEnd"],
    "wide.abs.ridge_edge_mean_in_range": ["redFlagHardBand", "redFlagSlopeStart", "redFlagSlopeEnd"],
    "wide.abs.contrast_span_p10_p90_in_range": ["toneGamma", "toneShadowFloor", "colorHigh", "colorLow"],
    "wide.abs.red_ratio_in_range": ["colorLow", "colorHigh", "toneShadowFloor"],
    "wide.abs.ochre_ratio_in_range": ["colorHigh", "colorRidge", "toneGamma", "redFlagWarmBias"],
    "wide.abs.near_white_ratio_le": ["colorRidge", "toneGamma"],
    "wide.abs.bright_clip_ratio_le": ["toneGamma", "toneShadowFloor", "colorRidge"],
    "wide.abs.grid_axis_ratio_in_range": ["redFlagSlopeStart", "redFlagSlopeEnd"],
    "wide.abs.terrain_mean_r_in_range": ["colorLow", "colorHigh", "toneShadowFloor"],
    "wide.abs.terrain_mean_g_in_range": ["colorLow", "colorHigh", "toneShadowFloor"],
    "wide.abs.terrain_mean_b_in_range": ["colorHigh", "colorRidge", "toneShadowFloor"],
    "wide.abs.terrain_gb_ratio_in_range": ["colorRidge", "colorHigh", "toneShadowFloor"],
    "mudpit.abs.plain_lowfreq_ratio_in_range": ["redFlagSlopeStart", "redFlagSlopeEnd", "redFlagHardBand", "toneShadowFloor"],
    "mudpit.abs.plain_highpass_std_in_range": ["redFlagHardBand", "redFlagSlopeStart", "redFlagSlopeEnd"],
    "mudpit.abs.plain_brown_ratio_in_range": ["colorLow", "colorHigh", "toneGamma", "toneShadowFloor"],
    "mudpit.abs.plain_sat_std_in_range": ["toneGamma", "toneShadowFloor"],
    "wide.final.hue_dist_mean_le": ["redFlagWarmBias", "redFlagLutIntensity", "colorHigh"],
    "wide.final.delta_e_mean_le": ["redFlagLutIntensity", "toneGamma", "colorLow", "colorHigh"],
}


@dataclass
class EvalResult:
    stage: str
    signature: str
    params: dict[str, Any]
    objective: float
    failed_preconditions: int
    failed_checks: int
    wide_score: float
    mudpit_score: float
    gate_checks_total: int
    all_passed: bool
    raw: dict[str, Any]
    targeted_checks: list[str] | None = None
    targeted_keys: list[str] | None = None


def log(msg: str) -> None:
    now = time.strftime("%H:%M:%S")
    print(f"[{now}] {msg}", flush=True)


def extract_first_json_block(text: str) -> dict[str, Any]:
    marker = "\n\n=== CAPTURE RAW OUTPUT"
    if marker in text:
        text = text.split(marker, 1)[0]
    return json.loads(text.strip())


def fallback_gate_report(reason: str) -> dict[str, Any]:
    style_defaults = {
        "near_white_ratio": 0.02,
        "bright_clip_ratio": 0.02,
        "red_ratio": 0.45,
        "ochre_ratio": 0.10,
        "grid_axis_ratio": 0.0,
        "terrain_mean_r": 0.25,
        "terrain_mean_g": 0.18,
        "terrain_mean_b": 0.12,
        "terrain_gb_ratio": 1.90,
        "plain_highpass_std": 0.20,
        "plain_lowfreq_ratio": 0.20,
        "plain_sat_std": 0.25,
        "plain_brown_ratio": 0.30,
    }
    return {
        "stage_gate": {
            "preconditions": {
                "capture.execution_ok": False,
            },
            "checks": {
                "capture.execution_ok": False,
            },
            "all_passed": False,
            "error": reason,
        },
        "quantify": {
            "wide": {
                "redflag_style": {
                    "distance_score_current_to_ref": 1.0,
                    "current_style_metrics": dict(style_defaults),
                }
            },
            "mudpit": {
                "redflag_style": {
                    "distance_score_current_to_ref": 1.0,
                    "current_style_metrics": dict(style_defaults),
                }
            },
        },
    }


def run_gate(level: str) -> dict[str, Any]:
    cmd = [sys.executable, str(PROJECT_ROOT / "tests" / "stage_gate_runner.py"), "--level", level]
    proc = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        reason = f"stage_gate_exit={proc.returncode}"
        if proc.stderr.strip():
            reason = f"{reason}; stderr={proc.stderr.strip()[:300]}"
        return fallback_gate_report(reason)
    try:
        return extract_first_json_block(proc.stdout)
    except Exception as exc:
        reason = f"stage_gate_parse_error={exc}"
        if proc.stdout.strip():
            reason = f"{reason}; stdout_head={proc.stdout.strip()[:300]}"
        return fallback_gate_report(reason)


def eval_objective(report: dict[str, Any]) -> tuple[float, int, int, int, float, float, bool]:
    pre = report["stage_gate"]["preconditions"]
    checks = report["stage_gate"]["checks"]
    failed_pre = sum(1 for v in pre.values() if not v)
    failed_chk = sum(1 for v in checks.values() if not v)
    checks_total = len(checks)
    wide_score = float(report["quantify"]["wide"]["redflag_style"]["distance_score_current_to_ref"])
    mudpit_score = float(report["quantify"]["mudpit"]["redflag_style"]["distance_score_current_to_ref"])
    wide_style = report["quantify"]["wide"]["redflag_style"]["current_style_metrics"]
    mudpit_style = report["quantify"]["mudpit"]["redflag_style"]["current_style_metrics"]
    all_passed = bool(report["stage_gate"]["all_passed"])

    def relu(x: float) -> float:
        return x if x > 0.0 else 0.0

    # RedFlag 核心硬约束：去白、去爆亮、抑制血红、保留赭黄、平地去杂波。
    hard_penalty = 0.0
    hard_penalty += 250.0 * relu(float(wide_style.get("near_white_ratio", 0.0)) - 0.0008)
    hard_penalty += 120.0 * relu(float(wide_style.get("bright_clip_ratio", 0.0)) - 0.0035)
    hard_penalty += 80.0 * relu(float(wide_style.get("red_ratio", 0.0)) - 0.28)
    hard_penalty += 80.0 * relu(0.11 - float(wide_style.get("red_ratio", 0.0)))
    hard_penalty += 90.0 * relu(0.32 - float(wide_style.get("ochre_ratio", 0.0)))
    hard_penalty += 80.0 * relu(0.05 - float(wide_style.get("grid_axis_ratio", 0.0)))
    hard_penalty += 120.0 * relu(float(mudpit_style.get("plain_highpass_std", 0.0)) - 0.11)
    hard_penalty += 90.0 * relu(0.46 - float(mudpit_style.get("plain_lowfreq_ratio", 0.0)))
    hard_penalty += 120.0 * relu(0.43 - float(wide_style.get("terrain_mean_r", 0.0)))
    hard_penalty += 120.0 * relu(0.32 - float(wide_style.get("terrain_mean_g", 0.0)))
    hard_penalty += 120.0 * relu(0.21 - float(wide_style.get("terrain_mean_b", 0.0)))
    hard_penalty += 140.0 * relu(float(wide_style.get("terrain_gb_ratio", 0.0)) - 1.52)
    hard_penalty += 110.0 * relu(float(mudpit_style.get("plain_sat_std", 0.0)) - 0.16)
    hard_penalty += 110.0 * relu(0.66 - float(mudpit_style.get("plain_brown_ratio", 0.0)))

    style_term = 30.0 * wide_score + 25.0 * mudpit_score
    objective = failed_pre * 1200.0 + failed_chk * 220.0 + hard_penalty + style_term
    return objective, failed_pre, failed_chk, checks_total, wide_score, mudpit_score, all_passed


def failed_check_names(report: dict[str, Any]) -> list[str]:
    checks = report.get("stage_gate", {}).get("checks", {})
    if not isinstance(checks, dict):
        return []
    return [k for k, v in checks.items() if not bool(v)]


def choose_targeted_checks(
    failed_checks: list[str],
    history: list[EvalResult],
    rng: random.Random,
    k: int = 3,
) -> list[str]:
    if not failed_checks:
        return []
    # Persistently failing checks get higher weight, so each eval is purposeful.
    fail_counts: dict[str, int] = {chk: 1 for chk in failed_checks}
    for e in history[-18:]:
        for chk in failed_check_names(e.raw):
            fail_counts[chk] = fail_counts.get(chk, 0) + 1

    pool = list(failed_checks)
    picked: list[str] = []
    while pool and len(picked) < k:
        weights = [float(fail_counts.get(chk, 1)) for chk in pool]
        total = sum(weights)
        r = rng.random() * total
        acc = 0.0
        chosen = pool[-1]
        for chk, w in zip(pool, weights):
            acc += w
            if acc >= r:
                chosen = chk
                break
        picked.append(chosen)
        pool.remove(chosen)
    return picked


def collect_targeted_keys(targeted_checks: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for chk in targeted_checks:
        for key in FAILED_TO_KEYS.get(chk, []):
            if key in seen:
                continue
            seen.add(key)
            out.append(key)
    return out


def find_tactical_overrides_span(content: str) -> tuple[int, int]:
    tactical_idx = content.find("tactical: {")
    if tactical_idx < 0:
        raise RuntimeError("Failed to locate tactical profile block.")
    overrides_idx = content.find("tacticalStyleOverrides: {", tactical_idx)
    if overrides_idx < 0:
        raise RuntimeError("Failed to locate tacticalStyleOverrides block.")
    brace_start = content.find("{", overrides_idx)
    if brace_start < 0:
        raise RuntimeError("Failed to locate tacticalStyleOverrides opening brace.")
    depth = 0
    for i in range(brace_start, len(content)):
        ch = content[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return brace_start, i
    raise RuntimeError("Failed to locate tacticalStyleOverrides closing brace.")


def patch_block_value(block: str, key: str, value_text: str) -> str:
    import re

    pattern = rf"(\b{re.escape(key)}\s*:\s*)([^,\n]+)"
    repl = rf"\g<1>{value_text}"
    updated, n = re.subn(pattern, repl, block, count=1)
    if n != 1:
        raise RuntimeError(f"Failed to patch key '{key}' in tacticalStyleOverrides block.")
    return updated


def apply_params(content: str, params: dict[str, Any]) -> str:
    start, end = find_tactical_overrides_span(content)
    block = content[start : end + 1]
    for key, value in params.items():
        if isinstance(value, str):
            value_text = f"'{value}'" if value.startswith("#") else value
        elif isinstance(value, bool):
            value_text = "true" if value else "false"
        else:
            value_text = f"{value:.2f}" if isinstance(value, float) else str(value)
        block = patch_block_value(block, key, value_text)
    return content[:start] + block + content[end + 1 :]


def load_current_params(content: str, keys: list[str]) -> dict[str, Any]:
    import re

    start, end = find_tactical_overrides_span(content)
    block = content[start : end + 1]
    out: dict[str, Any] = {}
    for key in keys:
        m = re.search(rf"\b{re.escape(key)}\s*:\s*([^,\n]+)", block)
        if not m:
            spec = PARAM_SPECS.get(key, {})
            if spec.get("type") == "choice":
                vals = spec.get("values", [])
                if vals:
                    out[key] = vals[0]
                    continue
            if spec.get("type") == "float":
                out[key] = float(spec.get("min", 0.0))
                continue
            raise RuntimeError(f"Failed to read key '{key}' from tacticalStyleOverrides block.")
        raw = m.group(1).strip()
        if raw.startswith("'") and raw.endswith("'"):
            out[key] = raw.strip("'")
        elif raw in ("true", "false"):
            out[key] = raw == "true"
        else:
            out[key] = float(raw)
    return out


def normalize_value(key: str, value: Any) -> Any:
    spec = PARAM_SPECS[key]
    if spec["type"] == "choice":
        vals = spec["values"]
        if value in vals:
            return value
        return vals[0]
    v = float(value)
    lo = float(spec["min"])
    hi = float(spec["max"])
    step = float(spec["step"])
    v = min(hi, max(lo, v))
    q = round((v - lo) / step)
    return round(lo + q * step, 4)


def hex_to_rgb01(hex_color: str) -> tuple[float, float, float]:
    text = hex_color.strip().lstrip("#")
    if len(text) != 6:
        return (0.0, 0.0, 0.0)
    r = int(text[0:2], 16) / 255.0
    g = int(text[2:4], 16) / 255.0
    b = int(text[4:6], 16) / 255.0
    return (r, g, b)


def rel_luma(rgb: tuple[float, float, float]) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def nearest_choice_by_luma(key: str, target_luma: float) -> str:
    vals = PARAM_SPECS[key]["values"]
    return min(vals, key=lambda c: abs(rel_luma(hex_to_rgb01(c)) - target_luma))


def enforce_param_constraints(params: dict[str, Any]) -> dict[str, Any]:
    out = dict(params)

    # Color ordering: low < high < ridge in luminance, avoid near-white ridge.
    low_rgb = hex_to_rgb01(str(out["colorLow"]))
    high_rgb = hex_to_rgb01(str(out["colorHigh"]))
    ridge_rgb = hex_to_rgb01(str(out["colorRidge"]))
    low_l = rel_luma(low_rgb)
    high_l = rel_luma(high_rgb)
    ridge_l = rel_luma(ridge_rgb)
    if high_l <= low_l + 0.12:
        out["colorHigh"] = nearest_choice_by_luma("colorHigh", low_l + 0.22)
        high_rgb = hex_to_rgb01(str(out["colorHigh"]))
        high_l = rel_luma(high_rgb)
    if ridge_l <= high_l + 0.10:
        out["colorRidge"] = nearest_choice_by_luma("colorRidge", high_l + 0.16)
        ridge_rgb = hex_to_rgb01(str(out["colorRidge"]))
    # Keep ridge yellow-ish, not whitish.
    rr, rg, rb = ridge_rgb
    if not (rr >= 0.80 and rg >= 0.56 and 0.10 <= rb <= 0.40 and rr >= rg and rg >= rb):
        out["colorRidge"] = "#d8a43a"

    # Keep high color in ochre band, avoid blood-red drift.
    hr, hg, hb = hex_to_rgb01(str(out["colorHigh"]))
    if not (0.46 <= (hg / max(1e-6, hr)) <= 0.84 and 0.06 <= (hb / max(1e-6, hg)) <= 0.56):
        out["colorHigh"] = "#a9770a"

    # Numeric coupling constraints.
    gamma = float(out["toneGamma"])
    shadow = float(out["toneShadowFloor"])
    out["toneGamma"] = normalize_value("toneGamma", max(gamma, shadow + 0.86))

    slope_start = float(out["redFlagSlopeStart"])
    slope_end = float(out["redFlagSlopeEnd"])
    slope_span = slope_end - slope_start
    if slope_span < 0.56:
        slope_end = slope_start + 0.56
    if slope_span > 0.72:
        slope_end = slope_start + 0.72
    out["redFlagSlopeEnd"] = normalize_value("redFlagSlopeEnd", slope_end)

    warm_bias = float(out["redFlagWarmBias"])
    lut_intensity = float(out["redFlagLutIntensity"])
    # Keep LUT as a finishing layer; hue control should mainly come from shader warm bias.
    if lut_intensity > 0.24 and warm_bias > 0.48:
        out["redFlagLutIntensity"] = normalize_value("redFlagLutIntensity", 0.24)
    if warm_bias < 0.30 and float(out["toneGamma"]) < 1.16:
        out["toneGamma"] = normalize_value("toneGamma", 1.16)
    return out


def normalize_params(params: dict[str, Any]) -> dict[str, Any]:
    out = {k: normalize_value(k, v) for k, v in params.items()}
    slope_start = float(out["redFlagSlopeStart"])
    slope_end = float(out["redFlagSlopeEnd"])
    min_end = slope_start + 0.02
    if slope_end < min_end:
        slope_end = min_end
    out["redFlagSlopeEnd"] = normalize_value("redFlagSlopeEnd", slope_end)
    out = enforce_param_constraints(out)
    return out


def random_value_for_key(key: str, rng: random.Random) -> Any:
    spec = PARAM_SPECS[key]
    if spec["type"] == "choice":
        vals = spec["values"]
        return vals[rng.randrange(len(vals))]
    lo = float(spec["min"])
    hi = float(spec["max"])
    return normalize_value(key, lo + rng.random() * (hi - lo))


def params_signature(params: dict[str, Any]) -> str:
    canonical = normalize_params(params)
    items: list[tuple[str, Any]] = []
    for key in sorted(canonical.keys()):
        val = canonical[key]
        if isinstance(val, float):
            items.append((key, round(val, 4)))
        else:
            items.append((key, val))
    return json.dumps(items, ensure_ascii=False, separators=(",", ":"))


def load_seen_signatures() -> set[str]:
    if not SEEN_SIGNATURES_PATH.exists():
        return set()
    try:
        data = json.loads(SEEN_SIGNATURES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return set()
    if not isinstance(data, list):
        return set()
    return {str(x) for x in data}


def save_seen_signatures(signatures: set[str], max_keep: int = 50000) -> None:
    ordered = sorted(signatures)
    if len(ordered) > max_keep:
        ordered = ordered[-max_keep:]
    SEEN_SIGNATURES_PATH.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def mutate_value_with_direction(key: str, current: Any, direction: int, rng: random.Random) -> Any:
    spec = PARAM_SPECS[key]
    if spec["type"] == "choice":
        vals = spec["values"]
        idx = vals.index(current) if current in vals else 0
        step = 1 if direction >= 0 else -1
        if rng.random() < 0.30:
            step *= 2
        nidx = max(0, min(len(vals) - 1, idx + step))
        return vals[nidx]
    base = float(current)
    s = float(spec["step"])
    amp = rng.choice([1, 1, 2])
    return normalize_value(key, base + direction * s * amp)


def directional_hint_for_check(chk: str) -> dict[str, int]:
    # +1 means increase the key, -1 means decrease the key.
    if "global_luma_std_in_range" in chk:
        return {"toneGamma": 1, "toneShadowFloor": -1, "colorRidge": 1}
    if "global_edge_mean_in_range" in chk:
        return {"redFlagHardBand": 1, "redFlagSlopeStart": -1}
    if "ridge_edge_mean_in_range" in chk:
        return {"redFlagHardBand": 1, "redFlagSlopeStart": -1, "redFlagSlopeEnd": 1}
    if "contrast_span_p10_p90_in_range" in chk:
        return {"toneGamma": 1, "toneShadowFloor": -1, "colorHigh": 1}
    if "near_white_ratio_le" in chk:
        return {"colorRidge": -1, "toneGamma": -1}
    if "bright_clip_ratio_le" in chk:
        return {"toneGamma": -1, "toneShadowFloor": 1, "colorRidge": -1}
    if "red_ratio_in_range" in chk:
        return {"colorLow": 1, "colorHigh": 1, "toneShadowFloor": 1, "redFlagWarmBias": 1}
    if "ochre_ratio_in_range" in chk:
        return {"colorHigh": 1, "colorRidge": 1, "toneGamma": 1, "redFlagWarmBias": -1}
    if "grid_axis_ratio_in_range" in chk:
        return {"redFlagSlopeStart": 1, "redFlagSlopeEnd": -1}
    if "terrain_mean_b_in_range" in chk:
        return {"colorRidge": -1, "toneShadowFloor": 1}
    if "terrain_gb_ratio_in_range" in chk:
        return {"colorHigh": 1, "colorRidge": -1, "toneShadowFloor": 1}
    if "plain_highpass_std_in_range" in chk:
        return {"redFlagHardBand": -1, "redFlagSlopeEnd": -1}
    if "plain_lowfreq_ratio_in_range" in chk:
        return {"redFlagSlopeEnd": 1, "redFlagHardBand": -1}
    if "plain_brown_ratio_in_range" in chk:
        return {"colorLow": 1, "colorHigh": 1, "toneGamma": 1}
    if "plain_sat_std_in_range" in chk:
        return {"toneGamma": -1, "toneShadowFloor": -1}
    if "hue_dist_mean_le" in chk:
        return {"redFlagWarmBias": -1, "redFlagLutIntensity": -1}
    if "delta_e_mean_le" in chk:
        return {"redFlagLutIntensity": -1, "toneGamma": -1}
    return {}


def propose_targeted_candidate(
    base: dict[str, Any],
    targeted_checks: list[str],
    phase_keys: list[str],
    rng: random.Random,
) -> tuple[dict[str, Any], list[str]]:
    cand = dict(base)
    targeted_keys = [k for k in collect_targeted_keys(targeted_checks) if k in phase_keys]
    if not targeted_keys:
        targeted_keys = list(phase_keys)
    rng.shuffle(targeted_keys)
    max_changes = max(1, min(4, len(targeted_keys)))
    n_changes = rng.randint(1, max_changes)

    hints: dict[str, int] = {}
    for chk in targeted_checks:
        for key, d in directional_hint_for_check(chk).items():
            if key in phase_keys:
                hints[key] = d

    changed_keys: list[str] = []
    for key in targeted_keys[:n_changes]:
        direction = hints.get(key)
        if direction is None:
            direction = rng.choice([-1, 1])
        cand[key] = mutate_value_with_direction(key, cand[key], direction, rng)
        changed_keys.append(key)
    return normalize_params(cand), changed_keys


def improvement_vs(base: EvalResult, cand: EvalResult) -> dict[str, float | int]:
    return {
        "objective_delta": round(base.objective - cand.objective, 6),
        "failed_checks_delta": base.failed_checks - cand.failed_checks,
        "wide_score_delta": round(base.wide_score - cand.wide_score, 6),
        "mudpit_score_delta": round(base.mudpit_score - cand.mudpit_score, 6),
    }


class Evaluator:
    def __init__(self, original_content: str, level: str):
        self.original_content = original_content
        self.level = level
        self.cache: dict[str, EvalResult] = {}
        self.executed_count = 0
        self.cache_hit_count = 0
        self.history: list[EvalResult] = []

    def _run(
        self,
        stage: str,
        params: dict[str, Any],
        targeted_checks: list[str] | None = None,
        targeted_keys: list[str] | None = None,
    ) -> EvalResult:
        normalized = normalize_params(params)
        patched = apply_params(self.original_content, normalized)
        CONFIG_PATH.write_text(patched, encoding="utf-8")
        report = run_gate(self.level)
        objective, failed_pre, failed_chk, checks_total, wide_score, mudpit_score, all_passed = eval_objective(report)
        signature = params_signature(normalized)
        return EvalResult(
            stage=stage,
            signature=signature,
            params=normalized,
            objective=objective,
            failed_preconditions=failed_pre,
            failed_checks=failed_chk,
            gate_checks_total=checks_total,
            wide_score=wide_score,
            mudpit_score=mudpit_score,
            all_passed=all_passed,
            raw=report,
            targeted_checks=targeted_checks,
            targeted_keys=targeted_keys,
        )

    def evaluate(
        self,
        stage: str,
        params: dict[str, Any],
        use_cache: bool = True,
        targeted_checks: list[str] | None = None,
        targeted_keys: list[str] | None = None,
    ) -> tuple[EvalResult, bool]:
        signature = params_signature(params)
        if use_cache and signature in self.cache:
            self.cache_hit_count += 1
            return self.cache[signature], False
        result = self._run(stage, params, targeted_checks=targeted_checks, targeted_keys=targeted_keys)
        self.executed_count += 1
        self.cache[signature] = result
        self.history.append(result)
        return result, True


def propose_failed_check_fix(
    base: dict[str, Any],
    failed_checks: list[str],
    rng: random.Random,
    max_changes: int = 3,
) -> dict[str, Any]:
    cand = dict(base)
    touched: list[str] = []
    for chk in failed_checks:
        for key in FAILED_TO_KEYS.get(chk, []):
            if key in touched:
                continue
            spec = PARAM_SPECS[key]
            if spec["type"] == "choice":
                vals = spec["values"]
                cur = cand[key]
                idx = vals.index(cur) if cur in vals else 0
                # 倾向较暗/赭黄端，避免红白漂移
                if key == "colorLow":
                    nidx = max(0, idx - 1)
                elif key in ("colorHigh", "colorRidge"):
                    nidx = min(len(vals) - 1, idx + rng.choice([-1, 0, 1]))
                else:
                    nidx = max(0, min(len(vals) - 1, idx + rng.choice([-1, 1])))
                cand[key] = vals[nidx]
            else:
                step = float(spec["step"])
                delta = step * rng.choice([-2, -1, 1, 2])
                if key in ("toneShadowFloor", "redFlagSlopeEnd"):
                    delta = -abs(delta)
                if key in ("toneGamma", "redFlagSlopeEnd", "redFlagHardBand"):
                    delta = abs(delta)
                cand[key] = normalize_value(key, float(cand[key]) + delta)
            touched.append(key)
            if len(touched) >= max_changes:
                return normalize_params(cand)
    return normalize_params(cand)


def lhs_candidates(base_params: dict[str, Any], count: int, rng: random.Random) -> list[dict[str, Any]]:
    keys = list(PARAM_SPECS.keys())
    float_keys = [k for k in keys if PARAM_SPECS[k]["type"] == "float"]
    choice_keys = [k for k in keys if PARAM_SPECS[k]["type"] == "choice"]

    u_map: dict[str, list[float]] = {}
    for key in float_keys:
        perm = list(range(count))
        rng.shuffle(perm)
        u_map[key] = [(p + rng.random()) / count for p in perm]

    out: list[dict[str, Any]] = []
    for i in range(count):
        cand = dict(base_params)
        for key in float_keys:
            spec = PARAM_SPECS[key]
            lo = float(spec["min"])
            hi = float(spec["max"])
            cand[key] = normalize_value(key, lo + u_map[key][i] * (hi - lo))
        for key in choice_keys:
            vals = PARAM_SPECS[key]["values"]
            cand[key] = vals[rng.randrange(len(vals))]
        out.append(normalize_params(cand))
    return out


def local_neighbors(center: dict[str, Any], rng: random.Random) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, spec in PARAM_SPECS.items():
        if spec["type"] == "float":
            base = float(center[key])
            step = float(spec["step"])
            for scale in (1.0, 0.5):
                for sign in (-1.0, 1.0):
                    cand = dict(center)
                    cand[key] = normalize_value(key, base + sign * step * scale)
                    out.append(normalize_params(cand))
        else:
            vals = spec["values"]
            idx = vals.index(center[key]) if center[key] in vals else 0
            for shift in (-1, 1):
                nidx = idx + shift
                if 0 <= nidx < len(vals):
                    cand = dict(center)
                    cand[key] = vals[nidx]
                    out.append(normalize_params(cand))
    rng.shuffle(out)
    return out


def cem_candidates(
    elite: list[EvalResult],
    base_params: dict[str, Any],
    keys: list[str],
    count: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    if count <= 0:
        return []
    if not elite:
        return [normalize_params(dict(base_params)) for _ in range(count)]
    out: list[dict[str, Any]] = []
    choice_probs: dict[str, dict[Any, float]] = {}
    for key in keys:
        spec = PARAM_SPECS[key]
        if spec["type"] == "choice":
            vals = spec["values"]
            counts = {v: 1.0 for v in vals}
            for e in elite:
                counts[e.params[key]] = counts.get(e.params[key], 1.0) + 1.0
            total = sum(counts.values())
            choice_probs[key] = {v: counts[v] / total for v in vals}

    for _ in range(count):
        cand = dict(base_params)
        for key in keys:
            spec = PARAM_SPECS[key]
            if spec["type"] == "choice":
                probs = choice_probs[key]
                vals = list(probs.keys())
                ws = [probs[v] for v in vals]
                r = rng.random() * sum(ws)
                acc = 0.0
                picked = vals[-1]
                for v, w in zip(vals, ws):
                    acc += w
                    if acc >= r:
                        picked = v
                        break
                cand[key] = picked
            else:
                values = [float(e.params[key]) for e in elite]
                mean = sum(values) / len(values)
                var = sum((x - mean) ** 2 for x in values) / max(1, len(values) - 1)
                std = max(math.sqrt(var), float(spec["step"]) * 0.75)
                sampled = rng.gauss(mean, std)
                cand[key] = normalize_value(key, sampled)
        out.append(normalize_params(cand))
    return out


def summarize_eval(result: EvalResult) -> dict[str, Any]:
    return {
        "stage": result.stage,
        "params": result.params,
        "objective": result.objective,
        "failed_preconditions": result.failed_preconditions,
        "failed_checks": result.failed_checks,
        "gate_checks_total": result.gate_checks_total,
        "wide_score": result.wide_score,
        "mudpit_score": result.mudpit_score,
        "all_passed": result.all_passed,
        "targeted_checks": result.targeted_checks or [],
        "targeted_keys": result.targeted_keys or [],
    }


def report_progress(stage: str, index: int, total: int, result: EvalResult, best: EvalResult, evaluator: Evaluator) -> None:
    targeted = ",".join((result.targeted_checks or [])[:2]) or "-"
    log(
        f"progress stage={stage} {index}/{total} "
        f"obj={result.objective:.3f} checks={result.failed_checks} "
        f"best_obj={best.objective:.3f} best_checks={best.failed_checks} "
        f"executed={evaluator.executed_count} cache_hits={evaluator.cache_hit_count} "
        f"target={targeted}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", choices=["draft", "target", "final"], default="target")
    parser.add_argument("--max-evals", type=int, default=24)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--verify-runs", type=int, default=3)
    parser.add_argument("--seed", type=int, default=20260218)
    parser.add_argument("--skip-best-rerun", action="store_true")
    args = parser.parse_args()

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    original = CONFIG_PATH.read_text(encoding="utf-8")
    keys = list(PARAM_SPECS.keys())
    current = load_current_params(original, keys)
    current = normalize_params(current)
    rng = random.Random(args.seed)

    # main_budget includes baseline; verify runs are separate.
    main_budget = max(1, args.max_evals)
    search_budget = max(0, main_budget - 1)
    color_budget = 0
    structure_budget = 0
    if search_budget > 0:
        color_budget = max(1, int(round(search_budget * 0.6)))
        color_budget = min(color_budget, search_budget)
        structure_budget = max(0, search_budget - color_budget)
    elite_size = max(2, min(5, args.top_k))

    evaluator = Evaluator(original, args.level)
    verify_results: list[EvalResult] = []
    seen_signatures = load_seen_signatures()
    persistent_skips = 0

    try:
        log(
            f"start level={args.level} max_evals={args.max_evals} "
            f"main_budget={main_budget} search_budget={search_budget} "
            f"color={color_budget} structure={structure_budget} verify_runs={args.verify_runs}"
        )

        baseline, _ = evaluator.evaluate("baseline", current, use_cache=True)
        best = baseline
        seen_signatures.add(baseline.signature)
        log(
            f"baseline obj={baseline.objective:.3f} checks={baseline.failed_checks} "
            f"wide={baseline.wide_score:.3f} mudpit={baseline.mudpit_score:.3f}"
        )

        # Stage A: color-first, failure-driven (ordered search, not random wandering)
        color_done = 0
        color_retry = 0
        while color_done < color_budget and color_retry < max(30, color_budget * 12):
            color_retry += 1
            fchecks = failed_check_names(best.raw)
            targeted_checks = choose_targeted_checks(fchecks, evaluator.history, rng, k=3)
            if targeted_checks:
                merged, targeted_keys = propose_targeted_candidate(best.params, targeted_checks, PHASE_KEYS["color"], rng)
            else:
                cands = cem_candidates(sorted(evaluator.history, key=lambda r: r.objective)[:elite_size], best.params, PHASE_KEYS["color"], 1, rng)
                merged = dict(best.params)
                for k in PHASE_KEYS["color"]:
                    merged[k] = cands[0][k]
                merged = normalize_params(merged)
                targeted_keys = []
            if params_signature(merged) in seen_signatures:
                persistent_skips += 1
                continue
            res, executed = evaluator.evaluate(
                "color_targeted",
                merged,
                use_cache=True,
                targeted_checks=targeted_checks,
                targeted_keys=targeted_keys,
            )
            if not executed:
                continue
            color_done += 1
            seen_signatures.add(res.signature)
            if res.objective < best.objective:
                best = res
            report_progress("color_targeted", color_done, color_budget, res, best, evaluator)

        # Stage B: structure second
        structure_done = 0
        structure_retry = 0
        while structure_done < structure_budget and structure_retry < max(30, structure_budget * 12):
            structure_retry += 1
            fchecks = failed_check_names(best.raw)
            targeted_checks = choose_targeted_checks(fchecks, evaluator.history, rng, k=3)
            if targeted_checks:
                merged, targeted_keys = propose_targeted_candidate(best.params, targeted_checks, PHASE_KEYS["structure"], rng)
            else:
                cands = cem_candidates(sorted(evaluator.history, key=lambda r: r.objective)[:elite_size], best.params, PHASE_KEYS["structure"], 1, rng)
                merged = dict(best.params)
                for k in PHASE_KEYS["structure"]:
                    merged[k] = cands[0][k]
                merged = normalize_params(merged)
                targeted_keys = []
            # Keep small chance of crossed-phase repair if color anchors are still failing.
            if rng.random() < 0.25:
                merged = propose_failed_check_fix(merged, fchecks, rng, max_changes=2)
            if params_signature(merged) in seen_signatures:
                persistent_skips += 1
                continue
            res, executed = evaluator.evaluate(
                "structure_targeted",
                merged,
                use_cache=True,
                targeted_checks=targeted_checks,
                targeted_keys=targeted_keys,
            )
            if not executed:
                continue
            structure_done += 1
            seen_signatures.add(res.signature)
            if res.objective < best.objective:
                best = res
            report_progress("structure_targeted", structure_done, structure_budget, res, best, evaluator)

        # 写回当前最佳配置。
        best_content = apply_params(original, best.params)
        CONFIG_PATH.write_text(best_content, encoding="utf-8")

        # Stage 3: Stability verify (可选重复跑，不走缓存)。
        if args.verify_runs > 0 and not args.skip_best_rerun:
            for i in range(1, args.verify_runs + 1):
                res, _ = evaluator.evaluate("verify", best.params, use_cache=False)
                verify_results.append(res)
                if res.objective < best.objective:
                    best = res
                log(
                    f"progress stage=verify {i}/{args.verify_runs} "
                    f"obj={res.objective:.3f} checks={res.failed_checks} all_passed={res.all_passed}"
                )

        # 固化最优截图（stage_gate_runner 产物固定路径）。
        latest = ARTIFACT_DIR / "capture_tactical_view.png"
        if latest.exists():
            shutil.copyfile(latest, BEST_IMAGE_PATH)

        verify_passes = sum(1 for r in verify_results if r.all_passed)
        verify_total = len(verify_results)

        baseline_improvement = improvement_vs(baseline, best)
        fixed_checks_from_baseline = sorted(
            set(failed_check_names(baseline.raw)) - set(failed_check_names(best.raw))
        )
        still_failed_checks = failed_check_names(best.raw)

        report = {
            "level": args.level,
            "seed": args.seed,
            "max_evals": args.max_evals,
            "main_budget": main_budget,
            "search_budget": search_budget,
            "color_budget": color_budget,
            "structure_budget": structure_budget,
            "verify_runs": args.verify_runs,
            "executed_evals": evaluator.executed_count,
            "cache_hits": evaluator.cache_hit_count,
            "persistent_skips": persistent_skips,
            "seen_signatures_total": len(seen_signatures),
            "value_summary": {
                "baseline_to_best": baseline_improvement,
                "fixed_checks_count": len(fixed_checks_from_baseline),
                "fixed_checks_sample": fixed_checks_from_baseline[:12],
                "still_failed_checks_count": len(still_failed_checks),
                "still_failed_checks_sample": still_failed_checks[:16],
            },
            "evaluations": [summarize_eval(e) for e in evaluator.history],
            "verify": [summarize_eval(e) for e in verify_results],
            "verify_passes": verify_passes,
            "verify_total": verify_total,
            "best": summarize_eval(best),
            "best_image": str(BEST_IMAGE_PATH.relative_to(PROJECT_ROOT)),
        }
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        save_seen_signatures(seen_signatures)

        log(
            f"done best_obj={best.objective:.3f} best_checks={best.failed_checks} "
            f"best_all_passed={best.all_passed} verify={verify_passes}/{verify_total}"
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception:
        CONFIG_PATH.write_text(original, encoding="utf-8")
        raise


if __name__ == "__main__":
    raise SystemExit(main())
