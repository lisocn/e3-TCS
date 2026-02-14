import { THEME_PACKS, type ThemePackName } from './themes/themePacks';
import type { TacticalMaterialDebugMode, TacticalMaterialOptions } from './themes/tacticalMaterial';

/**
 * 应用全局配置
 * 遵循配置驱动设计，所有业务参数在此集中管理。
 */
declare global {
    interface Window {
        E3_CONFIG?: {
            terrainUrl?: string;
            baseMapUrl?: string;
            forceProfile?: TerrainLodProfileName;
            enableGlobalMaterialAttempt?: boolean;
            lodMaterialDebugMode?: Partial<Record<TerrainLodProfileName, TacticalMaterialDebugMode>>;
            terrainOperationMode?: TerrainOperationMode;
            adaptiveLodMaxProfile?: TerrainLodProfileName;
            themePack?: ThemePackName;
        };
    }
}

function getRuntimeConfig(): {
    terrainUrl?: string;
    baseMapUrl?: string;
    forceProfile?: TerrainLodProfileName;
    enableGlobalMaterialAttempt?: boolean;
    lodMaterialDebugMode?: Partial<Record<TerrainLodProfileName, TacticalMaterialDebugMode>>;
    terrainOperationMode?: TerrainOperationMode;
    adaptiveLodMaxProfile?: TerrainLodProfileName;
    themePack?: ThemePackName;
} {
    if (typeof window === 'undefined') {
        return {};
    }
    return window.E3_CONFIG ?? {};
}

const runtimeConfig = getRuntimeConfig();
const lodMaterialDebugModeConfig = runtimeConfig.lodMaterialDebugMode ?? {};
const enableGlobalMaterialAttempt = runtimeConfig.enableGlobalMaterialAttempt ?? false;
const terrainOperationMode = runtimeConfig.terrainOperationMode ?? 'stableGlobalBaseline';
const adaptiveLodMaxProfile = runtimeConfig.adaptiveLodMaxProfile ?? 'tactical';

function getLodMaterialDiagnosticMode(profile: TerrainLodProfileName): TacticalMaterialDebugMode {
    return lodMaterialDebugModeConfig[profile] ?? 'off';
}

