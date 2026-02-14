import json
import os
import sys
import time
from playwright.sync_api import sync_playwright


def parse_bool_env(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def run() -> int:
    terrain_operation_mode = os.getenv("TERRAIN_OPERATION_MODE", "adaptiveLod").strip()
    adaptive_lod_max_profile = os.getenv("ADAPTIVE_LOD_MAX_PROFILE", "tactical").strip()
    force_profile = os.getenv("FORCE_PROFILE", "tactical").strip()
    enable_global_material_attempt = parse_bool_env("ENABLE_GLOBAL_MATERIAL_ATTEMPT")
    wait_seconds = float(os.getenv("CAPTURE_WAIT_SECONDS", "6"))
    screenshot_path = os.getenv("CAPTURE_SCREENSHOT", "capture_tactical_view.png").strip()
    scan_nevada = parse_bool_env("CAPTURE_SCAN_NEVADA")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        logs: list[str] = []
        page.on("console", lambda msg: logs.append(msg.text))

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

        page.goto("http://localhost:5173", timeout=30000)
        page.wait_for_selector(".cesium-viewer", timeout=30000)
        time.sleep(wait_seconds)

        if scan_nevada:
            best_focus = page.evaluate(
                """
                async () => {
                    if (!window.viewer || !window.Cesium) return null;
                    const Cesium = window.Cesium;
                    const candidates = [
                        { lon: -118.30, lat: 36.58 },
                        { lon: -117.18, lat: 36.58 },
                        { lon: -116.85, lat: 37.25 },
                        { lon: -116.30, lat: 37.45 },
                        { lon: -115.85, lat: 37.35 },
                        { lon: -115.35, lat: 36.92 },
                        { lon: -114.90, lat: 37.65 }
                    ];
                    const lonStep = Cesium.Math.toRadians(0.08);
                    const latStep = Cesium.Math.toRadians(0.08);
                    let best = null;
                    for (const c of candidates) {
                        const points = [];
                        for (let y = -1; y <= 1; y += 1) {
                            for (let x = -1; x <= 1; x += 1) {
                                points.push(new Cesium.Cartographic(
                                    Cesium.Math.toRadians(c.lon) + x * lonStep,
                                    Cesium.Math.toRadians(c.lat) + y * latStep,
                                    0
                                ));
                            }
                        }
                        let sampled;
                        try {
                            sampled = await Cesium.sampleTerrainMostDetailed(window.viewer.terrainProvider, points);
                        } catch (_err) {
                            sampled = await Cesium.sampleTerrain(window.viewer.terrainProvider, 9, points);
                        }
                        const heights = sampled.map((p) => p.height).filter((h) => Number.isFinite(h));
                        if (!heights.length) continue;
                        const span = Math.max(...heights) - Math.min(...heights);
                        if (!best || span > best.span) {
                            best = { lon: c.lon, lat: c.lat, span };
                        }
                    }
                    if (best) {
                        window.viewer.camera.setView({
                            destination: Cesium.Cartesian3.fromDegrees(best.lon, best.lat, 5200.0),
                            orientation: {
                                heading: Cesium.Math.toRadians(24.0),
                                pitch: Cesium.Math.toRadians(-22.0),
                                roll: 0.0
                            }
                        });
                    }
                    return best;
                }
                """
            )
            print(f"NevadaBestFocus: {best_focus}")
            time.sleep(1.2)

        # 等待一次稳定渲染，避免抓到切档中间帧。
        page.evaluate("window.viewer.scene.requestRender()")
        time.sleep(1.0)

        state = page.evaluate("window.getLodState ? window.getLodState() : null")
        mode = page.evaluate("window.getTerrainRuntimeMode ? window.getTerrainRuntimeMode() : null")
        camera = page.evaluate(
            """
            (() => {
                if (!window.viewer) return null;
                const c = window.viewer.camera.positionCartographic;
                return {
                    lonDeg: Cesium.Math.toDegrees(c.longitude),
                    latDeg: Cesium.Math.toDegrees(c.latitude),
                    height: c.height,
                    pitchDeg: Cesium.Math.toDegrees(window.viewer.camera.pitch)
                };
            })()
            """
        )

        terrain_probe = page.evaluate(
            """
            async () => {
                if (!window.viewer || !window.Cesium) return { error: 'viewer_or_cesium_missing' };
                const Cesium = window.Cesium;
                const camera = window.viewer.camera;
                const canvas = window.viewer.scene.canvas;
                const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
                const ray = camera.getPickRay(center);
                if (!ray) return { error: 'pick_ray_missing' };
                const hit = window.viewer.scene.globe.pick(ray, window.viewer.scene);
                if (!hit) return { error: 'globe_pick_missing' };
                const c = Cesium.Cartographic.fromCartesian(hit);
                const lonStep = Cesium.Math.toRadians(0.1);
                const latStep = Cesium.Math.toRadians(0.1);
                const points = [];
                for (let y = -1; y <= 1; y += 1) {
                    for (let x = -1; x <= 1; x += 1) {
                        points.push(new Cesium.Cartographic(c.longitude + x * lonStep, c.latitude + y * latStep, 0));
                    }
                }
                let sampled;
                try {
                    sampled = await Cesium.sampleTerrainMostDetailed(window.viewer.terrainProvider, points);
                } catch (_err) {
                    sampled = await Cesium.sampleTerrain(window.viewer.terrainProvider, 9, points);
                }
                const heights = sampled
                    .map((p) => p.height)
                    .filter((h) => Number.isFinite(h));
                if (heights.length === 0) return { error: 'no_finite_heights' };
                const min = Math.min(...heights);
                const max = Math.max(...heights);
                return {
                    centerLonDeg: Cesium.Math.toDegrees(c.longitude),
                    centerLatDeg: Cesium.Math.toDegrees(c.latitude),
                    min,
                    max,
                    span: max - min,
                    sampleCount: heights.length
                };
            }
            """
        )

        page.screenshot(path=screenshot_path)

        print("=== CAPTURE REPORT ===")
        print(f"Mode: {mode}")
        print(f"LOD State: {state}")
        print(f"Camera: {camera}")
        print(f"TerrainProbe: {json.dumps(terrain_probe, ensure_ascii=False)}")
        print(f"Screenshot: {screenshot_path}")
        if logs:
            for line in logs:
                if (
                    "LOD profile switched" in line
                    or "Tactical material preset" in line
                    or "globe.material attached" in line
                    or "imagery layer count" in line
                    or "Fallback imagery" in line
                ):
                    print(f"log: {line}")

        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(run())
