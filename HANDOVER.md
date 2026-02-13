# e3-TCS 开发接力手册（Agent/Human 通用）

## 1. 项目定位
- 本项目是 E3 平台的战术可视化子系统，基于 Cesium 提供地形渲染、战术风格表达、HUD 态势信息展示。
- 目标不是“炫技 UI”，而是：稳定、可扩展、可配置、可联调。

## 2. 仓库与依赖关系
- 前端仓库：`e3-TCS`（当前仓库）
- 地形服务仓库：`../e3-gis`
- 关键联调链路：`e3-TCS -> http://localhost:4444/terrain/ -> e3-gis -> MBTiles`

## 3. 当前核心模块职责
- `src/core/TacticalViewer.ts`
  - Viewer 生命周期、地形接入、HUD 事件、缩放限制、全局地形回退。
- `src/themes/ThemeManager.ts`
  - Cesium 场景主题（tactical/satellite）切换。
- `src/themes/UiThemeManager.ts`
  - UI 主题包 token 下发（CSS 变量），禁止组件硬编码主题色。
- `src/themes/themePacks.ts`
  - 主题包注册中心（统一维护 UI token 与 tacticalStyle）。
- `src/data/DataManager.ts`
  - 高程查询与点位信息聚合（sampleTerrain + fallback）。
- `src/ui/HudManager.ts`
  - 原生 DOM HUD，支持 follow/docked，接收实时 metrics。
- `src/i18n/*`
  - i18next 国际化资源与管理器。
- `src/dev.ts`
  - 调试页面逻辑、控件绑定（语言/主题包/HUD 模式/诊断）。

## 4. 硬性开发规范（必须遵守）
- 交流、代码注释：中文。
- 运行时日志与错误输出：英文。
- 所有 UI 可见文案必须走 i18n（`i18n.t(...)`），禁止写死中英文。
- 所有主题色、面板色、HUD 色、控件色必须走 CSS 变量和 `UiThemeManager`，禁止硬编码。
- 业务参数“有 1% 变更可能”也必须配置化（优先放 `src/config.ts`）。
- 修改 `src/**/*` 后必须执行：
  - `npm run lint`
  - `npm run build`

## 5. 国际化约定（i18next）
- 初始化：`await i18n.init(...)` 后再渲染依赖文案的 UI。
- 资源位置：`src/i18n/resources.ts`
- 新增语言步骤：
  1. 在 `AppConfig.i18n.supportedLanguages` 增加语言代码。
  2. 在 `resources` 增加对应语言完整词条。
  3. 在 UI 语言下拉中增加选项。

## 6. 主题系统约定
- 主题包配置源：`src/config.ts -> ui.themePacks`
- 主题包注册实现：`src/themes/themePacks.ts`
- 每个主题包必须同时包含：
  - `uiTokens`（UI 颜色/面板/控件/HUD 变量）
  - `tacticalStyle`（地形 shader 渲染参数）
- CSS 变量定义与通用类：`src/themes/variables.css`
- 运行时切换：`UiThemeManager.apply(themePack)` + `TacticalViewer.applyThemePack(themePack)`
- 主题包模板工具：
  - 代码模板：`src/themes/themePackTemplate.ts`
  - CLI 生成：`npm run theme:template -- <newThemePackName>`
- 禁止做法：
  - 在 TS/HTML 内直接写 `#00f0ff`、`rgba(...)` 作为业务主题色。

## 7. 地形联调基线与已知关键坑
- 基线服务地址：`http://localhost:4444/terrain/`
- 快速重启脚本：`./tools/restart_server.sh`
- 核心已修复坑（高风险回归点）：
  - `scheme=tms` 与服务端 Y 翻转重复，导致“青藏高原变海洋负高程”。
  - 修复位置：`../e3-gis/src/main.cpp` 使用 `TerrainTileSource(mbtilesPath, false)`。
- 回归验证命令：
  - `node tools/terrain_probe.mjs`
  - 预期：青藏高原/珠峰高程为正值，深海为负值。

## 8. HUD 与交互约定
- HUD 更新采用“双通道”：
  - 鼠标移动同步快速更新（流畅）
  - 防抖异步精确回填（准确）
- HUD 必须展示：
  - 经纬度、高程、地形类型、声学参数
  - 缩放等级、比例尺、m/px
- 默认限制最大拉远：地球充满窗口后不允许继续变小（基于 `screenSpaceCameraController.maximumZoomDistance`）。

## 9. 提交前检查清单（每次改动都做）
- 功能检查：
  - 语言切换可即时生效。
  - 主题切换全局一致生效。
  - HUD 跟随模式位置正确、数据连续刷新。
  - 高原点位不再显示为海洋负高程。
- 工程检查：
  - `npm run lint` 通过。
  - `npm run build` 通过。
  - 不引入新的硬编码文案和硬编码主题色。

## 10. 推荐开发模式（后续 Agent 按此执行）
1. 先定位：明确修改影响的模块边界（core/data/ui/themes/i18n）。
2. 再改配置：能放 `config.ts` 的参数先抽出，不直接写死。
3. 再改实现：小步提交，避免跨模块大爆改。
4. 强制自测：至少跑 lint/build + 关键路径人工验证。
5. 明确回执：给出改动文件、行为变化、未完成项和风险。
