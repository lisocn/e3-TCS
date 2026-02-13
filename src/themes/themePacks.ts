import type { TacticalMaterialOptions } from './tacticalMaterial';

export interface ThemePack {
    uiTokens: Record<string, string>;
    tacticalStyle: TacticalMaterialOptions;
}

/**
 * 主题包注册表。
 * 每个主题包必须同时提供 UI token 和地形渲染参数。
 */
export const THEME_PACKS = {
    commandCenter: {
        uiTokens: {
            '--color-primary': '#00f0ff',
            '--color-accent': '#53ffa8',
            '--color-warning': '#ffcc00',
            '--color-danger': '#ff4d4f',
            '--color-bg-main': '#050b17',
            '--color-bg-panel': 'rgba(13, 22, 40, 0.82)',
            '--color-control-bg': '#0d172b',
            '--color-control-border': 'rgba(0, 240, 255, 0.42)',
            '--color-control-text': '#cfe9ff',
            '--color-log-text': '#8ea8bf',
            '--color-hud-text': '#35ffb5',
            '--color-hud-border': 'rgba(53, 255, 181, 0.5)',
            '--color-hud-bg': 'rgba(2, 7, 14, 0.68)',
            '--panel-border-color': 'rgba(0, 240, 255, 0.24)',
            '--panel-hover-glow': 'rgba(0, 240, 255, 0.25)',
            '--panel-radius': '6px',
            '--panel-blur': '10px'
        },
        tacticalStyle: {
            elevationMin: -200.0,
            elevationMax: 7000.0,
            contourInterval: 220.0,
            contourThickness: 1.0,
            macroGridDensity: 14.0,
            macroGridWidth: 0.045,
            microGridDensity: 82.0,
            microGridWidth: 0.013,
            lodNear: 95000.0,
            lodMid: 360000.0,
            lodFar: 1350000.0,
            colorLow: '#324254',
            colorHigh: '#8ba4b8',
            colorRidge: '#dce9f2',
            colorContour: '#0f141b',
            colorMacroGrid: '#54d4ff',
            colorMicroGrid: '#79ff9e'
        }
    },
    battlefieldSand: {
        uiTokens: {
            '--color-primary': '#ffc768',
            '--color-accent': '#8fffc0',
            '--color-warning': '#ff9f1c',
            '--color-danger': '#ff5f5f',
            '--color-bg-main': '#18130c',
            '--color-bg-panel': 'rgba(47, 36, 24, 0.84)',
            '--color-control-bg': '#2b2116',
            '--color-control-border': 'rgba(255, 199, 104, 0.42)',
            '--color-control-text': '#f6e4c6',
            '--color-log-text': '#d6be96',
            '--color-hud-text': '#b8ff7f',
            '--color-hud-border': 'rgba(184, 255, 127, 0.48)',
            '--color-hud-bg': 'rgba(18, 12, 6, 0.72)',
            '--panel-border-color': 'rgba(255, 199, 104, 0.22)',
            '--panel-hover-glow': 'rgba(255, 199, 104, 0.24)',
            '--panel-radius': '3px',
            '--panel-blur': '6px'
        },
        tacticalStyle: {
            elevationMin: -200.0,
            elevationMax: 6500.0,
            contourInterval: 130.0,
            contourThickness: 1.35,
            macroGridDensity: 19.0,
            macroGridWidth: 0.06,
            microGridDensity: 125.0,
            microGridWidth: 0.022,
            lodNear: 130000.0,
            lodMid: 490000.0,
            lodFar: 1600000.0,
            colorLow: '#5f4a33',
            colorHigh: '#d5b487',
            colorRidge: '#f6e4b8',
            colorContour: '#1a1410',
            colorMacroGrid: '#ffd166',
            colorMicroGrid: '#b8ff7f'
        }
    }
} as const satisfies Record<string, ThemePack>;

export type ThemePackName = keyof typeof THEME_PACKS;
