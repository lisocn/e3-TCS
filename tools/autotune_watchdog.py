import argparse
import json
import os
import re
import select
import signal
import shutil
import subprocess
import sys
import time
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUTO_TUNE_SCRIPT = PROJECT_ROOT / "tests" / "auto_tune_redflag.py"
REPORT_PATH = PROJECT_ROOT / "tests" / "artifacts" / "auto_tune_redflag_report.json"
STATE_PATH = PROJECT_ROOT / "tests" / "artifacts" / "auto_tune_daemon_state.json"
CONFIG_PATH = PROJECT_ROOT / "src" / "config.ts"
GLOBAL_BEST_PATH = PROJECT_ROOT / "tests" / "artifacts" / "auto_tune_global_best.json"
ROUND_BEST_IMAGE = PROJECT_ROOT / "tests" / "artifacts" / "capture_tactical_autotune_best.png"
GLOBAL_BEST_IMAGE = PROJECT_ROOT / "tests" / "artifacts" / "capture_tactical_autotune_global_best.png"
EXIT_LOG_PATH = PROJECT_ROOT / "tests" / "artifacts" / "auto_tune_watchdog_exit.log"


def ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def log_line(log_path: Path, msg: str) -> None:
    line = f"[{ts()}] {msg}\n"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line)


def log_exit(reason: str) -> None:
    EXIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    line = f"[{ts()}] {reason}\n"
    with EXIT_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line)


def rotate_log_if_needed(log_path: Path, max_mb: int) -> None:
    if not log_path.exists():
        return
    max_bytes = max_mb * 1024 * 1024
    if log_path.stat().st_size < max_bytes:
        return
    bak = log_path.with_suffix(log_path.suffix + f".{int(time.time())}.bak")
    log_path.rename(bak)


def get_rss_mb(pid: int) -> float:
    try:
        out = subprocess.check_output(["ps", "-o", "rss=", "-p", str(pid)], text=True).strip()
        if not out:
            return 0.0
        kb = float(out)
        return kb / 1024.0
    except Exception:
        return 0.0


def children_of(pid: int) -> list[int]:
    try:
        out = subprocess.check_output(["pgrep", "-P", str(pid)], text=True).strip()
    except Exception:
        return []
    if not out:
        return []
    pids = []
    for token in out.split():
        try:
            pids.append(int(token))
        except ValueError:
            continue
    return pids


def kill_tree(pid: int, sig: int) -> None:
    for child in children_of(pid):
        kill_tree(child, sig)
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        pass


def terminate_process_tree(pid: int) -> None:
    kill_tree(pid, signal.SIGTERM)
    time.sleep(2.0)
    kill_tree(pid, signal.SIGKILL)


