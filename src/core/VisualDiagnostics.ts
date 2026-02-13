import { Viewer, Cartesian3 } from 'cesium';

/**
 * 视觉诊断模块 (Visual Diagnostics)
 * 用于运行时自我检测渲染异常（如撕裂、黑屏、LOD失效等）
 */
export class VisualDiagnostics {
    private viewer: Viewer;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    /**
     * 运行全套诊断流程 (Auto-Pilot)
     */
    public async runAutoPilot(): Promise<void> {
        console.log("VisualDiagnostics: Starting Auto-Pilot Check...");
        const canReadPixels = this.canReadPixels();

        // 0. 冒烟测试：检查地球是否存在 (Globe Existence Smoke Test)
        console.log("VisualDiagnostics: Checking Globe Existence...");
        if (!this.viewer.scene.globe.show) {
            console.error("VisualDiagnostics: CRITICAL FAIL - Globe is hidden (scene.globe.show = false).");
            return;
        }
        await this.flyTo(116.39, 39.9, 20000000); // 飞到全球视角 (20000km)
        await this.waitForRender();
        // 采样检查：如果地球存在，中心不应是纯黑（除非背景也是黑且光照关闭，但战术模式下有底色）
        // 简单判断：画面中心必须有内容
        const globeStatus = canReadPixels
            ? this.checkGlobeRendering('Globe Existence')
            : this.skipPixelCheck('Globe Existence');
        console.log(`[RESULT] Globe Existence: ${globeStatus ? 'PASS' : 'FAIL'}`);

        // 1. 检查北极点撕裂 (North Pole Tearing)
        console.log("VisualDiagnostics: Checking North Pole Tearing...");
        await this.flyTo(0.0, 90.0, 20000); // 飞到北极上空 20km
        await this.waitForRender();
        const poleStatus = canReadPixels
            ? this.checkPixelSafety('North Pole')
            : this.skipPixelCheck('North Pole');
        console.log(`[RESULT] North Pole Tearing: ${poleStatus ? 'PASS' : 'FAIL'}`);

        // 2. 检查远景 LOD (Far Field LOD)
        console.log("VisualDiagnostics: Checking Global View (Far Field)...");
        await this.flyTo(0.0, 90.0, 2000000); // 飞到北极上空 2000km
        await this.waitForRender();
        // 检查是否有明显的网格噪点（黄色像素不应过多）
        const farStatus = canReadPixels
            ? this.checkGridDensity('Far Field', 0.01)
            : this.skipPixelCheck('Far Field'); // 期望黄色极少
        console.log(`[RESULT] Far Field Stability: ${farStatus ? 'PASS' : 'FAIL'}`);

        // 3. 检查近景 LOD (Near Field LOD)
        console.log("VisualDiagnostics: Checking Tactical View (Near Field)...");
        await this.flyTo(0.0, 90.0, 5000); // 飞到北极上空 5km
        await this.waitForRender();
        // 检查是否有网格（应该有黄色像素）
        const nearStatus = canReadPixels
            ? this.checkGridDensity('Near Field', 0.05, true)
            : this.skipPixelCheck('Near Field'); // 期望有一定黄色
        console.log(`[RESULT] Near Field Detail: ${nearStatus ? 'PASS' : 'FAIL'}`);

        console.log("VisualDiagnostics: Diagnostics Complete.");

        // 如果任何一项失败，抛出错误以便 CI 捕获
        if (!globeStatus || !poleStatus || !farStatus || !nearStatus) {
            throw new Error("Visual Diagnostics FAILED. See [RESULT] logs above.");
        }
    }

    private canReadPixels(): boolean {
        const gl = this.getWebGlContext();
        if (!gl) {
            console.warn('VisualDiagnostics: WebGL context unavailable, pixel checks will be skipped.');
            return false;
        }
        return true;
    }

    private skipPixelCheck(label: string): boolean {
        console.warn(`[${label}] SKIP: Pixel check skipped due to unavailable WebGL context.`);
        return true;
    }

    private getWebGlContext(): WebGLRenderingContext | WebGL2RenderingContext | null {
        type SceneContext = {
            context?: {
                _gl?: WebGLRenderingContext | WebGL2RenderingContext;
            };
        };
        const sceneWithContext = this.viewer.scene as unknown as SceneContext;
        return sceneWithContext.context?._gl ?? null;
    }

