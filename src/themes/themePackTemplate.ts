import type { TacticalMaterialOptions } from './tacticalMaterial';

export interface ThemePackTemplate {
    uiTokens: Record<string, string>;
    tacticalStyle: TacticalMaterialOptions;
}

export const REQUIRED_UI_TOKEN_KEYS = [
    '--color-primary',
    '--color-accent',
    '--color-warning',
    '--color-danger',
    '--color-bg-main',
    '--color-bg-panel',
    '--color-control-bg',
    '--color-control-border',
    '--color-control-text',
    '--color-log-text',
    '--color-hud-text',
    '--color-hud-border',
    '--color-hud-bg',
    '--panel-border-color',
    '--panel-hover-glow',
    '--panel-radius',
    '--panel-blur'
] as const;

const defaultUiTokens: Record<(typeof REQUIRED_UI_TOKEN_KEYS)[number], string> = {
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
};

const defaultTacticalStyle: TacticalMaterialOptions = {
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
};

/**
 * 创建主题包模板。
 * 可传入部分覆盖项，快速生成可用的完整主题包配置。
 */
export function createThemePackTemplate(overrides?: Partial<ThemePackTemplate>): ThemePackTemplate {
    return {
        uiTokens: {
            ...defaultUiTokens,
            ...(overrides?.uiTokens ?? {})
        },
        tacticalStyle: {
            ...defaultTacticalStyle,
            ...(overrides?.tacticalStyle ?? {})
        }
    };
}

/**
 * 校验主题包是否满足最小约束，返回错误列表。
 */
export function validateThemePackTemplate(themePack: ThemePackTemplate): string[] {
    const errors: string[] = [];
    for (const key of REQUIRED_UI_TOKEN_KEYS) {
        if (!themePack.uiTokens[key]) {
            errors.push(`Missing ui token: ${key}`);
        }
    }
    if (themePack.tacticalStyle.elevationMax <= themePack.tacticalStyle.elevationMin) {
        errors.push('Invalid tacticalStyle: elevationMax must be greater than elevationMin');
    }
    if (themePack.tacticalStyle.lodNear >= themePack.tacticalStyle.lodMid) {
        errors.push('Invalid tacticalStyle: lodNear must be less than lodMid');
    }
    if (themePack.tacticalStyle.lodMid >= themePack.tacticalStyle.lodFar) {
        errors.push('Invalid tacticalStyle: lodMid must be less than lodFar');
    }
    return errors;
}
