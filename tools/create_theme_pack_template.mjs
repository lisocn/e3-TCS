/* global process */
const packName = process.argv[2] || 'newThemePack';
const template = {
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
};

const text = `${packName}: ${JSON.stringify(template, null, 2)}`;
console.log(text);
