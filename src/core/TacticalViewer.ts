import {
    Viewer,
    CesiumTerrainProvider,
    EllipsoidTerrainProvider,
    Ellipsoid,
    Color,
    Math as CesiumMath,
    Cartesian3,
    Cartographic,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Cartesian2
} from 'cesium';
import { AppConfig, type ThemePackName } from '../config';
import { ThemeManager } from '../themes/ThemeManager';
import type { TacticalMaterialOptions } from '../themes/tacticalMaterial';
import { DataManager } from '../data';
import { HudManager, type HudMode, type HudMetrics } from '../ui/HudManager';

/**
 * 战术视图配置接口
 */
import { VisualDiagnostics } from './VisualDiagnostics';

// 扩展 Window 接口以包含 e3_diagnose
declare global {
    interface Window {
        e3_diagnose?: () => Promise<void>;
    }
}

export interface TacticalConfig {
    terrainUrl?: string;
    useDynamicTerrain?: boolean; // 是否请求顶点法线
    baseLayer?: boolean;        // 是否启用基础底图
    baseMapUrl?: string;
    theme?: 'tactical' | 'satellite';
    themePack?: ThemePackName;
    onTerrainStatusChange?: (status: 'connected' | 'failed' | 'disabled', detail?: string) => void;
}

/**
 * 核心战术视图类
 * 负责初始化 Cesium Viewer 并集成战术特征
 */
export class TacticalViewer {
    public viewer: Viewer;
    private themeManager: ThemeManager;
    private initPromise: Promise<void>;
    private baseLayerEnabled: boolean;
    private baseMapUrl: string;
    private tacticalStyle: TacticalMaterialOptions;
    private currentTheme: 'tactical' | 'satellite';
    private localTerrainProvider?: CesiumTerrainProvider;
    private ellipsoidTerrainProvider: EllipsoidTerrainProvider;
    private usingFallbackTerrain: boolean;
    private removeCameraChangedListener?: () => void;
    private onTerrainStatusChange?: (status: 'connected' | 'failed' | 'disabled', detail?: string) => void;
    private dataManager: DataManager;
    private hudManager: HudManager;
    private mouseMoveHandler?: ScreenSpaceEventHandler;
    private hudDebounceTimer?: ReturnType<typeof setTimeout>;
    private hudQueryToken: number;
    private maxZoomOutHeight: number;
    private onWindowResize?: () => void;

    constructor(containerId: string, config: TacticalConfig = {}) {
        // 合并配置与默认值
        const terrainUrl = config.terrainUrl ?? AppConfig.terrain.url;
        const useDynamicTerrain = config.useDynamicTerrain ?? AppConfig.terrain.requestVertexNormals;
        const baseLayer = config.baseLayer ?? AppConfig.basemap.enabled;
        const baseMapUrl = config.baseMapUrl ?? AppConfig.basemap.url;
        const theme = config.theme ?? AppConfig.ui.theme;
        const themePack = config.themePack ?? AppConfig.ui.themePack;
        this.baseLayerEnabled = baseLayer;
        this.baseMapUrl = baseMapUrl;
        this.currentTheme = theme;
        this.tacticalStyle = AppConfig.ui.themePacks[themePack].tacticalStyle;
        this.ellipsoidTerrainProvider = new EllipsoidTerrainProvider();
        this.usingFallbackTerrain = false;
        this.onTerrainStatusChange = config.onTerrainStatusChange;
        this.hudQueryToken = 0;
        this.maxZoomOutHeight = Number.POSITIVE_INFINITY;

        // 1. 初始化 Viewer (离线优先)
        console.log(`TacticalViewer: Initializing Viewer on container: ${containerId}`);
        this.viewer = new Viewer(containerId, {
            animation: false,
            baseLayerPicker: false,
            fullscreenButton: false,
            vrButton: false,
            geocoder: false,
            homeButton: false,
            infoBox: false,
            sceneModePicker: false,
            selectionIndicator: false,
            timeline: false,
            navigationHelpButton: false,
            navigationInstructionsInitiallyVisible: false,
            // Enable Log Depth to prevent DepthPlane crashes at large distances/zero vectors
            // and to improve rendering precision.
            scene3DOnly: true,
            orderIndependentTranslucency: true, // Default
            contextOptions: {
                webgl: {
                    alpha: true, // Allow background to show through if nothing is rendered
                    antialias: true,
                    preserveDrawingBuffer: true // Required for pixel reading in some drivers
                }
            }
        });

        console.log("TacticalViewer: Viewer instance created.");

        // Set clear color to something obvious to distinguish from black globe
        this.viewer.scene.backgroundColor = Color.DARKBLUE;
        this.viewer.scene.globe.baseColor = Color.DARKGRAY;
        this.viewer.scene.globe.show = true;

        // Force initial view: full globe with geocenter near screen center
        this.viewer.camera.setView({
            destination: Cartesian3.fromDegrees(0.0, 0.0, 26000000.0),
            orientation: {
                heading: CesiumMath.toRadians(0.0),
                pitch: CesiumMath.toRadians(-90.0),
                roll: 0.0
            }
        });

        this.themeManager = new ThemeManager(this.viewer);
        this.dataManager = new DataManager(this.viewer);
        this.dataManager.setQueryLevel(9);
        const hudContainer = this.viewer.container as HTMLElement;
        this.hudManager = new HudManager(hudContainer, 'docked');
        this.initPromise = this.initialize(terrainUrl, useDynamicTerrain, theme);
    }

