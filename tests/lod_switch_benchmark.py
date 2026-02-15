import sys
import time
import os
import re
from playwright.sync_api import sync_playwright


def get_lod_state(page):
    return page.evaluate("window.getLodState ? window.getLodState() : null")


def ensure_screenshot_path(path: str, default_name: str) -> str:
    resolved = path.strip() or os.path.join("tests", "artifacts", default_name)
    screenshot_dir = os.path.dirname(resolved)
    if screenshot_dir:
        os.makedirs(screenshot_dir, exist_ok=True)
    return resolved


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
    app_url = os.getenv("E3_APP_URL", "http://localhost:5173").strip()
    screenshot_path = ensure_screenshot_path(
        os.getenv("LOD_BENCH_SCREENSHOT", "").strip(),
        "lod_switch_benchmark.png",
    )
    min_switch_count = int(os.getenv("LOD_BENCH_MIN_SWITCH_COUNT", "3"))
    required_profiles_raw = os.getenv(
        "LOD_BENCH_REQUIRE_PROFILES", "global,continental,regional,tactical"
    ).strip()
    required_profiles = [
        item.strip().lower()
        for item in required_profiles_raw.split(",")
        if item.strip()
    ]

    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        logs: list[str] = []
        page.on("console", lambda msg: logs.append(msg.text))

        print(f"Navigating to {app_url} ...")
        try:
            page.goto(app_url, timeout=30000)
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

        actual_switch_count = int(stats["switchCount"])
        missing_profiles = [
            profile for profile in required_profiles
            if profile not in switch_profiles and state["profile"] != profile
        ]
        if actual_switch_count < min_switch_count:
            print(
                f"ERROR: switchCount too low. required>={min_switch_count}, actual={actual_switch_count}"
            )
            browser.close()
            return 3
        if missing_profiles:
            print(f"ERROR: required profiles not reached: {missing_profiles}")
            browser.close()
            return 4

        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(run())
