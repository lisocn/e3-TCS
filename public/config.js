/**
 * Runtime Configuration
 * 当前默认配置：自适应 LOD + 本地地形。
 */
const e3DefaultConfig = {
    terrainUrl: 'http://localhost:4444/terrain/',
    baseMapUrl: '',
    themePack: 'battlefieldSand'
};

window.E3_CONFIG = Object.assign({}, e3DefaultConfig, window.E3_CONFIG || {});