    /**
     * 切换渲染主题
     */
    public applyTheme(name: 'tactical' | 'satellite'): void {
        this.currentTheme = name;
        this.themeManager.applyTheme(name, {
            baseLayerEnabled: this.baseLayerEnabled,
            baseMapUrl: this.baseMapUrl,
            tacticalStyle: this.tacticalStyle
        });
    }

    /**
     * 切换战术风格预设
     */
    public applyThemePack(name: ThemePackName): void {
        this.tacticalStyle = AppConfig.ui.themePacks[name].tacticalStyle;
        if (this.currentTheme === 'tactical') {
            this.applyTheme('tactical');
        }
    }

    /**
     * 设置 HUD 模式
     */
    public setHudMode(mode: HudMode): void {
        this.hudManager.setMode(mode);
    }

    /**
     * 等待 Viewer 完成初始化（包括地形服务）
     */
    public ready(): Promise<void> {
        return this.initPromise;
    }

    /**
     * 释放资源，避免重复创建 Viewer 导致显存泄漏
     */
    public destroy(): void {
        if (this.removeCameraChangedListener) {
            this.removeCameraChangedListener();
            this.removeCameraChangedListener = undefined;
        }
        if (this.hudDebounceTimer) {
            clearTimeout(this.hudDebounceTimer);
            this.hudDebounceTimer = undefined;
        }
        if (this.mouseMoveHandler) {
            this.mouseMoveHandler.destroy();
            this.mouseMoveHandler = undefined;
        }
        if (this.onWindowResize) {
            window.removeEventListener('resize', this.onWindowResize);
            this.onWindowResize = undefined;
        }
        this.hudManager.destroy();
        if (!this.viewer.isDestroyed()) {
            this.viewer.destroy();
        }
        delete window.e3_diagnose;
    }

    private async initialize(
        terrainUrl: string | undefined,
        useDynamicTerrain: boolean,
        theme: 'tactical' | 'satellite'
    ): Promise<void> {
        // 2. 配置地形（等待完成，避免初始化竞态）
        if (terrainUrl) {
            await this.configureTerrain(terrainUrl, useDynamicTerrain);
        } else {
            this.onTerrainStatusChange?.('disabled', 'Terrain URL is empty.');
        }

        // 3. 配置底图
        this.configureBaseLayer(this.baseLayerEnabled);

        // 4. 应用初始主题
        this.applyTheme(theme);
        this.setupZoomOutLimit();
        this.setupGlobalTerrainFallback();
        this.setupHudTracking();

        // 初始化视觉诊断模块
        const diagnostics = new VisualDiagnostics(this.viewer);
        window.e3_diagnose = () => diagnostics.runAutoPilot();
        console.log("TacticalViewer: VisualDiagnostics initialized. Run 'window.e3_diagnose()' to test.");

        // 5. 设置视角：默认全球全貌，地心位于屏幕中心
        this.viewer.camera.setView({
            destination: Cartesian3.fromDegrees(0.0, 0.0, 26000000.0),
            orientation: {
                heading: CesiumMath.toRadians(0.0),
                pitch: CesiumMath.toRadians(-90.0),
                roll: 0.0
            }
        });
    }

