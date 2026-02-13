import time
import sys
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
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

        print("Executing e3_diagnose()...")
        try:
            # We await the promise returned by e3_diagnose
            # Playwright evaluate automatically waits if a promise is returned
            page.evaluate("window.e3_diagnose()")
            print("Diagnostics execution finished.")
        except Exception as e:
            print(f"Error executing diagnostics: {e}")

        # Filter and print relevant logs
        print("\n=== DIAGNOSTIC REPORT ===")
        results = [l for l in logs if "VisualDiagnostics" in l or "[RESULT]" in l]
        for log in results:
            print(log)
            
        if not results:
            print("No diagnostic logs found! Dumping all logs:")
            for log in logs:
                print(log)

        # Screenshot
        page.screenshot(path="diagnostic_report.png")
        print("Screenshot saved to diagnostic_report.png")

        browser.close()

if __name__ == "__main__":
    run()
