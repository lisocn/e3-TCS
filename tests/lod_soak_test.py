import os
import sys
import time
from playwright.sync_api import sync_playwright


def ensure_screenshot_dir(path: str) -> str:
    resolved = path.strip() or os.path.join("tests", "artifacts")
    os.makedirs(resolved, exist_ok=True)
    return resolved


def run_once(
    app_url: str,
    screenshot_dir: str,
    round_idx: int,
    duration_seconds: int,
    max_unhandled_rejections: int,
) -> int:
    with sync_playwright() as p:
        print(f"[Round {round_idx}] Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        logs: list[str] = []
        page.on("console", lambda msg: logs.append(msg.text))
        page.on("pageerror", lambda err: logs.append(f"PAGEERROR: {err}"))

        try:
            page.goto(app_url, timeout=30000)
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

        screenshot_path = os.path.join(screenshot_dir, f"lod_soak_round{round_idx}.png")
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
        if unhandled_count > max_unhandled_rejections:
            return 4
        return 0


def run() -> int:
    app_url = os.getenv("E3_APP_URL", "http://localhost:5173").strip()
    screenshot_dir = ensure_screenshot_dir(os.getenv("SOAK_SCREENSHOT_DIR", "").strip())
    rounds = int(os.getenv("SOAK_ROUNDS", "3"))
    duration_seconds = int(os.getenv("SOAK_DURATION_SECONDS", "240"))
    max_unhandled_rejections = int(os.getenv("SOAK_MAX_UNHANDLED_REJECTIONS", "0"))
    fail_count = 0

    print(
        f"Starting soak test: rounds={rounds}, duration={duration_seconds}s, "
        f"max_unhandled_rejections={max_unhandled_rejections}, app_url={app_url}, "
        f"screenshot_dir={screenshot_dir}"
    )
    for idx in range(1, rounds + 1):
        rc = run_once(
            app_url,
            screenshot_dir,
            idx,
            duration_seconds,
            max_unhandled_rejections,
        )
        if rc != 0:
            fail_count += 1

    print(f"Soak summary: rounds={rounds}, failures={fail_count}")
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(run())
