/**
 * Runtime Configuration - Stable Profile
 * 用于上线默认配置：稳定可用优先。
 */
const e3DefaultConfig = {
    terrainUrl: 'http://localhost:4444/terrain/',
    baseMapUrl: '',

    // 稳定基线：锁 global + imagery。
    enableGlobalMaterialAttempt: false,
    terrainOperationMode: 'stableGlobalBaseline',
    adaptiveLodMaxProfile: 'tactical',

    // 可选：global | continental | regional | tactical
    // forceProfile: 'global',

    lodMaterialDebugMode: {}
};

window.E3_CONFIG = Object.assign({}, e3DefaultConfig, window.E3_CONFIG || {});
