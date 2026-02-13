import type { LocationInfo } from '../data';
import { i18n } from '../i18n';

export type HudMode = 'follow' | 'docked';

export interface HudMetrics {
    zoomLevel: number;
    scaleDenominator: number;
    metersPerPixel: number;
}

/**
 * HUD 管理器：使用原生 DOM 在 Viewer 上层渲染战术信息。
 */
export class HudManager {
    private root: HTMLDivElement;
    private mode: HudMode;
    private container: HTMLElement;

    constructor(container: HTMLElement, mode: HudMode = 'docked') {
        this.container = container;
        this.mode = mode;
        this.root = document.createElement('div');
        this.root.style.position = 'absolute';
        this.root.style.zIndex = '120';
        this.root.style.pointerEvents = 'none';
        this.root.style.whiteSpace = 'pre-line';
        this.root.style.minWidth = '260px';
        this.root.style.maxWidth = '340px';
        this.root.style.padding = '10px 12px';
        this.root.style.border = '1px solid var(--color-hud-border)';
        this.root.style.background = 'var(--color-hud-bg)';
        this.root.style.color = 'var(--color-hud-text)';
        this.root.style.fontFamily = 'var(--font-mono)';
        this.root.style.fontSize = '11px';
        this.root.style.lineHeight = '1.45';
        this.root.style.boxShadow = '0 0 14px color-mix(in srgb, var(--color-hud-text) 15%, transparent)';
        this.root.style.backdropFilter = 'blur(3px)';
        this.root.style.borderRadius = '4px';
        this.root.textContent = 'HUD READY';
        this.container.appendChild(this.root);
        this.applyModeLayout();
    }

    public setMode(mode: HudMode): void {
        this.mode = mode;
        this.applyModeLayout();
    }

    public update(data: LocationInfo, metrics?: HudMetrics): void {
        const lines = [
            i18n.t('hud.title'),
            `${i18n.t('hud.lon')}: ${data.longitude.toFixed(5)}`,
            `${i18n.t('hud.lat')}: ${data.latitude.toFixed(5)}`,
            `${i18n.t('hud.alt')}: ${data.elevation.toFixed(1)} m`,
            `${i18n.t('hud.terrain')}: ${data.terrainType === 'land' ? i18n.t('hud.terrainLand') : i18n.t('hud.terrainOcean')}`,
            `${i18n.t('hud.ssp')}: ${data.sonar.soundSpeed.toFixed(2)} m/s`,
            `${i18n.t('hud.thermocline')}: ${data.sonar.hasThermocline ? i18n.t('hud.yes') : i18n.t('hud.no')}`,
            `${i18n.t('hud.cz')}: ${data.sonar.hasConvergenceZone ? i18n.t('hud.yes') : i18n.t('hud.no')}`
        ];
        if (metrics) {
            lines.push(
                `${i18n.t('hud.zoom')}: ${metrics.zoomLevel.toFixed(2)}`,
                `${i18n.t('hud.scale')}: 1:${Math.round(metrics.scaleDenominator).toLocaleString('en-US')}`,
                `${i18n.t('hud.mpp')}: ${metrics.metersPerPixel.toFixed(2)} m/px`
            );
        }
        this.root.textContent = lines.join('\n');
    }

    public setFollowPosition(x: number, y: number): void {
        if (this.mode !== 'follow') return;
        const offsetX = 16;
        const offsetY = 16;
        const maxLeft = this.container.clientWidth - this.root.offsetWidth - 8;
        const maxTop = this.container.clientHeight - this.root.offsetHeight - 8;
        const left = Math.max(8, Math.min(maxLeft, x + offsetX));
        const top = Math.max(8, Math.min(maxTop, y + offsetY));
        this.root.style.left = `${left}px`;
        this.root.style.top = `${top}px`;
    }

    public destroy(): void {
        if (this.root.parentElement === this.container) {
            this.container.removeChild(this.root);
        }
    }

    private applyModeLayout(): void {
        if (this.mode === 'docked') {
            this.root.style.left = '16px';
            this.root.style.bottom = '16px';
            this.root.style.top = '';
            return;
        }
        this.root.style.left = '16px';
        this.root.style.top = '16px';
        this.root.style.bottom = '';
    }
}
