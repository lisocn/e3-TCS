import type { LanguageCode } from '../config';

export type I18nKey =
    | 'app.systemStatus'
    | 'app.online'
    | 'app.initializing'
    | 'app.hudMode'
    | 'app.hudDocked'
    | 'app.hudFollow'
    | 'app.terrainChecking'
    | 'app.runSelfDiagnosis'
    | 'app.running'
    | 'app.terrainConnected'
    | 'app.terrainDisabled'
    | 'app.terrainFailed'
    | 'app.systemReadySdk'
    | 'app.systemReadyPreset'
    | 'app.diagnosticsPassed'
    | 'app.diagnosticsFailed'
    | 'app.initializationError'
    | 'app.language'
    | 'app.themeStyle'
    | 'app.lod'
    | 'app.mode'
    | 'app.mpp'
    | 'app.switches'
    | 'app.switchCost'
    | 'app.themeCommandCenter'
    | 'app.themeBattlefieldSand'
    | 'app.hideTopHud'
    | 'app.showTopHud'
    | 'app.hideBottomHud'
    | 'app.showBottomHud'
    | 'app.alignRedFlagView'
    | 'app.redFlagAligned'
    | 'hud.title'
    | 'hud.lon'
    | 'hud.lat'
    | 'hud.alt'
    | 'hud.terrain'
    | 'hud.ssp'
    | 'hud.thermocline'
    | 'hud.cz'
    | 'hud.zoom'
    | 'hud.scale'
    | 'hud.mpp'
    | 'hud.yes'
    | 'hud.no'
    | 'hud.terrainLand'
    | 'hud.terrainOcean';

type ResourceTable = Record<I18nKey, string>;

export const resources: Record<LanguageCode, ResourceTable> = {
    'zh-CN': {
        'app.systemStatus': '系统状态',
        'app.online': '在线',
        'app.initializing': '初始化中...',
        'app.hudMode': 'HUD 模式',
        'app.hudDocked': '停靠',
        'app.hudFollow': '跟随',
        'app.terrainChecking': '地形: 检查中...',
        'app.runSelfDiagnosis': '运行自检',
        'app.running': '运行中...',
        'app.terrainConnected': '地形: 已连接',
        'app.terrainDisabled': '地形: 已禁用',
        'app.terrainFailed': '地形: 失败',
        'app.systemReadySdk': '系统就绪 - SDK 已加载',
        'app.systemReadyPreset': '系统就绪 - 主题包 {{preset}}',
        'app.diagnosticsPassed': '诊断通过',
        'app.diagnosticsFailed': '诊断失败',
        'app.initializationError': '初始化错误: {{message}}',
        'app.language': '语言',
        'app.themeStyle': '主题风格',
        'app.lod': '档位',
        'app.mode': '模式',
        'app.mpp': '米每像素',
        'app.switches': '切档次数',
        'app.switchCost': '切档均耗时',
        'app.themeCommandCenter': '指挥中心',
        'app.themeBattlefieldSand': '沙漠战场',
        'app.hideTopHud': '隐藏面板',
        'app.showTopHud': '显示面板',
        'app.hideBottomHud': '隐藏左下 HUD',
        'app.showBottomHud': '显示左下 HUD',
        'app.alignRedFlagView': '对齐 RedFlag 视角',
        'app.redFlagAligned': '已对齐 RedFlag 参考视角',
        'hud.title': '[战术 HUD]',
        'hud.lon': '经度',
        'hud.lat': '纬度',
        'hud.alt': '高程',
        'hud.terrain': '地形',
        'hud.ssp': '声速',
        'hud.thermocline': '温跃层',
        'hud.cz': '汇集区',
        'hud.zoom': '缩放等级',
        'hud.scale': '比例尺',
        'hud.mpp': '米每像素',
        'hud.yes': '是',
        'hud.no': '否',
        'hud.terrainLand': '陆地',
        'hud.terrainOcean': '海洋'
    },
    'en-US': {
        'app.systemStatus': 'System Status',
        'app.online': 'Online',
        'app.initializing': 'Initializing...',
        'app.hudMode': 'HUD Mode',
        'app.hudDocked': 'Docked',
        'app.hudFollow': 'Follow',
        'app.terrainChecking': 'Terrain: Checking...',
        'app.runSelfDiagnosis': 'Run Self-Diagnosis',
        'app.running': 'Running...',
        'app.terrainConnected': 'Terrain: Connected',
        'app.terrainDisabled': 'Terrain: Disabled',
        'app.terrainFailed': 'Terrain: Failed',
        'app.systemReadySdk': 'System Ready - SDK Loaded',
        'app.systemReadyPreset': 'System Ready - Theme Pack {{preset}}',
        'app.diagnosticsPassed': 'Diagnostics Passed',
        'app.diagnosticsFailed': 'Diagnostics Failed',
        'app.initializationError': 'Initialization Error: {{message}}',
        'app.language': 'Language',
        'app.themeStyle': 'Theme Style',
        'app.lod': 'LOD',
        'app.mode': 'Mode',
        'app.mpp': 'Meters Per Pixel',
        'app.switches': 'Switches',
        'app.switchCost': 'Avg Switch Cost',
        'app.themeCommandCenter': 'Command Center',
        'app.themeBattlefieldSand': 'Battlefield Sand',
        'app.hideTopHud': 'Hide Panel',
        'app.showTopHud': 'Show Panel',
        'app.hideBottomHud': 'Hide Bottom HUD',
        'app.showBottomHud': 'Show Bottom HUD',
        'app.alignRedFlagView': 'Align RedFlag View',
        'app.redFlagAligned': 'RedFlag reference view aligned',
        'hud.title': '[TACTICAL HUD]',
        'hud.lon': 'LON',
        'hud.lat': 'LAT',
        'hud.alt': 'ALT',
        'hud.terrain': 'TERRAIN',
        'hud.ssp': 'SSP',
        'hud.thermocline': 'THERMOCLINE',
        'hud.cz': 'CZ',
        'hud.zoom': 'ZOOM',
        'hud.scale': 'SCALE',
        'hud.mpp': 'MPP',
        'hud.yes': 'YES',
        'hud.no': 'NO',
        'hud.terrainLand': 'LAND',
        'hud.terrainOcean': 'OCEAN'
    }
};
