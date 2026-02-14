import {
    Viewer,
    Color,
    Material,
    UrlTemplateImageryProvider,
    GeographicTilingScheme,
    buildModuleUrl,
    SingleTileImageryProvider
} from 'cesium';
import { getTacticalMaterialFabric, type TacticalMaterialOptions } from './tacticalMaterial';
import type { SceneThemeRenderMode, TacticalMaterialPreset } from '../config';

/**
 * 默认分层设色图 (Base64)
 * 1x1 像素纯色 PNG (绿色)
 */

/**
 * 主题管理器
 * 负责切换 Cesium Globe 的材质、场景配置和环境参数
 */
export class ThemeManager {
    private viewer: Viewer;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    /**
     * 应用主题
     * @param name 主题名称
     */
    public applyTheme(
        mode: SceneThemeRenderMode,
        options: {
            baseMapUrl?: string;
            baseLayerEnabled?: boolean;
            tacticalStyle?: TacticalMaterialOptions;
            tacticalMaterialPreset?: TacticalMaterialPreset;
        } = {}
    ): void {
        if (mode === 'tactical') {
            this.setTacticalTheme(
                options.tacticalStyle,
                options.baseLayerEnabled ?? true,
                options.tacticalMaterialPreset ?? 'high'
            );
        } else {
            this.setSatelliteTheme(options.baseMapUrl, options.baseLayerEnabled ?? true);
        }
    }