def write_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_report() -> dict | None:
    if not REPORT_PATH.exists():
        return None
    try:
        return json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_global_best() -> dict | None:
    if not GLOBAL_BEST_PATH.exists():
        return None
    try:
        return json.loads(GLOBAL_BEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def better_best(candidate: dict | None, incumbent: dict | None) -> bool:
    if not candidate:
        return False
    if not incumbent:
        return True
    c_checks_total = int(candidate.get("gate_checks_total", 0) or 0)
    i_checks_total = int(incumbent.get("gate_checks_total", 0) or 0)
    # Prefer results produced under a stricter/newer gate definition.
    if c_checks_total != i_checks_total:
        return c_checks_total > i_checks_total
    c_passed = bool(candidate.get("all_passed", False))
    i_passed = bool(incumbent.get("all_passed", False))
    if c_passed != i_passed:
        return c_passed
    c_failed_pre = int(candidate.get("failed_preconditions", 999999))
    i_failed_pre = int(incumbent.get("failed_preconditions", 999999))
    if c_failed_pre != i_failed_pre:
        return c_failed_pre < i_failed_pre
    c_failed_chk = int(candidate.get("failed_checks", 999999))
    i_failed_chk = int(incumbent.get("failed_checks", 999999))
    if c_failed_chk != i_failed_chk:
        return c_failed_chk < i_failed_chk
    c_obj = float(candidate.get("objective", 1e18))
    i_obj = float(incumbent.get("objective", 1e18))
    if c_obj != i_obj:
        return c_obj < i_obj
    c_wide = float(candidate.get("wide_score", 1e18))
    i_wide = float(incumbent.get("wide_score", 1e18))
    if c_wide != i_wide:
        return c_wide < i_wide
    c_mud = float(candidate.get("mudpit_score", 1e18))
    i_mud = float(incumbent.get("mudpit_score", 1e18))
    return c_mud < i_mud


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
    pattern = rf"(\b{re.escape(key)}\s*:\s*)([^,\n]+)"
    repl = rf"\g<1>{value_text}"
    updated, n = re.subn(pattern, repl, block, count=1)
    if n != 1:
        raise RuntimeError(f"Failed to patch key '{key}' in tacticalStyleOverrides block.")
    return updated


def apply_params_to_config(params: dict) -> None:
    if not params:
        return
    content = CONFIG_PATH.read_text(encoding="utf-8")
    start, end = find_tactical_overrides_span(content)
    block = content[start : end + 1]
    for key, value in params.items():
        if isinstance(value, str):
            value_text = f"'{value}'" if value.startswith("#") else value
        elif isinstance(value, bool):
            value_text = "true" if value else "false"
        elif isinstance(value, (int, float)):
            value_text = f"{float(value):.2f}"
        else:
            continue
        block = patch_block_value(block, key, value_text)
    updated = content[:start] + block + content[end + 1 :]
    CONFIG_PATH.write_text(updated, encoding="utf-8")


def run_round(
    level: str,
    max_evals: int,
    verify_runs: int,
    seed: int,
    timeout_seconds: int,
    max_rss_mb: int,
    log_path: Path,
    progress_cb=None,
) -> tuple[bool, str, int]:
    cmd = [
        sys.executable,
        str(AUTO_TUNE_SCRIPT),
        "--level",
        level,
        "--max-evals",
        str(max_evals),
        "--verify-runs",
        str(verify_runs),
        "--seed",
        str(seed),
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=PROJECT_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None

    start = time.time()
    peak_rss = 0.0
    outcome = "unknown"

    while True:
        ready, _, _ = select.select([proc.stdout], [], [], 1.0)
        if ready:
            line = proc.stdout.readline()
            if line:
                log_line(log_path, line.rstrip("\n"))

        ret = proc.poll()
        elapsed = time.time() - start
        rss = get_rss_mb(proc.pid)
        peak_rss = max(peak_rss, rss)
        if progress_cb is not None:
            try:
                progress_cb(elapsed, rss, peak_rss)
            except Exception:
                pass

        if elapsed > timeout_seconds:
            outcome = "timeout"
            log_line(log_path, f"round timeout, killing process tree pid={proc.pid}")
            terminate_process_tree(proc.pid)
            break
        if rss > max_rss_mb:
            outcome = "rss_exceeded"
            log_line(log_path, f"round rss exceeded {rss:.1f}MB>{max_rss_mb}MB, killing pid={proc.pid}")
            terminate_process_tree(proc.pid)
            break
        if ret is not None:
            outcome = f"exit_{ret}"
            break

    # flush remaining output
    try:
        rest = proc.stdout.read()
        if rest:
            for line in rest.splitlines():
                log_line(log_path, line)
    except Exception:
        pass

    report = parse_report()
    passed = bool(report and report.get("best", {}).get("all_passed", False))
    return passed, outcome, int(round(peak_rss))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--level", choices=["draft", "target", "final"], default="final")
    parser.add_argument("--max-evals", type=int, default=24)
    parser.add_argument("--verify-runs", type=int, default=1)
    parser.add_argument("--timeout-seconds", type=int, default=2400)
    parser.add_argument("--max-rss-mb", type=int, default=1800)
    parser.add_argument("--sleep-seconds", type=int, default=20)
    parser.add_argument("--seed-base", type=int, default=20260218)
    parser.add_argument("--max-rounds", type=int, default=0, help="0 means unlimited")
    parser.add_argument("--log", default="tests/artifacts/auto_tune_watchdog.log")
    parser.add_argument("--log-max-mb", type=int, default=20)
    parser.add_argument("--stop-when-pass", action="store_true", default=True)
    parser.add_argument("--keep-running", action="store_true")
    args = parser.parse_args()

    log_path = (PROJECT_ROOT / args.log).resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    stop_when_pass = not args.keep_running

    round_idx = 0
    log_line(
        log_path,
        (
            "watchdog start "
            f"level={args.level} max_evals={args.max_evals} verify_runs={args.verify_runs} "
            f"timeout={args.timeout_seconds}s max_rss={args.max_rss_mb}MB"
        ),
    )

    try:
        while True:
            round_idx += 1
            rotate_log_if_needed(log_path, args.log_max_mb)
            seed = args.seed_base + round_idx
            global_snapshot = load_global_best() or {}
            global_best = global_snapshot.get("best", {})
            global_params = global_best.get("params", {}) if isinstance(global_best, dict) else {}
            global_checks_total = int(global_best.get("gate_checks_total", 0)) if isinstance(global_best, dict) else 0
            min_restore_checks = 65 if args.level == "final" else 0
            allow_restore = bool(global_params) and global_checks_total >= min_restore_checks
            if allow_restore:
                try:
                    apply_params_to_config(global_params)
                    log_line(
                        log_path,
                        (
                            f"round={round_idx} restored_config_from_global_best=true "
                            f"checks_total={global_checks_total}"
                        ),
                    )
                except Exception as exc:
                    log_line(log_path, f"round={round_idx} restore_config_failed={exc}")
            elif global_params:
                log_line(
                    log_path,
                    (
                        f"round={round_idx} restored_config_from_global_best=false "
                        f"reason=stale_gate checks_total={global_checks_total} "
                        f"min_required={min_restore_checks}"
                    ),
                )
            running_state = {
                "updated_at": ts(),
                "round": round_idx,
                "level": args.level,
                "seed": seed,
                "outcome": "running",
                "elapsed_seconds": 0,
                "current_rss_mb": 0,
                "peak_rss_mb": 0,
                "best": global_best if isinstance(global_best, dict) else {},
                "global_best": global_best if isinstance(global_best, dict) else {},
                "global_best_path": str(GLOBAL_BEST_PATH.relative_to(PROJECT_ROOT)),
                "global_best_image": str(GLOBAL_BEST_IMAGE.relative_to(PROJECT_ROOT)),
                "new_global_best": False,
                "passed": False,
                "report_path": str(REPORT_PATH.relative_to(PROJECT_ROOT)),
                "log_path": str(log_path.relative_to(PROJECT_ROOT)),
            }
            write_state(running_state)

            last_heartbeat = 0.0

            def on_progress(elapsed: float, rss: float, peak: float) -> None:
                nonlocal last_heartbeat
                # Avoid frequent disk writes; heartbeat every 15s.
                if elapsed - last_heartbeat < 15.0:
                    return
                last_heartbeat = elapsed
                running_state.update(
                    {
                        "updated_at": ts(),
                        "outcome": "running",
                        "elapsed_seconds": int(elapsed),
                        "current_rss_mb": int(round(rss)),
                        "peak_rss_mb": int(round(peak)),
                    }
                )
                write_state(running_state)

            log_line(log_path, f"round={round_idx} seed={seed} begin")
            passed, outcome, peak_rss = run_round(
                level=args.level,
                max_evals=args.max_evals,
                verify_runs=args.verify_runs,
                seed=seed,
                timeout_seconds=args.timeout_seconds,
                max_rss_mb=args.max_rss_mb,
                log_path=log_path,
                progress_cb=on_progress,
            )
            report = parse_report() or {}
            best = report.get("best", {})
            global_snapshot = load_global_best() or {}
            global_best = global_snapshot.get("best", {})
            is_new_global = better_best(best, global_best)
            if is_new_global:
                global_snapshot = {
                    "updated_at": ts(),
                    "round": round_idx,
                    "seed": seed,
                    "best": best,
                    "source_report": str(REPORT_PATH.relative_to(PROJECT_ROOT)),
                    "source_image": str(ROUND_BEST_IMAGE.relative_to(PROJECT_ROOT)),
                }
                GLOBAL_BEST_PATH.parent.mkdir(parents=True, exist_ok=True)
                GLOBAL_BEST_PATH.write_text(json.dumps(global_snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
                if ROUND_BEST_IMAGE.exists():
                    shutil.copyfile(ROUND_BEST_IMAGE, GLOBAL_BEST_IMAGE)
                global_best = best
            state = {
                "updated_at": ts(),
                "round": round_idx,
                "level": args.level,
                "seed": seed,
                "outcome": outcome,
                "peak_rss_mb": peak_rss,
                "best": best,
                "global_best": global_best,
                "global_best_path": str(GLOBAL_BEST_PATH.relative_to(PROJECT_ROOT)),
                "global_best_image": str(GLOBAL_BEST_IMAGE.relative_to(PROJECT_ROOT)),
                "new_global_best": is_new_global,
                "passed": passed,
                "report_path": str(REPORT_PATH.relative_to(PROJECT_ROOT)),
                "log_path": str(log_path.relative_to(PROJECT_ROOT)),
            }
            write_state(state)
            log_line(
                log_path,
                (
                    f"round={round_idx} done outcome={outcome} peak_rss={peak_rss}MB "
                    f"passed={passed} failed_checks={best.get('failed_checks')} "
                    f"new_global_best={is_new_global}"
                ),
            )

            if passed and stop_when_pass:
                log_line(log_path, f"stop: passed at round={round_idx}")
                log_exit(f"exit_code=0 reason=passed round={round_idx}")
                return 0
            if args.max_rounds > 0 and round_idx >= args.max_rounds:
                log_line(log_path, f"stop: reached max_rounds={args.max_rounds}")
                log_exit(f"exit_code=0 reason=max_rounds round={round_idx}")
                return 0

            time.sleep(max(1, args.sleep_seconds))
    except KeyboardInterrupt:
        log_line(log_path, "stop: keyboard interrupt")
        log_exit("exit_code=130 reason=keyboard_interrupt")
        return 130
    except Exception as exc:
        log_line(log_path, f"fatal: {exc}")
        log_exit(f"exit_code=1 reason=exception detail={exc}")
        raise


if __name__ == "__main__":
    raise SystemExit(main())
