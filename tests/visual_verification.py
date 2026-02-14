import time
import sys
import os
import re
import json
from playwright.sync_api import sync_playwright

def run():
    force_profile = os.getenv("FORCE_PROFILE", "").strip()
    enable_global_material_attempt = os.getenv("ENABLE_GLOBAL_MATERIAL_ATTEMPT", "").strip().lower() in ("1", "true", "yes", "on")
    terrain_operation_mode = os.getenv("TERRAIN_OPERATION_MODE", "").strip()
    adaptive_lod_max_profile = os.getenv("ADAPTIVE_LOD_MAX_PROFILE", "").strip()
    lod_material_debug_mode_raw = os.getenv("LOD_MATERIAL_DEBUG_MODE", "").strip()
    lod_material_debug_mode = {}
    if lod_material_debug_mode_raw:
        try:
            lod_material_debug_mode = json.loads(lod_material_debug_mode_raw)
        except json.JSONDecodeError:
            print(f"Invalid LOD_MATERIAL_DEBUG_MODE JSON: {lod_material_debug_mode_raw}")
            sys.exit(3)
    expect_mode = os.getenv("EXPECT_MODE", "").strip()
    expect_provider = os.getenv("EXPECT_TERRAIN_PROVIDER", "").strip()
    min_terrain_span = os.getenv("MIN_TERRAIN_SPAN", "").strip()
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        if (
            force_profile
            or enable_global_material_attempt
            or terrain_operation_mode
            or adaptive_lod_max_profile
            or lod_material_debug_mode
        ):
            # 在应用脚本加载前注入运行时配置，用于固定档位/启用 global 材质实验。
            page.add_init_script(
                f"""
                window.E3_CONFIG = Object.assign({{}}, window.E3_CONFIG || {{}}, {{
                    forceProfile: {force_profile!r},
                    enableGlobalMaterialAttempt: {str(enable_global_material_attempt).lower()},
                    terrainOperationMode: {terrain_operation_mode!r},
                    adaptiveLodMaxProfile: {adaptive_lod_max_profile!r},
                    lodMaterialDebugMode: {json.dumps(lod_material_debug_mode)}
                }});
                """
            )
            print(f"Injected forceProfile={force_profile or '(none)'}")
            print(f"Injected enableGlobalMaterialAttempt={enable_global_material_attempt}")
            print(f"Injected terrainOperationMode={terrain_operation_mode or '(none)'}")
            print(f"Injected adaptiveLodMaxProfile={adaptive_lod_max_profile or '(none)'}")
            print(f"Injected lodMaterialDebugMode={lod_material_debug_mode or '(none)'}")
        
        # Capture console logs
        logs = []
        page.on("console", lambda msg: logs.append(msg.text))
        
        print("Navigating to http://localhost:5173...")
        try:
            page.goto("http://localhost:5173", timeout=30000)
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
        suffix_parts = []
        if force_profile:
            suffix_parts.append(force_profile)
        if enable_global_material_attempt:
            suffix_parts.append("global_material")
        suffix = f"_{'_'.join(suffix_parts)}" if suffix_parts else ""
        screenshot_path = f"diagnostic_report{suffix}.png"
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
