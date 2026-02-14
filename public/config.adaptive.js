/**
 * Runtime Configuration - Adaptive Profile
 * 用于预发/灰度配置：逐级恢复 LOD 能力。
 */
const e3DefaultConfig = {
    terrainUrl: 'http://localhost:4444/terrain/',
    baseMapUrl: '',

    // 实验路径：允许 global 材质 + adaptiveLod。
    enableGlobalMaterialAttempt: true,
    terrainOperationMode: 'adaptiveLod',
    adaptiveLodMaxProfile: 'tactical',
    themePack: 'battlefieldSand',

    // 可按阶段收敛：
    // adaptiveLodMaxProfile: 'continental'
    // adaptiveLodMaxProfile: 'regional'

    lodMaterialDebugMode: {}
};

window.E3_CONFIG = Object.assign({}, e3DefaultConfig, window.E3_CONFIG || {});
