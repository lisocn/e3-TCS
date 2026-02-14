import os
import sys
import time
from playwright.sync_api import sync_playwright


def parse_bool_env(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def parse_float_env(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    return float(raw)


def run() -> int:
    terrain_operation_mode = os.getenv("TERRAIN_OPERATION_MODE", "").strip()
    adaptive_lod_max_profile = os.getenv("ADAPTIVE_LOD_MAX_PROFILE", "").strip()
    force_profile = os.getenv("FORCE_PROFILE", "").strip()
    enable_global_material_attempt = parse_bool_env("ENABLE_GLOBAL_MATERIAL_ATTEMPT")
    min_avg_fps = parse_float_env("MIN_AVG_FPS", 15.0)
    min_recent_fps = parse_float_env("MIN_RECENT_FPS", 12.0)
    max_avg_switch_cost_ms = parse_float_env("MAX_AVG_SWITCH_COST_MS", 30.0)
    run_seconds = int(parse_float_env("PERF_DURATION_SECONDS", 90.0))

    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        logs: list[str] = []
        page.on("console", lambda msg: logs.append(msg.text))
        page.on("pageerror", lambda err: logs.append(f"PAGEERROR: {err}"))

        page.add_init_script(
            f"""
            window.E3_CONFIG = Object.assign({{}}, window.E3_CONFIG || {{}}, {{
                terrainOperationMode: {terrain_operation_mode!r},
                adaptiveLodMaxProfile: {adaptive_lod_max_profile!r},
                forceProfile: {force_profile!r},
                enableGlobalMaterialAttempt: {str(enable_global_material_attempt).lower()}
            }});
            """
        )

        print("Navigating to http://localhost:5173 ...")
        page.goto("http://localhost:5173", timeout=30000)
        page.wait_for_selector(".cesium-viewer", timeout=30000)
        time.sleep(2.0)

        print(f"Running workload for {run_seconds}s ...")
        end_time = time.time() + run_seconds
        zoom_in = True
        while time.time() < end_time:
            page.evaluate(
                """(flag) => {
                    const h = window.viewer.camera.positionCartographic.height;
                    const amount = Math.max(100000.0, h * 0.4);
                    if (flag) {
                        window.viewer.camera.zoomIn(amount);
                    } else {
                        window.viewer.camera.zoomOut(amount);
                    }
                }""",
                zoom_in,
            )
            zoom_in = not zoom_in
            time.sleep(0.3)

        perf = page.evaluate("window.getRenderPerfStats ? window.getRenderPerfStats() : null")
        lod_stats = page.evaluate("window.getLodRuntimeStats ? window.getLodRuntimeStats() : null")
        lod_state = page.evaluate("window.getLodState ? window.getLodState() : null")
        mode = page.evaluate("window.getTerrainRuntimeMode ? window.getTerrainRuntimeMode() : null")

        text = "\n".join(logs)
        wasm_oom_hits = text.count("WebAssembly.instantiate") + text.count("WASM OOM")
        unhandled_hits = text.lower().count("unhandledrejection")

        print("\n=== PERF GATE REPORT ===")
        print(f"Mode: {mode}")
        print(f"LOD State: {lod_state}")
        print(f"Perf: {perf}")
        print(f"LOD Stats: {lod_stats}")
        print(f"WASM_OOM_HITS: {wasm_oom_hits}")
        print(f"UNHANDLED_REJECTION_HITS: {unhandled_hits}")

        errors: list[str] = []
        if not perf:
            errors.append("Render perf API unavailable")
        else:
            if float(perf["averageFps"]) < min_avg_fps:
                errors.append(f"averageFps<{min_avg_fps}")
            if float(perf["recentFps"]) < min_recent_fps:
                errors.append(f"recentFps<{min_recent_fps}")
        if not lod_stats:
            errors.append("LOD stats API unavailable")
        else:
            if float(lod_stats["averageSwitchDurationMs"]) > max_avg_switch_cost_ms:
                errors.append(f"averageSwitchDurationMs>{max_avg_switch_cost_ms}")
        if wasm_oom_hits > 0:
            errors.append("WASM OOM detected")
        if unhandled_hits > 0:
            errors.append("Unhandled rejection detected")

        suffix_parts = [terrain_operation_mode or "default", adaptive_lod_max_profile or "na"]
        screenshot = f"lod_perf_gate_{'_'.join(suffix_parts)}.png"
        page.screenshot(path=screenshot)
        print(f"Screenshot: {screenshot}")

        browser.close()

        if errors:
            print(f"PERF GATE FAILED: {errors}")
            return 1
        print("PERF GATE PASSED")
        return 0


if __name__ == "__main__":
    sys.exit(run())
