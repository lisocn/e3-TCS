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
import {
    AppConfig,
    type SceneThemeDefinition,
    type ThemePackName,
    type TerrainLodProfile,
    type TerrainLodProfileName
} from '../config';
import { ThemeManager } from '../themes/ThemeManager';
import type { TacticalMaterialOptions } from '../themes/tacticalMaterial';
import { DataManager } from '../data';
import { HudManager, type HudMode, type HudMetrics } from '../ui/HudManager';
import { TacticalOverlayManager } from './TacticalOverlayManager';

/**
 * 战术视图配置接口
 */
import { VisualDiagnostics } from './VisualDiagnostics';

export interface TacticalConfig {
    terrainUrl?: string;
    useDynamicTerrain?: boolean; // 是否请求顶点法线
    baseLayer?: boolean;        // 是否启用基础底图
    baseMapUrl?: string;
    theme?: string;
    themePack?: ThemePackName;
    onTerrainStatusChange?: (status: 'connected' | 'failed' | 'disabled', detail?: string) => void;
    onLodProfileChange?: (profile: TerrainLodProfileName, metersPerPixel: number) => void;
}

export interface LodSwitchStats {
    switchCount: number;
    lastSwitchDurationMs: number;
    averageSwitchDurationMs: number;
    lastSwitchAtEpochMs?: number;
}

export interface RenderPerfStats {
    averageFps: number;
    recentFps: number;
    sampleSeconds: number;
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
    private currentTheme: string;
    private localTerrainProvider?: CesiumTerrainProvider;
    private localTerrainLoading: boolean;
    private localTerrainBlockedByOom: boolean;
    private terrainUrl?: string;
    private terrainRequestVertexNormals: boolean;
    private ellipsoidTerrainProvider: EllipsoidTerrainProvider;
    private removeCameraChangedListener?: () => void;
    private onTerrainStatusChange?: (status: 'connected' | 'failed' | 'disabled', detail?: string) => void;
    private onLodProfileChange?: (profile: TerrainLodProfileName, metersPerPixel: number) => void;
    private dataManager: DataManager;
    private hudManager: HudManager;
    private mouseMoveHandler?: ScreenSpaceEventHandler;
    private hudDebounceTimer?: ReturnType<typeof setTimeout>;
    private hudQueryToken: number;
    private maxZoomOutHeight: number;
    private onWindowResize?: () => void;
    private diagnostics: VisualDiagnostics;
    private overlayManager: TacticalOverlayManager;
    private currentLodProfile: TerrainLodProfileName;
    private currentLodConfig: TerrainLodProfile;
    private currentMetersPerPixel: number;
    private lodSwitchTimer?: ReturnType<typeof setTimeout>;
    private lodSwitchCount: number;
    private totalLodSwitchDurationMs: number;
    private lastLodSwitchDurationMs: number;
    private lastLodSwitchAtEpochMs?: number;
    private perfStartTimeMs: number;
    private perfFrameCount: number;
    private perfRecentWindowStartMs: number;
    private perfRecentFrameCount: number;
    private perfRecentFps: number;
    private readonly onPostRender: () => void;
    private tacticalReliefFocusApplied: boolean;
    private readonly stableGlobalBaselineMode: boolean;
    private readonly globalMaterialExperimentEnabled: boolean;
    private readonly adaptiveLodMaxProfile: TerrainLodProfileName;

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
        this.onTerrainStatusChange = config.onTerrainStatusChange;
        this.onLodProfileChange = config.onLodProfileChange;
        this.localTerrainLoading = false;
        this.localTerrainBlockedByOom = false;
        this.terrainUrl = terrainUrl;
        this.terrainRequestVertexNormals = useDynamicTerrain;
        this.hudQueryToken = 0;
        this.maxZoomOutHeight = Number.POSITIVE_INFINITY;
        // 初始化先用 global，避免在高空短暂误用本地 terrain 导致内存峰值。
        this.currentLodProfile = 'global';
        this.currentLodConfig = AppConfig.terrain.lodProfiles[this.currentLodProfile];
        this.currentMetersPerPixel = Number.NaN;
        this.lodSwitchCount = 0;
        this.totalLodSwitchDurationMs = 0;
        this.lastLodSwitchDurationMs = 0;
        this.perfStartTimeMs = performance.now();
        this.perfFrameCount = 0;
        this.perfRecentWindowStartMs = this.perfStartTimeMs;
        this.perfRecentFrameCount = 0;
        this.perfRecentFps = 0;
        this.tacticalReliefFocusApplied = false;
        this.onPostRender = () => {
            const now = performance.now();
            this.perfFrameCount += 1;
            this.perfRecentFrameCount += 1;
            const windowMs = now - this.perfRecentWindowStartMs;
            if (windowMs >= 1000) {
                this.perfRecentFps = (this.perfRecentFrameCount * 1000) / windowMs;
                this.perfRecentFrameCount = 0;
                this.perfRecentWindowStartMs = now;
            }
        };
        this.stableGlobalBaselineMode = AppConfig.terrain.operationMode === 'stableGlobalBaseline';
        this.globalMaterialExperimentEnabled = AppConfig.terrain.experiment.enableGlobalMaterialAttempt;
        this.adaptiveLodMaxProfile = AppConfig.terrain.experiment.adaptiveLodMaxProfile;

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
        this.viewer.scene.postRender.addEventListener(this.onPostRender);

