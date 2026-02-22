# e3-TCS

e3-TCS 是 E3 平台的战术可视化子项目，负责基于 Cesium 的场景编辑、推演与态势标绘相关 GIS 能力。

## 项目约束

### 1) 交流与注释
- 所有协作交流、文档、代码注释使用中文。
- 运行时日志、调试输出、错误信息保持英文（避免编码问题，便于日志工具处理）。
- 提交信息使用中文。

### 2) 离线化与本地化
- 禁止外部 CDN（JS/CSS/字体）。
- 资源（字体、图标、第三方静态文件）必须本地化。
- 地图底图/高程/样式走本地服务与本地数据，不调用在线地图 API。
- 前后端通信仅限 `127.0.0.1` 或指定内网地址。

### 3) 配置驱动
- 业务参数统一放在 `src/config.ts`，避免硬编码。
- 样式统一走 `src/themes/` 与 CSS 变量。
- UI 可见文本必须走国际化。

### 4) 质量门禁
- 严格类型检查（`strict`）。
- 提交前必须通过：
  - `npm run build`
  - `npm run lint`

## Tactical RedFlag 重构（当前唯一口径）

当前进入“重构阶段”，不再采用旧的参数盲调与旧门禁驱动流程。  
执行与验收以以下文档为准：
- 总体策略：`docs/terrain_rendering_strategy.md`
- 分阶段计划（含早否决）：`docs/redflag_rebuild_plan.md`

重构原则：
- 仅重构 `tactical + materialPreset=high`。
- `global/continental/regional` 不受影响。
- 先解决地形主渲染（山峰/峡谷/平坦区），网格后置叠加。
- 严格按 `Layer-0 -> Layer-5` 顺序执行，不允许跳层。

当前阶段验证命令：
```bash
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/capture_tactical_view.py
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/quantify_tactical_metrics.py --window-preset focus
```

### 分层验收快速入口
按层执行（不可跳层）：
```bash
# Layer-0
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level layer0

# Layer-1（基于上一层通过结果）
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level layer1 --baseline tests/artifacts/layer0_wide.png

# Layer-2
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level layer2 --baseline tests/artifacts/layer1_wide.png

# Layer-3
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level layer3 --baseline tests/artifacts/layer2_wide.png

# Layer-4
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level layer4 --baseline tests/artifacts/layer3_wide.png

# Final
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level final --baseline tests/artifacts/layer4_wide.png
```

每层产物（自动落盘到 `tests/artifacts/`）：
```bash
<level>_wide.png
<level>_mudpit.png
<level>_focus.png
<level>_wide_metrics.json
<level>_mudpit_metrics.json
<level>_focus_metrics.json
<level>_gate_report.json
```

快速查看最近一层结果：
```bash
ls -lt tests/artifacts/*_gate_report.json | head -n 3
```

俯仰角自检（先跑这个，再看人工截图）：
```bash
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/preflight_pitch_review.py
```
产物：
```bash
tests/artifacts/preflight_pitch_topdown.png
tests/artifacts/preflight_pitch_uptilt.png
tests/artifacts/preflight_pitch_report.json
```

阶段基线文件：
```bash
tests/artifacts/rebuild_stage_baseline_focus.json
```

## Capture 稳定性说明（2026-02-20）
- `tests/capture_tactical_view.py` 已修复两类高频问题：
  - `Execution context was destroyed`（Vite HMR 重载）已加自动重试。
  - `wide` 对齐后机位异常导致无法收敛 tactical，已改为“机位锁定 + 回退机位”。
- 当前判定“真实采集有效”的最小条件：
  - `ProviderProbe.providerType = CesiumTerrainProvider`
  - `LOD State.profile = tactical`
  - `EnsureTacticalMpp.satisfied = true`（在 gate 场景下）

## 相关文档
- 当前阶段计划与状态：`TODO.md`
- 当前有效交接信息：`HANDOVER.md`