    private setupHudTracking(): void {
        this.mouseMoveHandler = new ScreenSpaceEventHandler(this.viewer.scene.canvas);
        this.mouseMoveHandler.setInputAction((movement: { endPosition: Cartesian2 }) => {
            const pos = movement.endPosition;
            this.hudManager.setFollowPosition(pos.x, pos.y);
            const cartographic = this.pickCartographic(pos);
            if (!cartographic) return;
            const metrics = this.computeHudMetrics(pos, cartographic);

            // 鼠标移动时先同步刷新（经纬度/快速高程），保证 HUD 连续变化。
            const fastInfo = this.dataManager.queryPositionInfoFast(cartographic);
            this.hudManager.update(fastInfo, metrics);

            if (this.hudDebounceTimer) {
                clearTimeout(this.hudDebounceTimer);
            }
            // 精确查询异步回填，避免高频 sampleTerrain 造成卡顿。
            this.hudDebounceTimer = setTimeout(() => {
                void this.queryAndUpdateHudDetailed(cartographic, metrics);
            }, 60);
        }, ScreenSpaceEventType.MOUSE_MOVE);
    }

    private async queryAndUpdateHudDetailed(cartographic: Cartographic, metrics: HudMetrics): Promise<void> {
        const token = ++this.hudQueryToken;
        const info = await this.dataManager.queryPositionInfo(cartographic);
        if (token !== this.hudQueryToken) return;
        this.hudManager.update(info, metrics);
    }

    private computeHudMetrics(screenPosition: Cartesian2, cartographic: Cartographic): HudMetrics {
        const metersPerPixel = this.estimateMetersPerPixel(screenPosition);
        const earthRadius = 6378137.0;
        const earthCircumference = 2 * Math.PI * earthRadius;
        const latCos = Math.max(0.01, Math.cos(cartographic.latitude));
        const zoomLevel = Math.max(0, Math.log2((latCos * earthCircumference) / (256 * metersPerPixel)));
        const metersPerCssPixel = 0.0254 / 96.0;
        const scaleDenominator = metersPerPixel / metersPerCssPixel;
        return {
            zoomLevel,
            metersPerPixel,
            scaleDenominator
        };
    }

    private estimateMetersPerPixel(screenPosition: Cartesian2): number {
        const left = new Cartesian2(Math.max(0, screenPosition.x - 1), screenPosition.y);
        const right = new Cartesian2(Math.min(this.viewer.scene.canvas.clientWidth - 1, screenPosition.x + 1), screenPosition.y);
        const c1 = this.pickCartesianOnGlobe(left);
        const c2 = this.pickCartesianOnGlobe(right);
        if (c1 && c2) {
            const span = Cartesian3.distance(c1, c2);
            if (Number.isFinite(span) && span > 0) {
                return span / 2;
            }
        }
        // 回退：基于相机高度和垂直视场角估算 m/px
        const height = Math.max(1, this.viewer.camera.positionCartographic.height);
        const frustum = this.viewer.camera.frustum as { fovy?: number };
        const fovy = frustum.fovy ?? CesiumMath.toRadians(60.0);
        const viewportHeight = Math.max(1, this.viewer.scene.canvas.clientHeight);
        return (2 * height * Math.tan(fovy / 2)) / viewportHeight;
    }

    private pickCartesianOnGlobe(screenPosition: Cartesian2): Cartesian3 | undefined {
        const ellipsoid = Ellipsoid.WGS84;
        const ellipsoidHit = this.viewer.camera.pickEllipsoid(screenPosition, ellipsoid);
        if (ellipsoidHit) return ellipsoidHit;
        const ray = this.viewer.camera.getPickRay(screenPosition);
        if (!ray) return undefined;
        return this.viewer.scene.globe.pick(ray, this.viewer.scene) ?? undefined;
    }

    private pickCartographic(screenPosition: Cartesian2): Cartographic | undefined {
        // 按鼠标经纬度查询：优先使用椭球拾取，避免地形网格洞/回退地形干扰。
        const ellipsoid = Ellipsoid.WGS84;
        const ellipsoidCartesian = this.viewer.camera.pickEllipsoid(screenPosition, ellipsoid);
        if (ellipsoidCartesian) {
            const cartographic = Cartographic.fromCartesian(ellipsoidCartesian, ellipsoid);
            if (cartographic) return cartographic;
        }

        const ray = this.viewer.camera.getPickRay(screenPosition);
        if (!ray) return undefined;
        const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
        if (!cartesian) return undefined;

        const cartographic = Cartographic.fromCartesian(cartesian);
        if (!cartographic) return undefined;
        return cartographic;
    }

