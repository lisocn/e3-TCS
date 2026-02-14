import './themes/index.css';
import * as Cesium from 'cesium';
import { TacticalViewer, type LodSwitchStats, type RenderPerfStats } from './core/TacticalViewer';
import { AppConfig, type ThemePackName, type LanguageCode } from './config';
import type { HudMode } from './ui/HudManager';
import { UiThemeManager } from './themes/UiThemeManager';
import { i18n } from './i18n';

declare global {
    interface Window {
        viewer: Cesium.Viewer;
        Cesium?: typeof Cesium;
        runDiagnostics?: () => Promise<void>;
        getLodRuntimeStats?: () => LodSwitchStats;
        getLodState?: () => { profile: string; metersPerPixel: number };
        getTerrainRuntimeMode?: () => string;
        getRenderPerfStats?: () => RenderPerfStats;
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
    let currentLodProfile = 'tactical';
    let currentMpp = 0;
    let currentSwitchCount = 0;
    let currentAvgSwitchCost = 0;
    let currentRuntimeMode = 'INIT';

    const updateTerrainStatusText = (): void => {
        if (!terrainStatusText) return;
        const lodText =
            ` | ${i18n.t('app.lod')}: ${currentLodProfile.toUpperCase()}` +
            ` | ${i18n.t('app.mpp')}: ${currentMpp.toFixed(2)}` +
            ` | ${i18n.t('app.mode')}: ${currentRuntimeMode}` +
            ` | ${i18n.t('app.switches')}: ${currentSwitchCount}` +
            ` | ${i18n.t('app.switchCost')}: ${currentAvgSwitchCost.toFixed(2)}ms`;
        if (currentTerrainStatus === 'connected') {
            terrainStatusText.innerText = `${i18n.t('app.terrainConnected')}${lodText}`;
            terrainStatusText.style.color = 'var(--color-accent)';
            return;
        }
        if (currentTerrainStatus === 'disabled') {
            terrainStatusText.innerText = `${i18n.t('app.terrainDisabled')}${lodText}`;
            terrainStatusText.style.color = 'var(--color-warning)';
            return;
        }
        terrainStatusText.innerText = `${i18n.t('app.terrainFailed')} (${currentTerrainDetail || 'unknown'})${lodText}`;
        terrainStatusText.style.color = 'var(--color-danger)';
    };

    try {
        console.log("Dev: Initializing TacticalViewer...");
        const viewerRef: { current?: TacticalViewer } = {};
        let wasmOomHandled = false;
        const viewerInstance = new TacticalViewer('app', {
            theme: 'tactical',
            baseLayer: false,
            themePack: currentThemePack,
            onTerrainStatusChange: (terrainStatus, detail) => {
                currentTerrainStatus = terrainStatus;
                currentTerrainDetail = detail ?? '';
                currentRuntimeMode = viewerRef.current?.getRuntimeRenderMode() ?? currentRuntimeMode;
                updateTerrainStatusText();
            },
            onLodProfileChange: (profile, metersPerPixel) => {
                currentLodProfile = profile;
                currentMpp = metersPerPixel;
                currentRuntimeMode = viewerRef.current?.getRuntimeRenderMode() ?? currentRuntimeMode;
                const stats = viewerRef.current?.getLodSwitchStats();
                if (!stats) return;
                currentSwitchCount = stats.switchCount;
                currentAvgSwitchCost = stats.averageSwitchDurationMs;
                updateTerrainStatusText();
            }
        });
        viewerRef.current = viewerInstance;

        await viewerInstance.ready();
        window.viewer = viewerInstance.viewer;
        window.Cesium = Cesium;
        const activateSafeMode = (): void => {
            try {
                viewerInstance.handleWasmOutOfMemory();
            } catch (error) {
                console.error('Dev: Failed to activate safe mode:', error);
            }
        };
        window.runDiagnostics = () => viewerInstance.runDiagnostics();
        window.getLodRuntimeStats = () => viewerInstance.getLodSwitchStats();
        window.getLodState = () => ({
            profile: viewerInstance.getCurrentLodProfile(),
            metersPerPixel: viewerInstance.getCurrentMetersPerPixel()
        });
        window.getTerrainRuntimeMode = () => viewerInstance.getRuntimeRenderMode();
        window.getRenderPerfStats = () => viewerInstance.getRenderPerfStats();
        currentLodProfile = viewerInstance.getCurrentLodProfile();
        currentMpp = viewerInstance.getCurrentMetersPerPixel();
        currentRuntimeMode = viewerInstance.getRuntimeRenderMode();
        {
            const stats = viewerInstance.getLodSwitchStats();
            currentSwitchCount = stats.switchCount;
            currentAvgSwitchCost = stats.averageSwitchDurationMs;
        }
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

        // 默认设为 Nevada 区域白天（UTC 20:00 ≈ 当地中午前后），提升地形明暗可读性。
        const noon = Cesium.JulianDate.fromDate(new Date('2025-06-01T20:00:00Z'));
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
                    if (!window.runDiagnostics) {
                        throw new Error('Diagnostics interface is not available.');
                    }
                    await window.runDiagnostics();
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

        window.addEventListener('error', (event) => {
            const msg = String(event.error?.message ?? event.message ?? '');
            if (msg.includes('WebAssembly.instantiate') && msg.includes('Out of memory')) {
                if (!wasmOomHandled) {
                    wasmOomHandled = true;
                    console.error('Dev: WASM OOM detected, switching to safe mode.');
                    activateSafeMode();
                }
                event.preventDefault();
            }
        });
        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            const msg = String(reason?.message ?? reason ?? '');
            if (msg.includes('WebAssembly.instantiate') && msg.includes('Out of memory')) {
                if (!wasmOomHandled) {
                    wasmOomHandled = true;
                    console.error('Dev: WASM OOM (promise rejection) detected, switching to safe mode.');
                    activateSafeMode();
                }
                event.preventDefault();
            }
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Initialization failed:", err);
        if (statusText) {
            statusText.innerText = i18n.t('app.initializationError', { message });
            statusText.style.color = 'var(--color-danger)';
        }
    }
});
