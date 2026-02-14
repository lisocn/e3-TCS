import sys
import time
import os
import re
from playwright.sync_api import sync_playwright


PROFILE_ORDER = ["global", "continental", "regional", "tactical"]


def parse_bool_env(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def get_lod_state(page):
    return page.evaluate("window.getLodState ? window.getLodState() : null")


def drive_mpp_towards(page, target_mpp: float, direction: str) -> None:
    for _ in range(36):
        state = get_lod_state(page)
        if not state:
            return
        mpp = float(state["metersPerPixel"])
        if direction == "in" and mpp <= target_mpp:
            return
        if direction == "out" and mpp >= target_mpp:
            return
        page.evaluate(
            """(dir) => {
                const h = window.viewer.camera.positionCartographic.height;
                const amount = Math.max(120000.0, h * 0.42);
                if (dir === 'in') {
                    window.viewer.camera.zoomIn(amount);
                } else {
                    window.viewer.camera.zoomOut(amount);
                }
            }""",
            direction,
        )
        time.sleep(0.35)


def run() -> int:
    force_profile = os.getenv("FORCE_PROFILE", "").strip()
    terrain_operation_mode = os.getenv("TERRAIN_OPERATION_MODE", "").strip()
    adaptive_lod_max_profile = os.getenv("ADAPTIVE_LOD_MAX_PROFILE", "").strip()
    enable_global_material_attempt = parse_bool_env("ENABLE_GLOBAL_MATERIAL_ATTEMPT")

    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        logs: list[str] = []
        page.on("console", lambda msg: logs.append(msg.text))

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
            print(f"Injected forceProfile={force_profile or '(none)'}")
            print(f"Injected terrainOperationMode={terrain_operation_mode or '(none)'}")
            print(f"Injected adaptiveLodMaxProfile={adaptive_lod_max_profile or '(none)'}")
            print(f"Injected enableGlobalMaterialAttempt={enable_global_material_attempt}")

        print("Navigating to http://localhost:5173 ...")
        try:
            page.goto("http://localhost:5173", timeout=30000)
            page.wait_for_selector(".cesium-viewer", timeout=30000)
        except Exception as exc:
            print(f"Failed to open app: {exc}")
            browser.close()
            return 1

        # 等待初始地形与 LOD 逻辑稳定
        time.sleep(2.0)

        # 按目标 mpp 驱动相机，确保跨越阈值并触发切档。
        checkpoints = [
            ("out", 22000.0),
            ("in", 9000.0),
            ("in", 5200.0),
            ("in", 3200.0),
            ("in", 1600.0),
            ("in", 600.0),
            ("in", 180.0),
            ("out", 7000.0),
            ("out", 18000.0),
        ]

        print("Running LOD switch benchmark path...")
        for direction, target_mpp in checkpoints:
            drive_mpp_towards(page, target_mpp, direction)
            time.sleep(0.9)
            state = get_lod_state(page)
            if state:
                print(
                    f"Checkpoint dir={direction} target_mpp={target_mpp:.2f} "
                    f"reached_mpp={float(state['metersPerPixel']):.2f} profile={state['profile']}"
                )

        stats = page.evaluate("window.getLodRuntimeStats ? window.getLodRuntimeStats() : null")
        state = page.evaluate("window.getLodState ? window.getLodState() : null")
        mode = page.evaluate("window.getTerrainRuntimeMode ? window.getTerrainRuntimeMode() : null")

        print("\n=== LOD BENCHMARK REPORT ===")
        if not stats or not state:
            print("LOD runtime APIs are unavailable.")
            browser.close()
            return 2

        print(f"Current Profile: {state['profile']}")
        print(f"Current MPP: {state['metersPerPixel']:.2f}")
        print(f"Runtime Mode: {mode}")
        print(f"Switch Count: {stats['switchCount']}")
        print(f"Last Switch Cost: {stats['lastSwitchDurationMs']:.2f} ms")
        print(f"Average Switch Cost: {stats['averageSwitchDurationMs']:.2f} ms")
        print(f"Last Switch At(EpochMs): {stats.get('lastSwitchAtEpochMs')}")

        switch_profiles: list[str] = []
        pattern = re.compile(r"LOD profile switched to ([a-zA-Z]+)")
        for line in logs:
            match = pattern.search(line)
            if match:
                switch_profiles.append(match.group(1).lower())
        print(f"Switch Sequence: {switch_profiles}")

        if terrain_operation_mode == "adaptiveLod" and adaptive_lod_max_profile:
            max_index = PROFILE_ORDER.index(adaptive_lod_max_profile) if adaptive_lod_max_profile in PROFILE_ORDER else -1
            if max_index >= 0:
                exceeded = [p for p in switch_profiles if p in PROFILE_ORDER and PROFILE_ORDER.index(p) > max_index]
                if exceeded:
                    print(f"ERROR: Found profiles beyond cap({adaptive_lod_max_profile}): {exceeded}")
                    browser.close()
                    return 3
                print(f"Cap check passed: no profile exceeded {adaptive_lod_max_profile}.")

        suffix_parts = []
        if terrain_operation_mode:
            suffix_parts.append(terrain_operation_mode)
        if adaptive_lod_max_profile:
            suffix_parts.append(adaptive_lod_max_profile)
        if enable_global_material_attempt:
            suffix_parts.append("global_material")
        suffix = f"_{'_'.join(suffix_parts)}" if suffix_parts else ""
        screenshot_path = f"lod_switch_benchmark{suffix}.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(run())