export type TerrainLodProfileName = 'global' | 'continental' | 'regional' | 'tactical';
export type TerrainOperationMode = 'stableGlobalBaseline' | 'adaptiveLod';
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
         * 必须指向本地瓦片服务，禁止使用在线 API
         */
        /**
         * 地形服务 URL
         * 优先使用运行时配置 (window.E3_CONFIG)，其次是默认开发地址
         */
        url: runtimeConfig.terrainUrl ?? 'http://localhost:4444/terrain/',

        /**
         * 是否请求顶点法线（用于动态光照）
         */
        requestVertexNormals: true,
        // 运行策略：
        // stableGlobalBaseline: 默认锁定 global（单档实现，先保证可读与稳定）
        // adaptiveLod: 启用四档自适应（后续逐步恢复）
        operationMode: terrainOperationMode,
        modeSwitch: {
            debounceMs: 80,
            hysteresisRatio: 0.08,
            cooldownMs: 180
        },
        debug: {
            // A/B 开关：是否在 continental 档位保留 imagery（用于效果对比）
            showImageryInContinental: false,
            // 诊断开关：固定 LOD 档位（不随相机自动切换）。为空表示按 mpp 自动切换。
            forceProfile: runtimeConfig.forceProfile,
            // RedFlag 演示辅助：首次进入 tactical 时自动跳到高起伏区域并给斜视角。
            tacticalReliefFocus: {
                enabled: terrainOperationMode === 'adaptiveLod',
                // Red Flag 演示默认聚焦 Nevada/东 Sierra 山脊地带（地形起伏更明显）。
                longitude: -118.30,
                latitude: 36.58,
                height: 9800.0,
                heading: 34.0,
                pitch: -24.0
            }
        },
        experiment: {
            // 开发实验开关：在 stableGlobalBaseline 中尝试使用 global 材质路径。
            // 关闭时走稳定基线（imagery + material off）。
            enableGlobalMaterialAttempt,
            // 开发实验开关：adaptiveLod 下允许的最大档位，用于分阶段恢复能力。
            adaptiveLodMaxProfile
        },
        mppThresholds: {
            global: 7000,
            continental: 2500,
            regional: 260
        },
        lodProfiles: {
            global: {
                useLocalTerrain: enableGlobalMaterialAttempt,
                enableImagery: !enableGlobalMaterialAttempt,
                materialPreset: enableGlobalMaterialAttempt ? 'mid' : 'off',
                queryLevel: enableGlobalMaterialAttempt ? 8 : 7,
                tacticalStyleOverrides: enableGlobalMaterialAttempt
                    ? {
                        debugMode: getLodMaterialDiagnosticMode('global'),
                        enableRelief: true,
                        enableContour: true,
                        enableMacroGrid: false,
                        enableMicroGrid: false,
                        elevationMin: -3500.0,
                        elevationMax: 4200.0,
                        contourInterval: 180.0,
                        contourThickness: 1.35,
                        colorLow: '#58412b',
                        colorHigh: '#cba16c',
                        colorRidge: '#efd5a1',
                        colorContour: '#2f2116'
                    }
                    : undefined
            },
            continental: {
                useLocalTerrain: true,
                enableImagery: false,
                materialPreset: 'mid',
                queryLevel: 8,
                tacticalStyleOverrides: {
                    debugMode: getLodMaterialDiagnosticMode('continental'),
                    enableRelief: true,
                    enableContour: true,
                    enableMacroGrid: false,
                    enableMicroGrid: false,
                    // 大陆级显示：强调海陆分层，不追求细网格
                    debugShading: false,
                    elevationMin: -3500.0,
                    elevationMax: 4200.0,
                    contourInterval: 150.0,
                    contourThickness: 1.4,
                    macroGridDensity: 15.0,
                    macroGridWidth: 0.058,
                    microGridDensity: 24.0,
                    microGridWidth: 0.0,
                    colorLow: '#5f472f',
                    colorHigh: '#caa06a',
                    colorRidge: '#efd6a2',
                    colorContour: '#352418',
                    colorMacroGrid: '#f0cb61',
                    colorMicroGrid: '#78ddff'
                }
            },
            regional: {
                useLocalTerrain: true,
                enableImagery: false,
                materialPreset: 'mid',
                queryLevel: 9,
                tacticalStyleOverrides: {
                    debugMode: getLodMaterialDiagnosticMode('regional'),
                    enableRelief: true,
                    enableContour: true,
                    enableMacroGrid: false,
                    enableMicroGrid: false,
                    contourInterval: 120.0,
                    contourThickness: 1.1,
                    macroGridDensity: 18.0,
                    macroGridWidth: 0.048,
                    microGridDensity: 44.0,
                    microGridWidth: 0.008,
                    colorLow: '#644b32',
                    colorHigh: '#cea771',
                    colorRidge: '#f1d9a8',
                    colorContour: '#322216',
                    colorMacroGrid: '#f0ca5f',
                    colorMicroGrid: '#73d7ff'
                }
            },
            tactical: {
                useLocalTerrain: true,
                enableImagery: false,
                materialPreset: 'high',
                queryLevel: undefined,
                tacticalStyleOverrides: {
                    debugMode: getLodMaterialDiagnosticMode('tactical'),
                    // 近景增强：提升地形明暗与等高线可读性，避免“看起来无变化”。
                    enableRelief: true,
                    enableContour: true,
                    enableMacroGrid: false,
                    enableMicroGrid: false,
                    elevationMin: -120.0,
                    elevationMax: 2300.0,
                    contourInterval: 26.0,
                    contourThickness: 4.2,
                    macroGridDensity: 22.0,
                    macroGridWidth: 0.062,
                    microGridDensity: 86.0,
                    microGridWidth: 0.03,
                    colorLow: '#5b3a1f',
                    colorHigh: '#d19a58',
                    colorRidge: '#ffe8b8',
                    colorContour: '#f8e6c1',
                    colorMacroGrid: '#f2cd60',
                    colorMicroGrid: '#38dcff'
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
        theme: 'tactical', // Default scene theme key
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
        /**
         * 是否启用基础影像图层
         * 如果为 false，将显示纯色背景（如深空黑）
         */
        enabled: false,

        /**
         * 影像服务 URL (预留)
         * 必须指向本地服务
         */
        url: runtimeConfig.baseMapUrl ?? ''
    }
} as const;

export type ThemePackConfig = (typeof AppConfig.ui.themePacks)[ThemePackName];
export type SceneThemeName = keyof typeof AppConfig.ui.sceneThemes;
export type LanguageCode = (typeof AppConfig.i18n.supportedLanguages)[number];
export type { ThemePackName };
