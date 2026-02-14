import os
import sys
import time
from playwright.sync_api import sync_playwright


def parse_bool_env(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def run_once(round_idx: int, duration_seconds: int) -> int:
    force_profile = os.getenv("FORCE_PROFILE", "").strip()
    terrain_operation_mode = os.getenv("TERRAIN_OPERATION_MODE", "").strip()
    adaptive_lod_max_profile = os.getenv("ADAPTIVE_LOD_MAX_PROFILE", "").strip()
    enable_global_material_attempt = parse_bool_env("ENABLE_GLOBAL_MATERIAL_ATTEMPT")

    with sync_playwright() as p:
        print(f"[Round {round_idx}] Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        logs: list[str] = []
        page.on("console", lambda msg: logs.append(msg.text))
        page.on("pageerror", lambda err: logs.append(f"PAGEERROR: {err}"))

        if force_profile or terrain_operation_mode or adaptive_lod_max_profile or enable_global_material_attempt:
            page.add_init_script(
                f"""
                window.E3_CONFIG = Object.assign({{}}, window.E3_CONFIG || {{}}, {{
                    forceProfile: {force_profile!r},
                    terrainOperationMode: {terrain_operation_mode!r},
                    adaptiveLodMaxProfile: {adaptive_lod_max_profile!r},
                    enableGlobalMaterialAttempt: {str(enable_global_material_attempt).lower()}
                }});
                """
            )

        try:
            page.goto("http://localhost:5173", timeout=30000)
            page.wait_for_selector(".cesium-viewer", timeout=30000)
        except Exception as exc:
            print(f"[Round {round_idx}] Failed to open app: {exc}")
            browser.close()
            return 2

        time.sleep(2.0)

        end_time = time.time() + duration_seconds
        toggle = True
        while time.time() < end_time:
            page.evaluate(
                """(zoomInFlag) => {
                    const h = window.viewer.camera.positionCartographic.height;
                    const amount = Math.max(120000.0, h * 0.45);
                    if (zoomInFlag) {
                        window.viewer.camera.zoomIn(amount);
                    } else {
                        window.viewer.camera.zoomOut(amount);
                    }
                }""",
                toggle,
            )
            toggle = not toggle
            time.sleep(0.35)

        stats = page.evaluate("window.getLodRuntimeStats ? window.getLodRuntimeStats() : null")
        state = page.evaluate("window.getLodState ? window.getLodState() : null")
        mode = page.evaluate("window.getTerrainRuntimeMode ? window.getTerrainRuntimeMode() : null")

        log_text = "\n".join(logs)
        wasm_oom_count = log_text.count("WebAssembly.instantiate") + log_text.count("WASM OOM")
        unhandled_count = log_text.lower().count("unhandledrejection")

        screenshot_path = (
            f"lod_soak_round{round_idx}_"
            f"{terrain_operation_mode or 'default'}_"
            f"{adaptive_lod_max_profile or 'na'}.png"
        )
        page.screenshot(path=screenshot_path)

        print(f"[Round {round_idx}] Mode={mode}")
        print(f"[Round {round_idx}] State={state}")
        print(f"[Round {round_idx}] Stats={stats}")
        print(f"[Round {round_idx}] WASM_OOM_HITS={wasm_oom_count}")
        print(f"[Round {round_idx}] UNHANDLED_REJECTION_HITS={unhandled_count}")
        print(f"[Round {round_idx}] Screenshot={screenshot_path}")

        browser.close()

        if wasm_oom_count > 0:
            return 3
        return 0


def run() -> int:
    rounds = int(os.getenv("SOAK_ROUNDS", "3"))
    duration_seconds = int(os.getenv("SOAK_DURATION_SECONDS", "240"))
    fail_count = 0

    print(f"Starting soak test: rounds={rounds}, duration={duration_seconds}s")
    for idx in range(1, rounds + 1):
        rc = run_once(idx, duration_seconds)
        if rc != 0:
            fail_count += 1

    print(f"Soak summary: rounds={rounds}, failures={fail_count}")
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(run())
