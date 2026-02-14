import json
import os
import subprocess
import sys
from datetime import datetime


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON = os.path.join(ROOT, ".venv", "bin", "python")


def run_cmd(cmd: list[str], env: dict[str, str]) -> tuple[int, str]:
    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return proc.returncode, proc.stdout


def extract_line(text: str, prefix: str) -> str:
    for line in text.splitlines():
        if line.startswith(prefix):
            return line
    return ""


def parse_perf_pass(output: str) -> bool:
    return "PERF GATE PASSED" in output


def main() -> int:
    profiles = ["continental", "regional", "tactical"]
    perf_duration = os.getenv("STAGE2_PERF_DURATION_SECONDS", "45")
    min_avg_fps = os.getenv("STAGE2_MIN_AVG_FPS", "15")
    min_recent_fps = os.getenv("STAGE2_MIN_RECENT_FPS", "12")
    max_avg_switch_ms = os.getenv("STAGE2_MAX_AVG_SWITCH_COST_MS", "30")
    rows: list[dict[str, str | int | bool]] = []

    for profile in profiles:
        case_env = os.environ.copy()
        case_env.update(
            {
                "TERRAIN_OPERATION_MODE": "adaptiveLod",
                "ADAPTIVE_LOD_MAX_PROFILE": profile,
                "ENABLE_GLOBAL_MATERIAL_ATTEMPT": "true",
            }
        )

        bench_rc, bench_out = run_cmd(
            [PYTHON, os.path.join(ROOT, "tests", "lod_switch_benchmark.py")],
            case_env,
        )
        perf_env = case_env.copy()
        perf_env.update(
            {
                "PERF_DURATION_SECONDS": perf_duration,
                "MIN_AVG_FPS": min_avg_fps,
                "MIN_RECENT_FPS": min_recent_fps,
                "MAX_AVG_SWITCH_COST_MS": max_avg_switch_ms,
            }
        )
        perf_rc, perf_out = run_cmd(
            [PYTHON, "-u", os.path.join(ROOT, "tests", "lod_perf_gate.py")],
            perf_env,
        )

        rows.append(
            {
                "profile": profile,
                "benchmark_rc": bench_rc,
                "benchmark_switch_count": extract_line(bench_out, "Switch Count:"),
                "benchmark_switch_seq": extract_line(bench_out, "Switch Sequence:"),
                "benchmark_cap_check": "Cap check passed" in bench_out,
                "perf_rc": perf_rc,
                "perf_passed": parse_perf_pass(perf_out),
                "perf_mode": extract_line(perf_out, "Mode:"),
                "perf_state": extract_line(perf_out, "LOD State:"),
                "perf_summary": extract_line(perf_out, "Perf:"),
            }
        )

    report_dir = os.path.join(ROOT, "docs")
    os.makedirs(report_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_md = os.path.join(report_dir, "stage2_matrix_report.md")
    report_json = os.path.join(report_dir, "stage2_matrix_report.json")

    with open(report_json, "w", encoding="utf-8") as f:
        json.dump({"generated_at": stamp, "rows": rows}, f, ensure_ascii=False, indent=2)

    with open(report_md, "w", encoding="utf-8") as f:
        f.write(f"# Stage2 Matrix Report\n\nGenerated at: {stamp}\n\n")
        f.write("| Profile | Benchmark | Cap Check | Perf Gate |\n")
        f.write("|---|---:|---:|---:|\n")
        for row in rows:
            bench_ok = "PASS" if row["benchmark_rc"] == 0 else "FAIL"
            cap_ok = "PASS" if row["benchmark_cap_check"] else "FAIL"
            perf_ok = "PASS" if row["perf_rc"] == 0 and row["perf_passed"] else "FAIL"
            f.write(f"| {row['profile']} | {bench_ok} | {cap_ok} | {perf_ok} |\n")
        f.write("\n## Details\n\n")
        for row in rows:
            f.write(f"### {row['profile']}\n")
            f.write(f"- benchmark_rc: {row['benchmark_rc']}\n")
            f.write(f"- {row['benchmark_switch_count']}\n")
            f.write(f"- {row['benchmark_switch_seq']}\n")
            f.write(f"- cap_check: {row['benchmark_cap_check']}\n")
            f.write(f"- perf_rc: {row['perf_rc']}\n")
            f.write(f"- perf_passed: {row['perf_passed']}\n")
            f.write(f"- {row['perf_mode']}\n")
            f.write(f"- {row['perf_state']}\n")
            f.write(f"- {row['perf_summary']}\n\n")

    failed = [r for r in rows if not (r["benchmark_rc"] == 0 and r["benchmark_cap_check"] and r["perf_rc"] == 0 and r["perf_passed"])]
    print(f"Matrix report written: {report_md}")
    print(f"Matrix data written: {report_json}")
    print(f"Cases: {len(rows)}, failed: {len(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
