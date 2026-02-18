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

## Tactical 视觉恢复（当前有效口径）

### 验收前提（MPP-first）
- 仅 `tactical` 档位。
- `mpp in [175,195]`。
- 固定机位：`CAPTURE_ALIGN_REDFLAG=wide`。

### 分步门禁
- Step 1：相对 baseline (`tests/artifacts/capture_tactical_baseline_step0.png`)。
- Step 2+：改为对 `RedFlag.jpg` 的绝对接近度门禁（不再用 baseline 作为放行标准）。
- 累积验收：评估 Step N 时，必须同时通过 Step 1..N 全部门禁项。

## 自动化脚本

### 1) 截图（自动收敛到 tactical + mpp 区间）
- `tests/capture_tactical_view.py`
- 关键环境变量：
  - `CAPTURE_ALIGN_REDFLAG=wide`
  - `CAPTURE_ENSURE_TACTICAL_MPP=true`
  - `CAPTURE_TACTICAL_MPP_MIN=175`
  - `CAPTURE_TACTICAL_MPP_MAX=195`

### 2) 量化
- `tests/quantify_tactical_metrics.py`
- 输出：
  - baseline 对比指标（Step 1 使用）
  - `RedFlag.jpg` 对照指标（含 `delta_e_mean`、`hue_dist_mean`）

### 3) 阶段门禁（含自动推进）
- `tests/stage_gate_runner.py`
- 不推进，仅判定：
```bash
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --step 2
```
- 判定通过后自动推进 TODO：
```bash
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --auto-advance
```

## 相关文档
- 当前阶段计划与状态：`TODO.md`
- 当前有效交接信息：`HANDOVER.md`

## 当前困难与策略切换（2026-02-18）
- 本轮已终止继续在现有参数链路上微调 Step3。
- 主要困难：
  - Step2 与 Step3 指标存在耦合冲突：提高 plain 局部结构时，`redflag_plain_edge_rel_le_0_78` 与 `redflag_global_edge_rel_le_0_32` 容易回退。
  - 仅靠配色/增益微调，难以同时改善 `plain_luma_mean_rel`、`plain_sat_std_rel`、`plain_brown_ratio_rel`、`plain_lowfreq_ratio_rel`。
  - 视角相关反光抑制（含禁光照方向）会破坏前序守护，不适合作为直接路径。
- 建议改用“结构化新策略”而非继续小步调参：
  - 将 plain 区域做独立分支（低坡面材质逻辑与 ridge/slope 解耦）。
  - 引入分段式/限幅式光照响应（而非全局乘性增益）。
  - 把 Step3 目标拆成子阶段，先解决 brown/lowfreq，再恢复 edge。
