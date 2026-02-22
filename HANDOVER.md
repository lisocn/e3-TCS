# HANDOVER

## 当前阶段（2026-02-21）
- 分支：`feat-tactical-redflag-mode`
- 状态：已进入 Tactical 重构阶段（解耦管线），不再走旧参数盲调路线。
- 目标：按 `Layer-0 -> Layer-5` 分层搭建并逐层与 `RedFlag_4k_style.jpg` 对照验收（地形主参考）。
- 当前优先：`Layer-0` 平坦区稳定化 + `Layer-1/2` 山峰峡谷收敛。
- 边界：仅 `tactical + materialPreset=high` 生效，不影响其他档位。

## 临时回退记录（2026-02-22）
- 用户决策：停止 `Ctrl+鼠标` 交互链路改造，避免继续消耗时间。
- 已回退文件：`src/core/TacticalViewer.ts`
- 已删除内容：
  - `Ctrl+左拖` 自定义兜底旋转监听（`setupCtrlLeftDragRotateGuard`）
  - `Ctrl` 相关状态字段与清理逻辑
  - `CameraEventType / KeyboardEventModifier` 相关引用
  - Tactical 中对 `tiltEventTypes/rotateEventTypes` 的 `Ctrl` 手势注入
- 当前交互状态：
  - Tactical 保持 `enableTilt=false`、`enableRotate=true`
  - 不再承诺 `Ctrl+左拖` 可旋转（待后续独立方案）

## 当前唯一执行口径
- 总策略：`docs/terrain_rendering_strategy.md`
- 执行计划：`docs/redflag_rebuild_plan.md`
- 当前阶段以分层 `stage_gate_runner` 门禁作为自动化通过标准：
  - `layer0 -> layer1 -> layer2 -> layer3 -> layer4 -> final`
  - 必须满足前序层已通过
  - 低层变更会自动使高层失效重验

## 当前实现要点
- 主材质：`src/themes/tacticalMaterial.ts`
  - 按层拆分：`Layer-0 SurfaceBase / Layer-1 MacroRelief / Layer-2 CrestValley / Layer-3 NearMidFar / Layer-4 LightingDesign / Layer-5 Overlay`
  - 网格关闭（后续独立叠加）：
    - `enableMacroGrid=false`
    - `enableMicroGrid=false`
    - `redFlagGridMix=0`
    - `redFlagGridEmissive=0`
- 参数入口：`src/config.ts`（tacticalStyleOverrides）

## 验证方式（每轮必跑）
1. `/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/capture_tactical_view.py`
2. `/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/quantify_tactical_metrics.py --window-preset focus`
3. 对照基线：`tests/artifacts/rebuild_stage_baseline_focus.json`

## 早否决原则（强制）
- 连续两轮关键指标无改善，立即停止当前子通道改造并切换路线。
- 绝不允许“连续两天后才否决”的推进方式。
- 具体阈值与止损动作见：`docs/redflag_rebuild_plan.md`

