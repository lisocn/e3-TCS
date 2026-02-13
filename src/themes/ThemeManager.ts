import {
    Viewer,
    Color,
    Material,
    UrlTemplateImageryProvider,
    GeographicTilingScheme,
    buildModuleUrl
} from 'cesium';
import { getTacticalMaterialFabric, type TacticalMaterialOptions } from './tacticalMaterial';

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
        name: 'tactical' | 'satellite',
        options: {
            baseMapUrl?: string;
            baseLayerEnabled?: boolean;
            tacticalStyle?: TacticalMaterialOptions;
        } = {}
    ): void {
        if (name === 'tactical') {
            this.setTacticalTheme(options.tacticalStyle);
        } else {
            this.setSatelliteTheme(options.baseMapUrl, options.baseLayerEnabled ?? true);
        }
    }

    /**
     * 设置战术模式
     * 特点：高对比度、单色底图、突出地形起伏
     */
    private setTacticalTheme(tacticalStyle?: TacticalMaterialOptions): void {
        console.log("ThemeManager: Activating Tactical Theme (Red Flag)...");
        const { scene } = this.viewer;
        // 先确保海陆轮廓可见：战术模式使用离线 NaturalEarthII 底图
        // 这样可以稳定呈现大洲/海洋边界，避免“纯色球”。
        if (tacticalStyle) {
            scene.globe.material = new Material({
                fabric: getTacticalMaterialFabric(tacticalStyle)
            });
        } else {
            scene.globe.material = undefined;
        }
        this.viewer.imageryLayers.removeAll();
        this.viewer.imageryLayers.addImageryProvider(new UrlTemplateImageryProvider({
            url: `${buildModuleUrl('Assets/Textures/NaturalEarthII')}/{z}/{x}/{reverseY}.jpg`,
            tilingScheme: new GeographicTilingScheme(),
            minimumLevel: 0,
            maximumLevel: 2
        }));
        const baseLayer = this.viewer.imageryLayers.get(0);
        if (baseLayer) {
            baseLayer.brightness = 0.88;
            baseLayer.contrast = 1.22;
            baseLayer.gamma = 0.92;
            baseLayer.saturation = 0.35;
        }
        console.log("ThemeManager: NaturalEarthII tactical base layer applied.");

        // 不需要再手动设置 uniforms，因为 Fabric 定义里已经包含了初始值
        // 如果需要动态修改，可以保留引用:
        // const material = scene.globe.material;
        // material.uniforms.color = ...

        scene.globe.depthTestAgainstTerrain = false;
        scene.globe.enableLighting = false; // 关闭光照，使用 Shader 自发光

        // Camouflage: Set base color to match terrain "Tan" color to hide skirts/cracks
        scene.globe.baseColor = Color.fromCssColorString('#132033');
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
    }
}
