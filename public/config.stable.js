/**
 * Runtime Configuration - Stable Profile
 * 与 adaptive 统一到单一路径，仅保留基础连接参数。
 */
const e3DefaultConfig = {
    terrainUrl: 'http://localhost:4444/terrain/',
    baseMapUrl: '',
    themePack: 'battlefieldSand'
};

window.E3_CONFIG = Object.assign({}, e3DefaultConfig, window.E3_CONFIG || {});
