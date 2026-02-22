import { THEME_PACKS, type ThemePackName } from './themes/themePacks';
import type { TacticalMaterialOptions } from './themes/tacticalMaterial';

/**
 * 应用全局配置
 * 遵循配置驱动设计，所有业务参数在此集中管理。
 */
declare global {
    interface Window {
        E3_CONFIG?: {
            terrainUrl?: string;
            baseMapUrl?: string;
            themePack?: ThemePackName;
        };
    }
}

function getRuntimeConfig(): {
    terrainUrl?: string;
    baseMapUrl?: string;
    themePack?: ThemePackName;
} {
    if (typeof window === 'undefined') {
        return {};
    }
    return window.E3_CONFIG ?? {};
}

const runtimeConfig = getRuntimeConfig();

export type TerrainLodProfileName = 'global' | 'continental' | 'regional' | 'tactical';
export type TacticalMaterialPreset = 'off' | 'low' | 'mid' | 'high';
export type SceneThemeRenderMode = 'tactical' | 'satellite';
export type TacticalOverlayScenario = 'off' | 'redFlagDemo';

export interface SceneThemeDefinition {
    renderMode: SceneThemeRenderMode;
    baseMapUrl?: string;
}

export interface TerrainLodProfile {
    useLocalTerrain: boolean;
    enableImagery: boolean;
    materialPreset: TacticalMaterialPreset;
    queryLevel?: number;
    tacticalStyleOverrides?: Partial<TacticalMaterialOptions>;
}

export const AppConfig = {
    /**
     * 国际化配置
     */
    i18n: {
        defaultLanguage: 'zh-CN',
        supportedLanguages: ['zh-CN', 'en-US']
    },

    /**
     * 地形服务配置
     */
    terrain: {
        /**
         * 地形服务 URL
         * 优先使用运行时配置 (window.E3_CONFIG)，其次是默认开发地址。
         */
        url: runtimeConfig.terrainUrl ?? 'http://localhost:4444/terrain/',

        /**
         * 是否请求顶点法线（用于法线驱动地形表达）
         */
        requestVertexNormals: true,

        modeSwitch: {
            debounceMs: 80,
            hysteresisRatio: 0.08,
            cooldownMs: 180
        },

        mppThresholds: {
            global: 9000,
            continental: 2800,
            regional: 700
        },

        lodProfiles: {
            global: {
                useLocalTerrain: false,
                enableImagery: true,
                materialPreset: 'off',
                queryLevel: 7
            },
            continental: {
                useLocalTerrain: true,
                enableImagery: true,
                materialPreset: 'mid',
                queryLevel: 8,
                tacticalStyleOverrides: {
                    enableRelief: false,
                    colorLow: '#7a6547',
                    colorHigh: '#cfa56e',
                    colorRidge: '#f1deb7',
                    toneGamma: 1.02,
                    toneShadowFloor: 0.66,
                    atmosphereHazeColor: '#b5a487',
                    atmosphereFarStart: 85000.0,
                    atmosphereFarEnd: 520000.0,
                    atmosphereStrength: 0.18,
                    minLighting: 0.22
                }
            },
            regional: {
                useLocalTerrain: true,
                enableImagery: false,
                materialPreset: 'mid',
                queryLevel: 9,
                tacticalStyleOverrides: {
                    enableRelief: true,
                    colorLow: '#6b5235',
                    colorHigh: '#cf9c5f',
                    colorRidge: '#f3d9a8',
                    toneGamma: 1.02,
                    toneShadowFloor: 0.58,
                    atmosphereHazeColor: '#bea98a',
                    atmosphereFarStart: 48000.0,
                    atmosphereFarEnd: 280000.0,
                    atmosphereStrength: 0.20,
                    minLighting: 0.16
                }
            },
            tactical: {
                useLocalTerrain: true,
                enableImagery: false,
                materialPreset: 'high',
                queryLevel: undefined,
                tacticalStyleOverrides: {
                    enableRelief: true,
                    colorLow: '#715235',
                    colorHigh: '#f1cf95',
                    colorRidge: '#ffe8bc',
                    toneGamma: 0.82,
                    toneShadowFloor: 0.30,
                    atmosphereHazeColor: '#000000',
                    atmosphereFarStart: 22000.0,
                    atmosphereFarEnd: 100000.0,
                    atmosphereStrength: 0.02,
                    minLighting: 0.23,
                    redFlagSlopeStart: 0.06,
                    redFlagSlopeEnd: 0.90,
                    redFlagHardBand: 0.78,
                    redFlagWarmBias: 0.42,
                    redFlagLutIntensity: 0.06,
                    redFlagLayerStage: 3.0
                }
            }
        } as Record<TerrainLodProfileName, TerrainLodProfile>,

        // 全球视角时，本地 terrain 数据覆盖不完整会出现极区黑洞。
        // 启用该策略后：高空自动回退到椭球地形；拉近后恢复本地 terrain。
        enableGlobalFallback: true,
        fallbackSwitchHeight: 2500000.0
    },

    /**
     * 初始视角配置（默认定位中国）
     */
    camera: {
        longitude: 104.0,
        latitude: 35.0,
        height: 26000000.0,
        heading: 0.0,
        pitch: -90.0,
        roll: 0.0
    },

    /**
     * UI 与主题配置
     */
    ui: {
        // 场景主题注册表：新增主题名只需要在此注册，无需修改核心代码。
        sceneThemes: {
            tactical: {
                renderMode: 'tactical'
            },
            satellite: {
                renderMode: 'satellite',
                baseMapUrl: runtimeConfig.baseMapUrl ?? ''
            }
        } as const satisfies Record<string, SceneThemeDefinition>,
        theme: 'tactical',
        themePack: runtimeConfig.themePack ?? 'commandCenter',
        themePacks: THEME_PACKS
    },

    tacticalOverlay: {
        enabled: false,
        scenario: 'off' as TacticalOverlayScenario
    },

    /**
     * 基础地图配置
     */
    basemap: {
        enabled: false,
        url: runtimeConfig.baseMapUrl ?? ''
    }
} as const;

export type ThemePackConfig = (typeof AppConfig.ui.themePacks)[ThemePackName];
export type SceneThemeName = keyof typeof AppConfig.ui.sceneThemes;
export type LanguageCode = (typeof AppConfig.i18n.supportedLanguages)[number];
export type { ThemePackName };
