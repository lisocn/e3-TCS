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
                    enableContour: true,
                    enableMacroGrid: false,
                    enableMicroGrid: false,
                    contourInterval: 170.0,
                    contourThickness: 1.1,
                    macroGridDensity: 15.0,
                    macroGridWidth: 0.058,
                    microGridDensity: 24.0,
                    microGridWidth: 0.0,
                    colorLow: '#7a6547',
                    colorHigh: '#cfa56e',
                    colorRidge: '#f1deb7',
                    colorContour: '#5a4731',
                    colorMacroGrid: '#f0cb61',
                    colorMicroGrid: '#78ddff',
                    valleyContourMix: 0.22,
                    ridgeAccentMix: 0.62,
                    toneGamma: 1.02,
                    toneShadowFloor: 0.90,
                    toneHighlightCeiling: 1.20,
                    atmosphereHazeColor: '#b5a487',
                    atmosphereFarStart: 85000.0,
                    atmosphereFarEnd: 520000.0,
                    atmosphereStrength: 0.18,
                    atmosphereDesaturate: 0.10,
                    horizonWarmColor: '#d9b57c',
                    horizonCoolColor: '#8a8da2',
                    horizonStrength: 0.10,
                    horizonFarStart: 120000.0,
                    horizonFarEnd: 760000.0,
                    colorSunWarm: '#f1c57b',
                    colorShadowCool: '#8a8e9f',
                    warmCoolStrength: 0.18
                }
            },
            regional: {
                useLocalTerrain: true,
                enableImagery: false,
                materialPreset: 'mid',
                queryLevel: 9,
                tacticalStyleOverrides: {
                    enableRelief: true,
                    enableContour: true,
                    enableMacroGrid: false,
                    enableMicroGrid: false,
                    contourInterval: 132.0,
                    contourThickness: 0.9,
                    macroGridDensity: 18.0,
                    macroGridWidth: 0.048,
                    microGridDensity: 44.0,
                    microGridWidth: 0.008,
                    colorLow: '#6b5235',
                    colorHigh: '#cf9c5f',
                    colorRidge: '#f3d9a8',
                    colorContour: '#3c2d1e',
                    colorMacroGrid: '#f0ca5f',
                    colorMicroGrid: '#73d7ff',
                    valleyContourMix: 0.28,
                    ridgeAccentMix: 0.71,
                    toneGamma: 1.02,
                    toneShadowFloor: 0.86,
                    toneHighlightCeiling: 1.24,
                    atmosphereHazeColor: '#bea98a',
                    atmosphereFarStart: 48000.0,
                    atmosphereFarEnd: 280000.0,
                    atmosphereStrength: 0.20,
                    atmosphereDesaturate: 0.10,
                    horizonWarmColor: '#dfbd88',
                    horizonCoolColor: '#8f92a8',
                    horizonStrength: 0.12,
                    horizonFarStart: 76000.0,
                    horizonFarEnd: 420000.0,
                    colorSunWarm: '#efc07a',
                    colorShadowCool: '#8f92a5',
                    warmCoolStrength: 0.22
                }
            },
            tactical: {
                useLocalTerrain: true,
                enableImagery: false,
                materialPreset: 'high',
                queryLevel: undefined,
                tacticalStyleOverrides: {
                    enableRelief: true,
                    enableContour: false,
                    enableMacroGrid: false,
                    enableMicroGrid: false,
                    contourInterval: 56.0,
                    contourThickness: 2.6,
                    macroGridDensity: 22.0,
                    macroGridWidth: 0.062,
                    microGridDensity: 86.0,
                    microGridWidth: 0.03,
                    colorLow: '#6a4c30',
                    colorHigh: '#cda066',
                    colorRidge: '#efc992',
                    colorContour: '#2b1d12',
                    colorMacroGrid: '#f2cd60',
                    colorMicroGrid: '#38dcff',
                    valleyContourMix: 0.32,
                    ridgeAccentMix: 0.90,
                    toneGamma: 1.00,
                    toneShadowFloor: 0.74,
                    toneHighlightCeiling: 1.38,
                    atmosphereHazeColor: '#cab08b',
                    atmosphereFarStart: 28000.0,
                    atmosphereFarEnd: 140000.0,
                    atmosphereStrength: 0.02,
                    atmosphereDesaturate: 0.00,
                    horizonWarmColor: '#e1be8d',
                    horizonCoolColor: '#9a96ac',
                    horizonStrength: 0.06,
                    horizonFarStart: 46000.0,
                    horizonFarEnd: 220000.0,
                    colorSunWarm: '#d8a369',
                    colorShadowCool: '#5f4834',
                    warmCoolStrength: 0.18,
                    minLighting: 0.40,
                    diffuseWrap: 0.24,
                    ridgeRimGain: 0.30,
                    shadowBrownGain: 0.56,
                    // tactical 专属接缝抑制：仅收敛导数突变，不影响其他档位渲染链路。
                    seamSuppressStrength: 0.38,
                    normalDetailGain: 1.34,
                    edgeEnhanceGain: 0.96,
                    skirtSuppressStrength: 0.72,
                    seamFlattenStrength: 0.08,
                    seamLightingSuppress: 0.14,
                    plainBlendGain: 0.00,
                    rockDetailGain: 2.60,
                    plainCrispGain: 2.55,
                    plainGrainGain: 1.42,
                    oliveBias: 0.00,
                    colorMatchDesat: 0.00,
                    colorMatchBalance: 0.00,
                    hueShiftDeg: 0.0,
                    saturationScale: 1.00,
                    seamBandStrength: 0.04,
                    seamMatteStrength: 0.01,
                    plainMudBreakGain: 0.24,
                    plainTintSplitGain: 0.45,
                    plainMicroReliefGain: 0.92,
                    plainStructureGain: 1.32,
                    plainChromaticDiversityGain: 1.00,
                    plainFrequencyMixGain: 0.00,
                    plainLayerExpansionGain: 0.00
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
