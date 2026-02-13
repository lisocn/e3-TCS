import { AppConfig, type ThemePackName } from '../config';

/**
 * UI 主题管理器：统一下发 CSS 变量，禁止组件内硬编码主题色。
 */
export class UiThemeManager {
    private currentTheme: ThemePackName = AppConfig.ui.themePack;

    public apply(theme: ThemePackName): void {
        const root = document.documentElement;
        const tokens = AppConfig.ui.themePacks[theme]?.uiTokens;
        if (!tokens) return;
        for (const [name, value] of Object.entries(tokens)) {
            root.style.setProperty(name, value);
        }
        root.setAttribute('data-ui-theme-pack', theme);
        this.currentTheme = theme;
    }

    public getCurrentTheme(): ThemePackName {
        return this.currentTheme;
    }

    public getThemeNames(): ThemePackName[] {
        return Object.keys(AppConfig.ui.themePacks) as ThemePackName[];
    }
}