    /**
     * 配置地形服务
     */
    private async configureTerrain(url: string, requestVertexNormals: boolean): Promise<void> {
        console.log(`TacticalViewer: Configuring terrain from URL: ${url}`);
        try {
            const provider = await CesiumTerrainProvider.fromUrl(url, {
                requestVertexNormals: requestVertexNormals
            });
            console.log("TacticalViewer: CesiumTerrainProvider.fromUrl returned successfully.");
            this.localTerrainProvider = provider;
            this.viewer.terrainProvider = provider;
            this.dataManager.setPreferredTerrainProvider(provider);
            console.log("TacticalViewer: Terrain provider set on viewer.");
            this.onTerrainStatusChange?.('connected', url);
        } catch (error) {
            console.error("TacticalViewer: FAILED to load terrain service:", error);
            const detail = error instanceof Error ? error.message : String(error);
            this.onTerrainStatusChange?.('failed', detail);
        }
    }

    private setupGlobalTerrainFallback(): void {
        if (!AppConfig.terrain.enableGlobalFallback) {
            return;
        }
        const threshold = AppConfig.terrain.fallbackSwitchHeight;
        const onCameraChanged = () => {
            if (!this.localTerrainProvider) return;
            const h = this.viewer.camera.positionCartographic.height;
            const shouldFallback = h >= threshold;
            if (shouldFallback && !this.usingFallbackTerrain) {
                this.viewer.terrainProvider = this.ellipsoidTerrainProvider;
                this.usingFallbackTerrain = true;
                console.log(`TacticalViewer: Global terrain fallback enabled at height ${h.toFixed(0)}m.`);
            } else if (!shouldFallback && this.usingFallbackTerrain) {
                this.viewer.terrainProvider = this.localTerrainProvider;
                this.usingFallbackTerrain = false;
                console.log(`TacticalViewer: Restored local terrain at height ${h.toFixed(0)}m.`);
            }
        };
        this.viewer.camera.changed.addEventListener(onCameraChanged);
        this.removeCameraChangedListener = () => {
            this.viewer.camera.changed.removeEventListener(onCameraChanged);
        };
        onCameraChanged();
    }

    private setupZoomOutLimit(): void {
        this.recomputeMaxZoomOutHeight();
        this.viewer.scene.screenSpaceCameraController.maximumZoomDistance = this.maxZoomOutHeight;
        this.onWindowResize = () => {
            this.recomputeMaxZoomOutHeight();
            this.viewer.scene.screenSpaceCameraController.maximumZoomDistance = this.maxZoomOutHeight;
        };
        window.addEventListener('resize', this.onWindowResize);
    }

    private recomputeMaxZoomOutHeight(): void {
        const earthRadius = Ellipsoid.WGS84.maximumRadius;
        const canvas = this.viewer.scene.canvas;
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        const aspect = width / height;
        const frustum = this.viewer.camera.frustum as { fovy?: number };
        const halfVerticalFov = (frustum.fovy ?? CesiumMath.toRadians(60.0)) * 0.5;
        const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * aspect);
        const limitingHalfFov = Math.max(0.05, Math.min(halfVerticalFov, halfHorizontalFov));
        const centerDistance = earthRadius / Math.sin(limitingHalfFov);
        // 1.5% 裕量避免边缘裁切：地球充满屏幕但不越界。
        this.maxZoomOutHeight = Math.max(1.0, centerDistance - earthRadius) * 1.015;
    }

    /**
     * 配置基础底图层
     */
    private configureBaseLayer(enableBaseLayer: boolean): void {
        const { scene } = this.viewer;

        // 清除可能存在的自动添加的图层
        this.viewer.imageryLayers.removeAll();

        if (!enableBaseLayer) {
            // 纯黑背景模式
            if (scene.skyBox) {
                scene.skyBox.show = false;
            }
            scene.backgroundColor = Color.BLACK;
            scene.globe.baseColor = Color.BLACK; // BLACK base
            scene.globe.enableLighting = false;

            // 重要：为了显示自定义 Globe Material，我们需要移除所有 Imagery Layer
            // 或者使用一个完全透明的 Placeholder (如果 Cesium 强制要求)
            // 但通常只要有 TerrainProvider，Globe Material 就会显示

            // 移除 TileCoordinatesImageryProvider，它是调试用的
            // this.viewer.imageryLayers.addImageryProvider(new TileCoordinatesImageryProvider());
        } else {
            // 如果启用了底图，加载一个真实的底图 (这里暂时留空或由 ThemeManager 处理)
            // 暂时也移除调试网格
            // this.viewer.imageryLayers.addImageryProvider(new TileCoordinatesImageryProvider());
        }
    }
}
