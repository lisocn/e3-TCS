import json
import os
import sys
import time
from playwright.sync_api import sync_playwright


def parse_bool_env(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def ensure_screenshot_path(path: str, default_name: str) -> str:
    resolved = path.strip() or os.path.join("tests", "artifacts", default_name)
    screenshot_dir = os.path.dirname(resolved)
    if screenshot_dir:
        os.makedirs(screenshot_dir, exist_ok=True)
    return resolved


def run() -> int:
    app_url = os.getenv("E3_APP_URL", "http://localhost:5173").strip()
    terrain_layer_json_url = os.getenv(
        "E3_TERRAIN_LAYER_JSON_URL",
        "http://localhost:4444/terrain/layer.json",
    ).strip()
    wait_seconds = float(os.getenv("CAPTURE_WAIT_SECONDS", "6"))
    wait_tiles = parse_bool_env("CAPTURE_WAIT_TILES", "true")
    wait_tiles_timeout = float(os.getenv("CAPTURE_WAIT_TILES_TIMEOUT", "20"))
    screenshot_path = ensure_screenshot_path(
        os.getenv("CAPTURE_SCREENSHOT", "").strip(),
        "capture_tactical_view.png",
    )
    scan_nevada = parse_bool_env("CAPTURE_SCAN_NEVADA", "true")
    align_redflag = os.getenv("CAPTURE_ALIGN_REDFLAG", "").strip().lower()
    terrain_only = parse_bool_env("CAPTURE_TERRAIN_ONLY", "true")
    ensure_tactical_mpp = parse_bool_env("CAPTURE_ENSURE_TACTICAL_MPP", "false")
    tactical_mpp_min = float(os.getenv("CAPTURE_TACTICAL_MPP_MIN", "175"))
    tactical_mpp_max = float(os.getenv("CAPTURE_TACTICAL_MPP_MAX", "195"))
    ensure_tactical_timeout = float(os.getenv("CAPTURE_ENSURE_TACTICAL_TIMEOUT", "30"))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        logs: list[str] = []
        page.on("console", lambda msg: logs.append(msg.text))

        page.goto(app_url, timeout=30000)
        page.wait_for_selector(".cesium-viewer", timeout=30000)
        time.sleep(wait_seconds)

        if terrain_only:
            page.evaluate(
                """
                (() => {
                    if (window.clearRedFlagOverlay) {
                        window.clearRedFlagOverlay();
                    }
                })()
                """
            )

        if align_redflag in ("mudpit", "step3_plain"):
            aligned = page.evaluate(
                """
                () => {
                    if (!window.viewer || !window.Cesium) return false;
                    const Cesium = window.Cesium;
                    // Step3 专用：平原“泥坑”问题区机位（相对 wide 略偏移，覆盖大面积平坦区）。
                    window.viewer.camera.setView({
                        destination: Cesium.Cartesian3.fromDegrees(-120.053, 35.812, 221000.0),
                        orientation: {
                            heading: Cesium.Math.toRadians(14.0),
                            pitch: Cesium.Math.toRadians(-39.5),
                            roll: 0.0
                        }
                    });
                    window.__captureLockedView = {
                        lon: -120.053,
                        lat: 35.812,
                        headingDeg: 14.0,
                        pitchDeg: -39.5,
                        rollDeg: 0.0
                    };
                    return true;
                }
                """
            )
            print(f"RedFlagAlign: variant={align_redflag} applied={aligned}")
            time.sleep(2.2)
        elif align_redflag in ("wide", "focus"):
            aligned = page.evaluate(
                """
                (variant) => {
                    if (window.alignRedFlagReference) {
                        window.alignRedFlagReference(variant);
                        return true;
                    }
                    return false;
                }
                """,
                align_redflag,
            )
            print(f"RedFlagAlign: variant={align_redflag} applied={aligned}")
            time.sleep(2.2)
        elif scan_nevada:
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
            # LOD 切档是逐级推进，补一段轻量 zoomIn 触发，确保进入 tactical 近景档位。
            for _ in range(8):
                lod_state = page.evaluate("window.getLodState ? window.getLodState() : null")
                if lod_state and lod_state.get("profile") == "tactical":
                    break
                    page.evaluate(
                    """
                    (() => {
                        const h = window.viewer.camera.positionCartographic.height;
                        const amount = Math.max(120.0, h * 0.14);
                        window.viewer.camera.zoomIn(amount);
                    })()
                    """
                )
                time.sleep(0.45)

        ensure_report = {
            "enabled": ensure_tactical_mpp,
            "targetProfile": "tactical",
            "mppRange": [tactical_mpp_min, tactical_mpp_max],
            "elapsedSeconds": 0.0,
            "finalState": None,
            "satisfied": False,
        }
        if ensure_tactical_mpp:
            start_ensure = time.time()
            final_state = None
            entered_tactical = False
            while time.time() - start_ensure < ensure_tactical_timeout:
                final_state = page.evaluate(
                    "window.getLodState ? window.getLodState() : null"
                ) or {}
                profile = final_state.get("profile")
                mpp = float(final_state.get("metersPerPixel") or 0.0)
                in_range = tactical_mpp_min <= mpp <= tactical_mpp_max
                if profile == "tactical":
                    entered_tactical = True
                if profile == "tactical" and in_range:
                    ensure_report["satisfied"] = True
                    break

                if mpp <= 0.0:
                    page.evaluate("window.viewer.scene.requestRender()")
                    time.sleep(0.25)
                    continue

                has_locked_view = page.evaluate(
                    "(() => !!(window.__captureLockedView && window.viewer && window.Cesium))()"
                )
                if has_locked_view:
                    page.evaluate(
                        """
                        ({ profile, mpp, mppMin, mppMax }) => {
                            const lock = window.__captureLockedView;
                            if (!lock || !window.viewer || !window.Cesium) return;
                            const Cesium = window.Cesium;
                            const h = window.viewer.camera.positionCartographic.height;
                            const target = 0.5 * (mppMin + mppMax);
                            let desiredHeight;
                            if (profile !== 'tactical') {
                                // 先确保进入 tactical，再做 mpp 精调。
                                desiredHeight = Math.max(35000.0, h * 0.84);
                            } else {
                                desiredHeight = Math.min(260000.0, Math.max(35000.0, h * (target / Math.max(1.0, mpp))));
                            }
                            window.viewer.camera.setView({
                                destination: Cesium.Cartesian3.fromDegrees(lock.lon, lock.lat, desiredHeight),
                                orientation: {
                                    heading: Cesium.Math.toRadians(lock.headingDeg),
                                    pitch: Cesium.Math.toRadians(lock.pitchDeg),
                                    roll: Cesium.Math.toRadians(lock.rollDeg)
                                }
                            });
                        }
                        """,
                        {"profile": profile, "mpp": mpp, "mppMin": tactical_mpp_min, "mppMax": tactical_mpp_max},
                    )
                    time.sleep(0.42)
                    continue

                # 双阶段收敛：
                # 1) 若尚未进入 tactical，则先强推到更近景，确保触发档位切换；
                # 2) 进入 tactical 后，再回调到目标 mpp 区间。
                if not entered_tactical:
                    page.evaluate(
                        """
                        (() => {
                            const h = window.viewer.camera.positionCartographic.height;
                            window.viewer.camera.zoomIn(Math.max(260.0, h * 0.17));
                        })()
                        """
                    )
                else:
                    if mpp > tactical_mpp_max:
                        page.evaluate(
                            """
                            ({ mpp, mppMin, mppMax }) => {
                                const h = window.viewer.camera.positionCartographic.height;
                                const target = 0.5 * (mppMin + mppMax);
                                const err = Math.abs(mpp - target) / Math.max(1.0, target);
                                const ratio = Math.min(0.08, Math.max(0.015, err * 0.55));
                                window.viewer.camera.zoomIn(Math.max(120.0, h * ratio));
                            }
                            """,
                            {"mpp": mpp, "mppMin": tactical_mpp_min, "mppMax": tactical_mpp_max},
                        )
                    elif mpp < tactical_mpp_min:
                        page.evaluate(
                            """
                            ({ mpp, mppMin, mppMax }) => {
                                const h = window.viewer.camera.positionCartographic.height;
                                const target = 0.5 * (mppMin + mppMax);
                                const err = Math.abs(mpp - target) / Math.max(1.0, target);
                                const ratio = Math.min(0.08, Math.max(0.015, err * 0.55));
                                window.viewer.camera.zoomOut(Math.max(140.0, h * ratio));
                            }
                            """,
                            {"mpp": mpp, "mppMin": tactical_mpp_min, "mppMax": tactical_mpp_max},
                        )
                    else:
                        page.evaluate("window.viewer.scene.requestRender()")
                time.sleep(0.42)

            ensure_report["elapsedSeconds"] = round(time.time() - start_ensure, 2)
            ensure_report["finalState"] = final_state

        tile_wait_report = {"enabled": wait_tiles, "tilesLoaded": None, "elapsedSeconds": 0.0}
        if wait_tiles:
            start_wait = time.time()
            last_state = {}
            while time.time() - start_wait < wait_tiles_timeout:
                last_state = page.evaluate(
                    """
                    (() => {
                        if (!window.viewer) return { viewerReady: false };
                        const provider = window.viewer.terrainProvider;
                        const globe = window.viewer.scene.globe;
                        return {
                            viewerReady: true,
                            providerType: provider && provider.constructor ? provider.constructor.name : 'unknown',
                            providerReady: !!provider,
                            tilesLoaded: !!globe.tilesLoaded
                        };
                    })()
                    """
                )
                if last_state.get("tilesLoaded"):
                    break
                time.sleep(0.35)
            tile_wait_report = {
                "enabled": wait_tiles,
                "tilesLoaded": bool(last_state.get("tilesLoaded")),
                "elapsedSeconds": round(time.time() - start_wait, 2),
                "lastState": last_state
            }

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

        provider_probe = page.evaluate(
            """
            (() => {
                if (!window.viewer) return { error: 'viewer_missing' };
                const provider = window.viewer.terrainProvider;
                if (!provider) return { error: 'terrain_provider_missing' };
                return {
                    providerType: provider.constructor ? provider.constructor.name : 'unknown',
                    requestVertexNormals: provider.requestVertexNormals ?? provider._requestVertexNormals ?? null,
                    hasVertexNormals: provider.hasVertexNormals ?? provider._hasVertexNormals ?? null,
                    hasWaterMask: provider.hasWaterMask ?? provider._hasWaterMask ?? null,
                    ready: provider.ready ?? null
                };
            })()
            """
        )

        layer_meta = page.evaluate(
            """
            async (layerUrl) => {
                try {
                    const resp = await fetch(layerUrl);
                    const json = await resp.json();
                    return {
                        status: resp.status,
                        ok: resp.ok,
                        format: json.format ?? null,
                        minzoom: json.minzoom ?? null,
                        maxzoom: json.maxzoom ?? null,
                        extensions: json.extensions ?? null
                    };
                } catch (error) {
                    return { error: String(error) };
                }
            }
            """,
            terrain_layer_json_url
        )

        page.screenshot(path=screenshot_path)

        print("=== CAPTURE REPORT ===")
        print(f"AppUrl: {app_url}")
        print(f"TerrainLayerJsonUrl: {terrain_layer_json_url}")
        print(f"EnsureTacticalMpp: {json.dumps(ensure_report, ensure_ascii=False)}")
        print(f"TileWait: {json.dumps(tile_wait_report, ensure_ascii=False)}")
        print(f"Mode: {mode}")
        print(f"LOD State: {state}")
        print(f"Camera: {camera}")
        print(f"ProviderProbe: {json.dumps(provider_probe, ensure_ascii=False)}")
        print(f"LayerMeta: {json.dumps(layer_meta, ensure_ascii=False)}")
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
