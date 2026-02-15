import time
import sys
import os
import re
from playwright.sync_api import sync_playwright


def ensure_screenshot_path(path: str, default_name: str) -> str:
    resolved = path.strip() or os.path.join("tests", "artifacts", default_name)
    screenshot_dir = os.path.dirname(resolved)
    if screenshot_dir:
        os.makedirs(screenshot_dir, exist_ok=True)
    return resolved


def run():
    app_url = os.getenv("E3_APP_URL", "http://localhost:5173").strip()
    expect_mode = os.getenv("EXPECT_MODE", "").strip()
    expect_provider = os.getenv("EXPECT_TERRAIN_PROVIDER", "").strip()
    min_terrain_span = os.getenv("MIN_TERRAIN_SPAN", "").strip()
    screenshot_path = ensure_screenshot_path(
        os.getenv("DIAGNOSTIC_SCREENSHOT", "").strip(),
        "diagnostic_report.png",
    )
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Capture console logs
        logs = []
        page.on("console", lambda msg: logs.append(msg.text))
        
        print(f"Navigating to {app_url}...")
        try:
            page.goto(app_url, timeout=30000)
        except Exception as e:
            print(f"Navigation failed: {e}")
            browser.close()
            sys.exit(1)
        
        # Wait for the app to load
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except:
            print("Network idle timeout, continuing...")
        
        # Explicitly wait for Cesium Viewer to mount
        try:
            page.wait_for_selector(".cesium-viewer", timeout=30000)
            print("Cesium Viewer detected.")
        except Exception as e:
            print("Timed out waiting for .cesium-viewer")
            browser.close()
            sys.exit(1)

        # Wait for terrain/globe initialization
        print("Waiting for terrain initialization (5s)...")
        time.sleep(5)

        lod_before = page.evaluate("window.getLodState ? window.getLodState() : null")
        mode_before = page.evaluate("window.getTerrainRuntimeMode ? window.getTerrainRuntimeMode() : null")
        camera_before = page.evaluate(
            """
            (() => {
                if (!window.viewer) return null;
                const c = window.viewer.camera.positionCartographic;
                return { height: c.height, longitude: c.longitude, latitude: c.latitude };
            })()
            """
        )
        print(f"LOD before diagnostics: {lod_before}")
        print(f"Runtime mode before diagnostics: {mode_before}")
        print(f"Camera before diagnostics: {camera_before}")

        print("Executing runDiagnostics()...")
        try:
            # We await the promise returned by runDiagnostics
            # Playwright evaluate automatically waits if a promise is returned
            page.evaluate("window.runDiagnostics()")
            print("Diagnostics execution finished.")
        except Exception as e:
            print(f"Error executing diagnostics: {e}")

        lod_after = page.evaluate("window.getLodState ? window.getLodState() : null")
        mode_after = page.evaluate("window.getTerrainRuntimeMode ? window.getTerrainRuntimeMode() : null")
        camera_after = page.evaluate(
            """
            (() => {
                if (!window.viewer) return null;
                const c = window.viewer.camera.positionCartographic;
                return { height: c.height, longitude: c.longitude, latitude: c.latitude };
            })()
            """
        )
        print(f"LOD after diagnostics: {lod_after}")
        print(f"Runtime mode after diagnostics: {mode_after}")
        print(f"Camera after diagnostics: {camera_after}")

        # Filter and print relevant logs
        print("\n=== DIAGNOSTIC REPORT ===")
        keywords = (
            "VisualDiagnostics",
            "[RESULT]",
            "Terrain Spread",
            "LOD profile switched",
            "Tactical material preset",
            "imagery layer count",
            "Mode:"
        )
        results = [l for l in logs if any(k in l for k in keywords)]
        for log in results:
            print(log)
            
        if not results:
            print("No diagnostic logs found! Dumping all logs:")
            for log in logs:
                print(log)

        # Screenshot
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # Optional assertions for regression gating
        assertion_errors = []
        if expect_mode:
            actual_mode = str(mode_after or "")
            if actual_mode != expect_mode:
                assertion_errors.append(
                    f"EXPECT_MODE mismatch: expected={expect_mode}, actual={actual_mode}"
                )

        if expect_provider:
            provider_line = next((line for line in logs if "[Terrain Spread] provider=" in line), "")
            actual_provider = ""
            if provider_line:
                actual_provider = provider_line.split("provider=", 1)[1].strip()
            if actual_provider != expect_provider:
                assertion_errors.append(
                    f"EXPECT_TERRAIN_PROVIDER mismatch: expected={expect_provider}, actual={actual_provider or '(none)'}"
                )

        if min_terrain_span:
            span_threshold = float(min_terrain_span)
            span_line = next((line for line in logs if "[Terrain Spread] method=" in line and "span=" in line), "")
            span_val = None
            if span_line:
                match = re.search(r"span=([-+]?[0-9]*\.?[0-9]+)m", span_line)
                if match:
                    span_val = float(match.group(1))
            if span_val is None or span_val < span_threshold:
                assertion_errors.append(
                    f"MIN_TERRAIN_SPAN mismatch: threshold={span_threshold}, actual={span_val}"
                )

        if assertion_errors:
            print("ASSERTIONS FAILED:")
            for err in assertion_errors:
                print(f"- {err}")
            browser.close()
            sys.exit(2)

        browser.close()

if __name__ == "__main__":
    run()
