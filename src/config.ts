import { THEME_PACKS, type ThemePackName } from './themes/themePacks';

/**
 * 应用全局配置
 * 遵循配置驱动设计，所有业务参数在此集中管理。
 */
declare global {
    interface Window {
        E3_CONFIG?: {
            terrainUrl?: string;
            baseMapUrl?: string;
        };
    }
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
        url: window.E3_CONFIG?.terrainUrl || 'http://localhost:4444/terrain/',

        /**
         * 是否请求顶点法线（用于动态光照）
         */
        requestVertexNormals: false,
        // 全球视角时，本地 terrain 数据覆盖不完整会出现极区黑洞。
        // 启用该策略后：高空自动回退到椭球地形；拉近后恢复本地 terrain。
        enableGlobalFallback: true,
        fallbackSwitchHeight: 2500000.0
    },

    /**
     * UI 与主题配置
     */
    ui: {
        theme: 'tactical', // Default to tactical theme
        themePack: 'commandCenter',
        themePacks: THEME_PACKS
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
        url: window.E3_CONFIG?.baseMapUrl || ''
    }
} as const;

export type ThemePackConfig = (typeof AppConfig.ui.themePacks)[ThemePackName];
export type LanguageCode = (typeof AppConfig.i18n.supportedLanguages)[number];
export type { ThemePackName };