        // Force initial view: full globe with geocenter near screen center
        this.applyInitialView();

        this.themeManager = new ThemeManager(this.viewer);
        this.dataManager = new DataManager(this.viewer);
        this.dataManager.setQueryLevel(this.currentLodConfig.queryLevel);
        this.diagnostics = new VisualDiagnostics(this.viewer);
        this.overlayManager = new TacticalOverlayManager(this.viewer);
        const hudContainer = this.viewer.container as HTMLElement;
        this.hudManager = new HudManager(hudContainer, 'docked');
        this.initPromise = this.initialize(terrainUrl, useDynamicTerrain, theme);
    }

    /**
     * 切换渲染主题
     */
    public applyTheme(name: string): void {
        this.currentTheme = name;
        const sceneTheme = this.resolveSceneTheme(name);
        const forceImageryInContinental =
            this.currentLodProfile === 'continental' && AppConfig.terrain.debug.showImageryInContinental;
        const cameraHeight = this.viewer.camera.positionCartographic.height;
        const forceEllipsoidByHeight =
            AppConfig.terrain.enableGlobalFallback &&
            Number.isFinite(cameraHeight) &&
            cameraHeight >= AppConfig.terrain.fallbackSwitchHeight;
        const terrainDegradedForCurrentProfile =
            this.currentLodConfig.useLocalTerrain &&
            (this.localTerrainBlockedByOom || !this.localTerrainProvider || forceEllipsoidByHeight);
        const forceFallbackImagery = terrainDegradedForCurrentProfile;
        const baseLayerEnabled =
            this.currentLodConfig.enableImagery || forceImageryInContinental || forceFallbackImagery;
        const materialPreset = forceFallbackImagery ? 'off' : this.currentLodConfig.materialPreset;
        if (forceFallbackImagery) {
            console.warn(
                `TacticalViewer: Fallback imagery enabled because terrain is unavailable for profile=${this.currentLodProfile}.`
            );
        }
        this.themeManager.applyTheme(sceneTheme.renderMode, {
            baseLayerEnabled,
            baseMapUrl: sceneTheme.baseMapUrl ?? this.baseMapUrl,
            tacticalStyle: this.resolveTacticalStyleByLod(this.currentLodConfig),
            tacticalMaterialPreset: materialPreset
        });
    }

    /**
     * 切换战术风格预设
     */
    public applyThemePack(name: ThemePackName): void {
        this.tacticalStyle = AppConfig.ui.themePacks[name].tacticalStyle;
        const sceneTheme = this.resolveSceneTheme(this.currentTheme);
        if (sceneTheme.renderMode === 'tactical') {
            this.applyTheme(this.currentTheme);
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

    public getCurrentLodProfile(): TerrainLodProfileName {
        return this.currentLodProfile;
    }

    public getCurrentMetersPerPixel(): number {
        return this.currentMetersPerPixel;
    }

    public getLodSwitchStats(): LodSwitchStats {
        return {
            switchCount: this.lodSwitchCount,
            lastSwitchDurationMs: this.lastLodSwitchDurationMs,
            averageSwitchDurationMs: this.lodSwitchCount > 0
                ? this.totalLodSwitchDurationMs / this.lodSwitchCount
                : 0,
            lastSwitchAtEpochMs: this.lastLodSwitchAtEpochMs
        };
    }

    public getRenderPerfStats(): RenderPerfStats {
        const now = performance.now();
        const elapsedMs = Math.max(1, now - this.perfStartTimeMs);
        const averageFps = (this.perfFrameCount * 1000) / elapsedMs;
        return {
            averageFps,
            recentFps: this.perfRecentFps,
            sampleSeconds: elapsedMs / 1000
        };
    }

    public getRuntimeRenderMode(): string {
        if (this.localTerrainBlockedByOom) {
            return 'SAFE_GLOBAL_FALLBACK_WASM_OOM';
        }
        if (!this.stableGlobalBaselineMode) {
            return 'ADAPTIVE_LOD';
        }
        if (!this.globalMaterialExperimentEnabled) {
            return 'STABLE_GLOBAL_IMAGERY_BASELINE';
        }
        if (this.currentLodProfile !== 'global') {
            return 'STABLE_GLOBAL_LOCK_PENDING';
        }
        const usingLocalTerrain = !!this.localTerrainProvider && this.viewer.terrainProvider === this.localTerrainProvider;
        if (usingLocalTerrain) {
            return 'STABLE_GLOBAL_MATERIAL_EXPERIMENT';
        }
        if (this.localTerrainLoading) {
            return 'STABLE_GLOBAL_MATERIAL_LOADING_FALLBACK';
        }
        return 'STABLE_GLOBAL_IMAGERY_FALLBACK';
    }

    public activateSafeMode(reason: string = 'manual'): void {
        if (reason === 'wasm-oom') {
            this.applyInitialView();
        }
        const mpp = this.estimateCenterMetersPerPixel();
        this.currentMetersPerPixel = mpp;
        this.applyLodProfile('global', mpp, true);
        console.warn(`TacticalViewer: Safe mode activated (${reason}).`);
    }

    /**
     * 运行视觉诊断流程。
     */
    public runDiagnostics(): Promise<void> {
        return this.diagnostics
            .runAutoPilot(this.localTerrainProvider ?? this.viewer.terrainProvider)
            .finally(() => {
                this.reconcileLodProfileNow();
            });
    }

    public handleWasmOutOfMemory(): void {
        if (this.localTerrainBlockedByOom) {
            return;
        }
        this.localTerrainBlockedByOom = true;
        this.localTerrainLoading = false;
        this.localTerrainProvider = undefined;
        this.terrainUrl = undefined;
        this.activateSafeMode('wasm-oom');
        this.onTerrainStatusChange?.('failed', 'WASM_OOM_LOCAL_TERRAIN_DISABLED');
        console.error('TacticalViewer: Local terrain disabled for this session due to WASM OOM.');
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
        if (this.lodSwitchTimer) {
            clearTimeout(this.lodSwitchTimer);
            this.lodSwitchTimer = undefined;
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
        this.overlayManager.destroy();
        this.viewer.scene.postRender.removeEventListener(this.onPostRender);
        if (!this.viewer.isDestroyed()) {
            this.viewer.destroy();
        }
    }

    private async initialize(
        _terrainUrl: string | undefined,
        _useDynamicTerrain: boolean,
        theme: string
    ): Promise<void> {
        // 2. 配置底图
        this.configureBaseLayer(this.baseLayerEnabled);

        // 3. 应用初始主题
        this.currentMetersPerPixel = this.estimateCenterMetersPerPixel();
        // 初始化阶段直接按绝对阈值定档，避免因过渡态和冷却策略卡在中间档位。
        this.currentLodProfile = this.classifyLodProfile(this.currentMetersPerPixel);
        this.applyLodProfile(this.currentLodProfile, this.currentMetersPerPixel, false);
        this.applyTheme(theme);
        this.setupZoomOutLimit();
        this.setupLodProfileSwitching();
        this.setupHudTracking();
        if (AppConfig.tacticalOverlay.enabled && AppConfig.tacticalOverlay.scenario === 'redFlagDemo') {
            this.overlayManager.applyRedFlagScenario();
        }

        if (!this.terrainUrl) {
            this.onTerrainStatusChange?.('disabled', 'Terrain URL is empty.');
        } else if (this.stableGlobalBaselineMode && !this.globalMaterialExperimentEnabled) {
            // 稳定基线模式下，渲染仍使用椭球地形，但后台预加载本地 terrain 供高程查询使用。
            // 这样可恢复 HUD/点位查询的真实高程，同时不改变默认渲染策略。
            void this.configureTerrain(this.terrainUrl, this.terrainRequestVertexNormals);
        }

        // 初始化视觉诊断模块（通过实例方法 runDiagnostics 调用）
        console.log("TacticalViewer: VisualDiagnostics initialized. Use viewer.runDiagnostics() to test.");

        // 视角已在构造阶段初始化，避免在此覆盖 forceProfile/tactical 自动聚焦结果。
    }

    private applyInitialView(): void {
        this.viewer.camera.setView({
            destination: Cartesian3.fromDegrees(
                AppConfig.camera.longitude,
                AppConfig.camera.latitude,
                AppConfig.camera.height
            ),
            orientation: {
                heading: CesiumMath.toRadians(AppConfig.camera.heading),
                pitch: CesiumMath.toRadians(AppConfig.camera.pitch),
                roll: AppConfig.camera.roll
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

    private estimateCenterMetersPerPixel(): number {
        const canvas = this.viewer.scene.canvas;
        const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
        return this.estimateMetersPerPixel(center);
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
        if (this.localTerrainLoading || this.localTerrainProvider || this.localTerrainBlockedByOom) {
            return;
        }
        this.localTerrainLoading = true;
        console.log(`TacticalViewer: Configuring terrain from URL: ${url}`);
        try {
            const provider = await CesiumTerrainProvider.fromUrl(url, {
                requestVertexNormals: requestVertexNormals
            });
            console.log("TacticalViewer: CesiumTerrainProvider.fromUrl returned successfully.");
            this.localTerrainProvider = provider;
            this.dataManager.setPreferredTerrainProvider(provider);
            console.log("TacticalViewer: Terrain provider ready.");
            this.onTerrainStatusChange?.('connected', url);
            this.applyTerrainProviderByLod(this.currentLodConfig);
            // 关键：地形异步就绪后需要重新套用主题，清除“terrain unavailable”回退贴图。
            this.applyTheme(this.currentTheme);
        } catch (error) {
            console.error("TacticalViewer: FAILED to load terrain service:", error);
            const detail = error instanceof Error ? error.message : String(error);
            this.onTerrainStatusChange?.('failed', detail);
            this.applyTerrainProviderByLod(this.currentLodConfig);
            this.applyTheme(this.currentTheme);
        } finally {
            this.localTerrainLoading = false;
        }
    }

    private setupLodProfileSwitching(): void {
        if (this.stableGlobalBaselineMode) {
            this.currentMetersPerPixel = this.estimateCenterMetersPerPixel();
            this.applyLodProfile('global', this.currentMetersPerPixel, true);
            console.warn('TacticalViewer: LOD auto-switch disabled (operationMode=stableGlobalBaseline).');
            return;
        }
        const forcedProfile = AppConfig.terrain.debug.forceProfile;
        if (forcedProfile) {
            this.currentMetersPerPixel = this.estimateCenterMetersPerPixel();
            this.applyLodProfile(forcedProfile, this.currentMetersPerPixel, true);
            console.warn(`TacticalViewer: LOD auto-switch disabled, forceProfile=${forcedProfile}.`);
            return;
        }
        const debounceMs = AppConfig.terrain.modeSwitch.debounceMs;
        const cooldownMs = AppConfig.terrain.modeSwitch.cooldownMs;
        const onCameraChanged = () => {
            this.enforceCameraSafetyBounds();
            if (this.lodSwitchTimer) {
                clearTimeout(this.lodSwitchTimer);
            }
            this.lodSwitchTimer = setTimeout(() => {
                const mpp = this.estimateCenterMetersPerPixel();
                const nextProfile = this.evaluateLodProfile(mpp, this.currentLodProfile);
                this.currentMetersPerPixel = mpp;
                if (nextProfile !== this.currentLodProfile) {
                    const now = Date.now();
                    if (this.lastLodSwitchAtEpochMs && now - this.lastLodSwitchAtEpochMs < cooldownMs) {
                        const waitMs = cooldownMs - (now - this.lastLodSwitchAtEpochMs);
                        this.scheduleLodReconcile(waitMs);
                        this.onLodProfileChange?.(this.currentLodProfile, mpp);
                        return;
                    }
                    this.applyLodProfile(nextProfile, mpp, true);
                } else {
                    this.onLodProfileChange?.(this.currentLodProfile, mpp);
                }
            }, debounceMs);
        };
        this.viewer.camera.changed.addEventListener(onCameraChanged);
        this.removeCameraChangedListener = () => {
            this.viewer.camera.changed.removeEventListener(onCameraChanged);
        };
        onCameraChanged();
    }

    private scheduleLodReconcile(waitMs: number): void {
        if (this.lodSwitchTimer) {
            clearTimeout(this.lodSwitchTimer);
        }
        this.lodSwitchTimer = setTimeout(() => {
            this.enforceCameraSafetyBounds();
            const mpp = this.estimateCenterMetersPerPixel();
            this.currentMetersPerPixel = mpp;
            const target = this.classifyLodProfile(mpp);
            if (target !== this.currentLodProfile) {
                this.applyLodProfile(target, mpp, true);
            } else {
                this.onLodProfileChange?.(this.currentLodProfile, mpp);
            }
        }, Math.max(16, waitMs));
    }

    private reconcileLodProfileNow(): void {
        if (this.stableGlobalBaselineMode) {
            this.currentMetersPerPixel = this.estimateCenterMetersPerPixel();
            if (this.currentLodProfile !== 'global') {
                this.applyLodProfile('global', this.currentMetersPerPixel, true);
                return;
            }
            this.onLodProfileChange?.(this.currentLodProfile, this.currentMetersPerPixel);
            return;
        }
        const forcedProfile = AppConfig.terrain.debug.forceProfile;
        if (forcedProfile) {
            this.currentMetersPerPixel = this.estimateCenterMetersPerPixel();
            if (forcedProfile !== this.currentLodProfile) {
                this.applyLodProfile(forcedProfile, this.currentMetersPerPixel, true);
                return;
            }
            this.onLodProfileChange?.(this.currentLodProfile, this.currentMetersPerPixel);
            return;
        }
        const mpp = this.estimateCenterMetersPerPixel();
        this.currentMetersPerPixel = mpp;
        const target = this.classifyLodProfile(mpp);
        if (target !== this.currentLodProfile) {
            this.applyLodProfile(target, mpp, true);
            return;
        }
        this.onLodProfileChange?.(this.currentLodProfile, mpp);
    }

    private applyLodProfile(profile: TerrainLodProfileName, metersPerPixel: number, emitLog: boolean): void {
        if (this.localTerrainBlockedByOom && profile !== 'global') {
            profile = 'global';
        }
        profile = this.clampProfileToAdaptiveCap(profile);
        const begin = performance.now();
        this.currentLodProfile = profile;
        this.currentLodConfig = AppConfig.terrain.lodProfiles[profile];
        this.enforceCameraSafetyBounds();
        this.applyTerrainProviderByLod(this.currentLodConfig);
        this.applyTacticalVisualizationHints(profile);
        this.dataManager.setQueryLevel(this.currentLodConfig.queryLevel);
        this.ensureTacticalObliqueView(profile);
        this.applyTheme(this.currentTheme);
        if (emitLog) {
            const durationMs = performance.now() - begin;
            this.lodSwitchCount += 1;
            this.totalLodSwitchDurationMs += durationMs;
            this.lastLodSwitchDurationMs = durationMs;
            this.lastLodSwitchAtEpochMs = Date.now();
            console.log(
                `TacticalViewer: LOD profile switched to ${profile} (mpp=${metersPerPixel.toFixed(2)}, material=${this.currentLodConfig.materialPreset}, imagery=${this.currentLodConfig.enableImagery}, cost=${durationMs.toFixed(2)}ms).`
            );
        }
        this.onLodProfileChange?.(profile, metersPerPixel);
    }

    private enforceCameraSafetyBounds(): void {
        const camera = this.viewer.camera;
        const pos = camera.positionCartographic;
        if (!pos) return;
        const minHeight = this.currentLodProfile === 'tactical' ? 900.0 : 2500.0;
        const needsHeightClamp = Number.isFinite(pos.height) && pos.height < minHeight;
        const needsPitchClamp = this.currentLodProfile !== 'global' && camera.pitch > CesiumMath.toRadians(-8.0);
        if (!needsHeightClamp && !needsPitchClamp) return;
        camera.setView({
            destination: Cartesian3.fromRadians(
                pos.longitude,
                pos.latitude,
                needsHeightClamp ? minHeight : pos.height
            ),
            orientation: {
                heading: camera.heading,
                pitch: needsPitchClamp ? CesiumMath.toRadians(-18.0) : camera.pitch,
                roll: 0.0
            }
        });
    }

    private applyTacticalVisualizationHints(profile: TerrainLodProfileName): void {
        // tactical 档位下提高地形可读性，避免近地贴视角时“看起来一片平”。
        if (profile === 'tactical') {
            this.viewer.scene.verticalExaggeration = 3.6;
            // 允许近地低空观察起伏，但保留最小安全距离避免穿地。
            this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 800.0;
            return;
        }
        this.viewer.scene.verticalExaggeration = 1.0;
        this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1.0;
    }

    private ensureTacticalObliqueView(profile: TerrainLodProfileName): void {
        if (profile !== 'tactical') return;
        const camera = this.viewer.camera;
        const focus = AppConfig.terrain.debug.tacticalReliefFocus;
        if (focus.enabled && !this.tacticalReliefFocusApplied) {
            this.tacticalReliefFocusApplied = true;
            camera.setView({
                destination: Cartesian3.fromDegrees(
                    focus.longitude,
                    focus.latitude,
                    focus.height
                ),
                orientation: {
                    heading: CesiumMath.toRadians(focus.heading),
                    pitch: CesiumMath.toRadians(focus.pitch),
                    roll: 0.0
                }
            });
            return;
        }
        const pitch = camera.pitch;
        // 当用户几乎俯视地面时，地形起伏会被视觉压扁；进入 tactical 时自动拉到斜视角。
        if (!Number.isFinite(pitch) || pitch > -1.25) return;
        const pos = camera.positionCartographic;
        const destination = Cartesian3.fromRadians(
            pos.longitude,
            pos.latitude,
            Math.max(3500.0, pos.height * 1.02)
        );
        camera.setView({
            destination,
            orientation: {
                heading: camera.heading + CesiumMath.toRadians(8.0),
                pitch: CesiumMath.toRadians(-34.0),
                roll: 0.0
            }
        });
    }

    private applyTerrainProviderByLod(profile: TerrainLodProfile): void {
        const wantsLocalTerrain = profile.useLocalTerrain && !this.localTerrainBlockedByOom;
        if (wantsLocalTerrain && !this.localTerrainProvider && !this.localTerrainLoading && this.terrainUrl) {
            void this.configureTerrain(this.terrainUrl, this.terrainRequestVertexNormals);
        }
        const highAltitudeFallbackEnabled = AppConfig.terrain.enableGlobalFallback;
        const fallbackSwitchHeight = AppConfig.terrain.fallbackSwitchHeight;
        const cameraHeight = this.viewer.camera.positionCartographic.height;
        const forceEllipsoidByHeight =
            highAltitudeFallbackEnabled &&
            !this.stableGlobalBaselineMode &&
            Number.isFinite(cameraHeight) &&
            cameraHeight >= fallbackSwitchHeight;
        const useLocalTerrain = wantsLocalTerrain && !!this.localTerrainProvider && !forceEllipsoidByHeight;
        this.viewer.terrainProvider = useLocalTerrain
            ? this.localTerrainProvider as CesiumTerrainProvider
            : this.ellipsoidTerrainProvider;
    }

    private resolveTacticalStyleByLod(profile: TerrainLodProfile): TacticalMaterialOptions {
        return {
            ...this.tacticalStyle,
            ...(profile.tacticalStyleOverrides ?? {})
        };
    }

    private evaluateLodProfile(
        mpp: number,
        current: TerrainLodProfileName
    ): TerrainLodProfileName {
        if (this.stableGlobalBaselineMode) {
            return 'global';
        }
        if (this.localTerrainBlockedByOom) {
            return 'global';
        }
        const forcedProfile = AppConfig.terrain.debug.forceProfile;
        if (forcedProfile) return forcedProfile;
        const { global, continental, regional } = AppConfig.terrain.mppThresholds;
        const h = AppConfig.terrain.modeSwitch.hysteresisRatio;
        const enterGlobal = global * (1 + h);
        const leaveGlobal = global * (1 - h);
        const enterContinentalFromRegional = continental * (1 + h);
        const leaveContinentalToRegional = continental * (1 - h);
        const enterRegionalFromTactical = regional * (1 + h);
        const leaveRegionalToTactical = regional * (1 - h);

        if (current === 'global') {
            return this.clampProfileToAdaptiveCap(mpp < leaveGlobal ? 'continental' : 'global');
        }
        if (current === 'continental') {
            if (mpp > enterGlobal) return this.clampProfileToAdaptiveCap('global');
            if (mpp < leaveContinentalToRegional) return this.clampProfileToAdaptiveCap('regional');
            return this.clampProfileToAdaptiveCap('continental');
        }
        if (current === 'regional') {
            if (mpp > enterContinentalFromRegional) return this.clampProfileToAdaptiveCap('continental');
            if (mpp < leaveRegionalToTactical) return this.clampProfileToAdaptiveCap('tactical');
            return this.clampProfileToAdaptiveCap('regional');
        }
        return this.clampProfileToAdaptiveCap(mpp > enterRegionalFromTactical ? 'regional' : 'tactical');
    }

    private classifyLodProfile(mpp: number): TerrainLodProfileName {
        if (this.stableGlobalBaselineMode) {
            return 'global';
        }
        if (this.localTerrainBlockedByOom) {
            return 'global';
        }
        const forcedProfile = AppConfig.terrain.debug.forceProfile;
        if (forcedProfile) return forcedProfile;
        const { global, continental, regional } = AppConfig.terrain.mppThresholds;
        if (mpp > global) return this.clampProfileToAdaptiveCap('global');
        if (mpp > continental) return this.clampProfileToAdaptiveCap('continental');
        if (mpp > regional) return this.clampProfileToAdaptiveCap('regional');
        return this.clampProfileToAdaptiveCap('tactical');
    }

    private clampProfileToAdaptiveCap(profile: TerrainLodProfileName): TerrainLodProfileName {
        if (this.stableGlobalBaselineMode) {
            return profile;
        }
        const order: TerrainLodProfileName[] = ['global', 'continental', 'regional', 'tactical'];
        const targetIndex = order.indexOf(profile);
        const capIndex = order.indexOf(this.adaptiveLodMaxProfile);
        if (targetIndex < 0 || capIndex < 0) {
            return profile;
        }
        return targetIndex > capIndex ? order[capIndex] : profile;
    }

    private resolveSceneTheme(name: string): SceneThemeDefinition {
        const registry = AppConfig.ui.sceneThemes as Record<string, SceneThemeDefinition>;
        const registered = registry[name];
        if (registered) return registered;
        return registry[AppConfig.ui.theme];
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