    /**
     * 设置战术模式
     * 特点：高对比度、单色底图、突出地形起伏
     */
    private setTacticalTheme(
        tacticalStyle?: TacticalMaterialOptions,
        baseLayerEnabled: boolean = true,
        materialPreset: TacticalMaterialPreset = 'high'
    ): void {
        console.log("ThemeManager: Activating Tactical Theme (Red Flag)...");
        const { scene } = this.viewer;
        if (materialPreset !== 'off' && tacticalStyle) {
            scene.globe.material = new Material({
                fabric: getTacticalMaterialFabric(tacticalStyle)
            });
            const debugMode = tacticalStyle.debugShading ? 'debug' : 'normal';
            const diagnosticMode = tacticalStyle.debugMode ?? 'off';
            console.log(`ThemeManager: Tactical material preset '${materialPreset}' enabled (${debugMode}, diagnostic=${diagnosticMode}).`);
            console.log(`ThemeManager: globe.material attached=${scene.globe.material ? 'yes' : 'no'}.`);
        } else {
            scene.globe.material = undefined;
            console.log("ThemeManager: Tactical material disabled for current LOD profile.");
        }
        this.viewer.imageryLayers.removeAll();
        if (baseLayerEnabled) {
            // tactical 模式允许启用离线 NaturalEarthII 底图以增强海陆轮廓辨识。
            const baseLayer = this.viewer.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
                url: `${buildModuleUrl('Assets/Textures/NaturalEarthII')}/{z}/{x}/{reverseY}.jpg`,
                tilingScheme: new GeographicTilingScheme(),
                minimumLevel: 0,
                maximumLevel: 2
            }));
            if (baseLayer) {
                baseLayer.brightness = 0.88;
                baseLayer.contrast = 1.22;
                baseLayer.gamma = 0.92;
                baseLayer.saturation = 0.35;
            }
            console.log("ThemeManager: NaturalEarthII tactical base layer applied.");
        } else {
            if (tacticalStyle?.debugShading) {
                // 诊断覆层：程序生成经纬网，非地图语义，仅用于确认渲染通道和档位切换。
                this.addDebugOverlayImagery();
                console.log("ThemeManager: Tactical debug overlay imagery applied.");
            } else {
                console.log("ThemeManager: Tactical theme running without any imagery fallback.");
            }
        }
        console.log(`ThemeManager: imagery layer count = ${this.viewer.imageryLayers.length}.`);
        for (let i = 0; i < this.viewer.imageryLayers.length; i += 1) {
            const layer = this.viewer.imageryLayers.get(i);
            console.log(
                `ThemeManager: layer[${i}] show=${layer.show} alpha=${layer.alpha.toFixed(2)}`
            );
        }

        // 不需要再手动设置 uniforms，因为 Fabric 定义里已经包含了初始值
        // 如果需要动态修改，可以保留引用:
        // const material = scene.globe.material;
        // material.uniforms.color = ...

        scene.globe.depthTestAgainstTerrain = false;
        scene.globe.enableLighting = true; // 开启光照，增强山体与峡谷体积感

        // 当本地 terrain 覆盖不完整时，会回退到 baseColor；使用主题低海拔色避免整球发黑。
        const fallbackBaseColor = tacticalStyle?.colorLow ?? '#1a1f24';
        scene.globe.baseColor = Color.fromCssColorString(fallbackBaseColor);
        scene.globe.showSkirts = true;
        scene.requestRenderMode = true;
        scene.maximumRenderTimeChange = 0.5;

        // 强制添加一个单色底图层，作为地形缺失时的"补丁"
        // 这能有效填充北极等区域的"黑洞"，使其显示为沙土色

        // 修正: 移除 1x1 Base Layer Patch，因为在近距离 (LOD 5km) 可能导致 GPU 崩溃 (Context Destroyed)
        // 优先保证全球渲染稳定性，牺牲北极点填充。
        // scene.globe.baseColor = Color.fromCssColorString('#B39973'); // 已设置保底色

        /*
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#B39973';
            ctx.fillRect(0, 0, 1, 1);
            this.viewer.imageryLayers.addImageryProvider(new SingleTileImageryProvider({
                url: canvas.toDataURL(),
                tileWidth: 1,
                tileHeight: 1
            }));
        }
        */

        if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;

        // 使用 module augmentation 后，无需强制转型
        scene.globe.showGroundAtmosphere = false;

        // 背景与地表分离，避免地球轮廓不可辨识
        scene.backgroundColor = Color.fromCssColorString('#0b0f19');
        scene.requestRender();
    }

    /**
     * 设置卫星模式
     * 恢复默认写实风格
     */
    private setSatelliteTheme(baseMapUrl?: string, baseLayerEnabled: boolean = true): void {
        const { scene } = this.viewer;
        const { globe } = scene;

        // 恢复默认材质
        globe.material = undefined;

        // 恢复大气渲染
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;

        // 使用 module augmentation 后，无需强制转型
        globe.showGroundAtmosphere = true;

        scene.globe.depthTestAgainstTerrain = false;

        this.viewer.imageryLayers.removeAll();
        if (!baseLayerEnabled) {
            console.warn('ThemeManager: Satellite theme active but basemap is disabled.');
            return;
        }
        if (!baseMapUrl) {
            console.error('ThemeManager: Satellite theme requested but no basemap URL configured.');
            return;
        }

        this.viewer.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
            url: baseMapUrl
        }));
        scene.requestRender();
    }

    private addDebugOverlayImagery(): void {
        const width = 1024;
        const height = 512;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 纬向色带：海洋-陆地过渡，快速判断贴图是否生效。
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0.0, '#193f61');
        gradient.addColorStop(0.48, '#2c5f7f');
        gradient.addColorStop(0.52, '#b8ab84');
        gradient.addColorStop(1.0, '#6e6d5d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // 叠加经纬网：每 15° 一条细线，每 45° 一条粗线。
        for (let lon = 0; lon <= 360; lon += 15) {
            const x = Math.round((lon / 360) * width);
            const major = lon % 45 === 0;
            ctx.strokeStyle = major ? 'rgba(250,250,250,0.35)' : 'rgba(255,255,255,0.12)';
            ctx.lineWidth = major ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let lat = -90; lat <= 90; lat += 15) {
            const y = Math.round(((90 - lat) / 180) * height);
            const major = lat % 45 === 0;
            ctx.strokeStyle = major ? 'rgba(250,250,250,0.32)' : 'rgba(255,255,255,0.10)';
            ctx.lineWidth = major ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        const layer = this.viewer.imageryLayers.addImageryProvider(new SingleTileImageryProvider({
            url: canvas.toDataURL('image/png'),
            tileWidth: width,
            tileHeight: height
        }));
        if (layer) {
            layer.alpha = 0.45;
        }
    }
}
