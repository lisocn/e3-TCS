/**
 * Runtime Configuration - Adaptive Profile
 */
const e3DefaultConfig = {
    terrainUrl: 'http://localhost:4444/terrain/',
    baseMapUrl: '',
    themePack: 'battlefieldSand'
};

window.E3_CONFIG = Object.assign({}, e3DefaultConfig, window.E3_CONFIG || {});
