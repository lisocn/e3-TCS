import './themes/index.css';
import * as Cesium from 'cesium';
import { TacticalViewer } from './core/TacticalViewer';
import { AppConfig, type ThemePackName, type LanguageCode } from './config';
import type { HudMode } from './ui/HudManager';
import { UiThemeManager } from './themes/UiThemeManager';
import { i18n } from './i18n';

declare global {
    interface Window {
        viewer: Cesium.Viewer;
    }
}

const uiThemeManager = new UiThemeManager();

window.onerror = function (msg, _url, _lineNo, _columnNo, error) {
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
        statusEl.innerText = `FATAL ERROR: ${msg}`;
        statusEl.style.color = 'var(--color-danger)';
    }
    console.error("Global Error Caught:", msg, error);
    return false;
};

document.addEventListener('DOMContentLoaded', async () => {
    const statusText = document.getElementById('status-text');
    const terrainStatusText = document.getElementById('terrain-status-text');
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement | null;
    const hudModeBtn = document.getElementById('hud-mode-btn') as HTMLButtonElement | null;
    const diagBtn = document.getElementById('run-diag-btn') as HTMLButtonElement | null;
    const diagLogs = document.getElementById('diag-logs');

    await i18n.init(AppConfig.i18n.defaultLanguage);
    uiThemeManager.apply(AppConfig.ui.themePack);

    const setStaticTexts = (hudMode: HudMode): void => {
        const setText = (id: string, text: string) => {
            const node = document.getElementById(id);
            if (node) node.textContent = text;
        };
        setText('label-system-status', i18n.t('app.systemStatus'));
        setText('label-online', i18n.t('app.online'));
        setText('label-language', i18n.t('app.language'));
        setText('label-theme-style', i18n.t('app.themeStyle'));
        if (hudModeBtn) {
            hudModeBtn.innerText = `${i18n.t('app.hudMode')}: ${hudMode === 'docked' ? i18n.t('app.hudDocked') : i18n.t('app.hudFollow')}`;
        }
        if (diagBtn) {
            diagBtn.innerText = i18n.t('app.runSelfDiagnosis');
        }
        if (themeSelect) {
            const labelByTheme: Record<ThemePackName, string> = {
                commandCenter: i18n.t('app.themeCommandCenter'),
                battlefieldSand: i18n.t('app.themeBattlefieldSand')
            };
            [...themeSelect.options].forEach((option) => {
                const key = option.value as ThemePackName;
                option.text = labelByTheme[key] ?? option.value;
            });
        }
    };

    let currentHudMode: HudMode = 'docked';
    let currentTerrainStatus: 'connected' | 'failed' | 'disabled' = 'disabled';
    let currentTerrainDetail = '';
    let currentThemePack: ThemePackName = AppConfig.ui.themePack;

    const updateTerrainStatusText = (): void => {
        if (!terrainStatusText) return;
        if (currentTerrainStatus === 'connected') {
            terrainStatusText.innerText = i18n.t('app.terrainConnected');
            terrainStatusText.style.color = 'var(--color-accent)';
            return;
        }
        if (currentTerrainStatus === 'disabled') {
            terrainStatusText.innerText = i18n.t('app.terrainDisabled');
            terrainStatusText.style.color = 'var(--color-warning)';
            return;
        }
        terrainStatusText.innerText = `${i18n.t('app.terrainFailed')} (${currentTerrainDetail || 'unknown'})`;
        terrainStatusText.style.color = 'var(--color-danger)';
    };

    try {
        console.log("Dev: Initializing TacticalViewer...");
        const viewerInstance = new TacticalViewer('app', {
            theme: 'tactical',
            baseLayer: false,
            themePack: currentThemePack,
            onTerrainStatusChange: (terrainStatus, detail) => {
                currentTerrainStatus = terrainStatus;
                currentTerrainDetail = detail ?? '';
                updateTerrainStatusText();
            }
        });

        await viewerInstance.ready();
        window.viewer = viewerInstance.viewer;
        const viewer = viewerInstance.viewer;

        viewerInstance.setHudMode(currentHudMode);

        if (themeSelect) {
            themeSelect.value = currentThemePack;
            themeSelect.onchange = () => {
                const selected = themeSelect.value as ThemePackName;
                currentThemePack = selected;
                uiThemeManager.apply(selected);
                viewerInstance.applyThemePack(selected);
                updateTerrainStatusText();
                setStaticTexts(currentHudMode);
                if (statusText) {
                    statusText.innerText = i18n.t('app.systemReadyPreset', { preset: selected.toUpperCase() });
                    statusText.style.color = 'var(--color-accent)';
                }
            };
        }

        if (languageSelect) {
            languageSelect.value = i18n.getLanguage();
            languageSelect.onchange = () => {
                const selected = languageSelect.value as LanguageCode;
                i18n.setLanguage(selected);
            };
        }

        if (hudModeBtn) {
            hudModeBtn.onclick = () => {
                currentHudMode = currentHudMode === 'docked' ? 'follow' : 'docked';
                viewerInstance.setHudMode(currentHudMode);
                setStaticTexts(currentHudMode);
            };
        }

        i18n.onChange(() => {
            setStaticTexts(currentHudMode);
            updateTerrainStatusText();
            if (statusText) {
                statusText.textContent = i18n.t('app.systemReadySdk');
                statusText.style.color = 'var(--color-accent)';
            }
        });

        const noon = Cesium.JulianDate.fromDate(new Date('2025-06-01T12:00:00Z'));
        viewer.clock.currentTime = noon;

        setStaticTexts(currentHudMode);
        updateTerrainStatusText();
        if (statusText) {
            statusText.textContent = i18n.t('app.systemReadySdk');
            statusText.style.color = 'var(--color-accent)';
        }

        if (diagBtn && diagLogs) {
            diagBtn.onclick = async () => {
                diagLogs.innerHTML = "";
                diagBtn.innerText = i18n.t('app.running');
                diagBtn.setAttribute('disabled', 'true');

                const originalLog = console.log;
                const originalError = console.error;
                console.log = (...args) => {
                    originalLog(...args);
                    const line = document.createElement('div');
                    line.innerText = args.join(' ');
                    diagLogs.appendChild(line);
                    diagLogs.scrollTop = diagLogs.scrollHeight;
                };
                console.error = (...args) => {
                    originalError(...args);
                    const line = document.createElement('div');
                    line.innerText = `ERR: ${args.join(' ')}`;
                    line.style.color = 'var(--color-danger)';
                    diagLogs.appendChild(line);
                    diagLogs.scrollTop = diagLogs.scrollHeight;
                };

                try {
                    if (!window.e3_diagnose) {
                        throw new Error('Diagnostics interface is not available.');
                    }
                    await window.e3_diagnose();
                    if (statusText) {
                        statusText.innerText = i18n.t('app.diagnosticsPassed');
                        statusText.style.color = 'var(--color-accent)';
                    }
                } catch {
                    if (statusText) {
                        statusText.innerText = i18n.t('app.diagnosticsFailed');
                        statusText.style.color = 'var(--color-danger)';
                    }
                } finally {
                    diagBtn.innerText = i18n.t('app.runSelfDiagnosis');
                    diagBtn.removeAttribute('disabled');
                    console.log = originalLog;
                    console.error = originalError;
                }
            };
        }

        console.log("Dev: TacticalViewer initialized successfully.");
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Initialization failed:", err);
        if (statusText) {
            statusText.innerText = i18n.t('app.initializationError', { message });
            statusText.style.color = 'var(--color-danger)';
        }
    }
});