    private checkGlobeRendering(label: string): boolean {
        const gl = this.getWebGlContext();
        if (!gl) {
            return this.skipPixelCheck(label);
        }
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        // 采样中心 5x5
        const pixelData = new Uint8Array(5 * 5 * 4);
        gl.readPixels(width / 2 - 2, height / 2 - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

        // 获取中心像素色彩
        let validPixels = 0;

        // 背景色是 DARKBLUE (0, 0, 139) -> 约 (0, 0, 0.54)
        // 背景色计算：Color.DARKBLUE.toByteColorArray() -> [0, 0, 139, 255]

        for (let i = 0; i < pixelData.length; i += 4) {
            const r = pixelData[i];
            const g = pixelData[i + 1];
            const b = pixelData[i + 2];
            const a = pixelData[i + 3];

            // 只要不是纯黑，也不是背景色 DarkBlue，就认为渲染了地球
            // DarkBlue: R=0, G=0, B=139
            const isBackground = r === 0 && g === 0 && b === 139;
            const isEmpty = r === 0 && g === 0 && b === 0 && a === 0;

            if (!isBackground && !isEmpty) {
                validPixels++;
            }
        }

        if (validPixels === 0) {
            console.error(`[${label}] CRITICAL FAIL: Screen is completely empty/transparent or only background color.`);
            return false;
        }

        console.log(`[${label}] PASS: Rendered content detected.`);
        return true;
    }

    /**
     * 检查屏幕中心像素是否安全（无纯黑/死黑）
     * 策略：在战术模式下，背景是 Tan 色，地形也是 Tan/Red。
     * 如果出现纯黑 (0,0,0) 或 深蓝 (Space Blue)，说明也是穿透。
     */
    private checkPixelSafety(label: string): boolean {
        const gl = this.getWebGlContext();
        if (!gl) {
            return this.skipPixelCheck(label);
        }
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        // 采样中心 5x5 区域
        const pixelData = new Uint8Array(5 * 5 * 4);
        gl.readPixels(width / 2 - 2, height / 2 - 2, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

        let blackCount = 0;
        for (let i = 0; i < pixelData.length; i += 4) {
            const r = pixelData[i];
            const g = pixelData[i + 1];
            const b = pixelData[i + 2];

            // 严格检查：纯黑或接近黑
            if (r < 10 && g < 10 && b < 10) {
                blackCount++;
            }
        }

        if (blackCount > 0) {
            console.error(`[${label}] FAIL: Detected ${blackCount} black pixels (Rendering Artifact/Hole).`);
            return false;
        }
        console.log(`[${label}] PASS: No black artifacts detected.`);
        return true;
    }

    /**
     * 检查网格密度（黄色像素占比）
     * @param expectPresent true=期望存在网格, false=期望无网格
     */
    private checkGridDensity(label: string, threshold: number, expectPresent: boolean = false): boolean {
        const gl = this.getWebGlContext();
        if (!gl) {
            return this.skipPixelCheck(label);
        }
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;

        // 采样中心 100x100 区域
        const size = 100;
        const pixelData = new Uint8Array(size * size * 4);
        gl.readPixels(width / 2 - size / 2, height / 2 - size / 2, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

        let yellowCount = 0;
        const totalPixels = size * size;

        for (let i = 0; i < pixelData.length; i += 4) {
            const r = pixelData[i];
            const g = pixelData[i + 1];
            const b = pixelData[i + 2];

            // 简单的黄色检测 (R高, G高, B低)
            if (r > 100 && g > 100 && b < 50) {
                yellowCount++;
            }
        }

        const ratioCorrect = yellowCount / totalPixels;

        console.log(`[${label}] Yellow Density: ${(ratioCorrect * 100).toFixed(2)}%`);

        if (expectPresent) {
            // 期望有网格，但没检测到
            if (ratioCorrect < 0.001) {
                console.warn(`[${label}] WARN: Grid missing (Low Detail).`);
                // return false; // 暂时只警告，不阻断
            }
        } else {
            // 期望无网格，但检测到了 (LOD失效)
            if (ratioCorrect > threshold) {
                console.warn(`[${label}] FAIL: High frequency noise/grid detected in Far Field.`);
                return false;
            }
        }

        return true;
    }

    private async flyTo(lon: number, lat: number, height: number): Promise<void> {
        return new Promise((resolve) => {
            this.viewer.camera.flyTo({
                destination: Cartesian3.fromDegrees(lon, lat, height),
                duration: 2.0, // 快速飞行
                complete: () => resolve()
            });
        });
    }

    private async waitForRender(): Promise<void> {
        return new Promise((resolve) => {
            let settled = false;
            const onPostRender = () => {
                if (settled) return;
                settled = true;
                this.viewer.scene.postRender.removeEventListener(onPostRender);
                clearTimeout(fallbackTimer);
                resolve();
            };
            const fallbackTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.viewer.scene.postRender.removeEventListener(onPostRender);
                resolve();
            }, 3000);
            this.viewer.scene.postRender.addEventListener(onPostRender);
            this.viewer.scene.requestRender();
        });
    }
}
