import { AppConfig, type LanguageCode } from '../config';
import { resources, type I18nKey } from './resources';
import i18next, { type i18n as I18nInstance } from 'i18next';

type Listener = (language: LanguageCode) => void;

/**
 * i18next 国际化管理器。
 * 对外暴露稳定接口，便于业务层调用与后续扩展语言包。
 */
class I18nManager {
    private instance: I18nInstance = i18next.createInstance();
    private listeners: Set<Listener> = new Set();
    private initialized = false;

    public async init(language?: LanguageCode): Promise<void> {
        const lng = language ?? AppConfig.i18n.defaultLanguage;
        const i18nextResources = Object.fromEntries(
            Object.entries(resources).map(([lang, table]) => [lang, { translation: table }])
        );
        if (!this.initialized) {
            await this.instance.init({
                resources: i18nextResources,
                lng,
                fallbackLng: AppConfig.i18n.defaultLanguage,
                interpolation: {
                    escapeValue: false
                }
            });
            this.instance.on('languageChanged', (changedLng) => {
                const normalized = changedLng as LanguageCode;
                document.documentElement.lang = normalized;
                this.listeners.forEach((listener) => listener(normalized));
            });
            this.initialized = true;
        } else if (this.instance.language !== lng) {
            await this.instance.changeLanguage(lng);
        }
        document.documentElement.lang = this.instance.language as LanguageCode;
    }

    public getLanguage(): LanguageCode {
        return (this.instance.language as LanguageCode) || AppConfig.i18n.defaultLanguage;
    }

    public getSupportedLanguages(): readonly LanguageCode[] {
        return AppConfig.i18n.supportedLanguages;
    }

    public setLanguage(language: LanguageCode): void {
        if (!AppConfig.i18n.supportedLanguages.includes(language)) {
            return;
        }
        void this.instance.changeLanguage(language);
    }

    public onChange(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public t(key: I18nKey, params: Record<string, string | number> = {}): string {
        return this.instance.t(key, params);
    }
}

export const i18n = new I18nManager();
export type { I18nKey };
