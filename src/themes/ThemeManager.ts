import {
    Viewer,
    Color,
    Material,
    UrlTemplateImageryProvider,
    GeographicTilingScheme,
    buildModuleUrl
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
            console.log(`ThemeManager: Tactical material preset '${materialPreset}' enabled (normal).`);
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
                baseLayer.alpha = 0.72;
                baseLayer.brightness = 0.84;
                baseLayer.contrast = 1.32;
                baseLayer.gamma = 0.90;
                baseLayer.saturation = 0.22;
            }
            console.log("ThemeManager: NaturalEarthII tactical base layer applied.");
        } else {
            console.log("ThemeManager: Tactical theme running without any imagery fallback.");
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

        if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;

        // 使用 module augmentation 后，无需强制转型
        scene.globe.showGroundAtmosphere = false;
        scene.fog.enabled = false;

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
        scene.fog.enabled = true;

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
}
