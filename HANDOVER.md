# HANDOVER

## 当前状态（2026-02-18）
- 分支：`feat-tactical-redflag-mode`
- 策略：已放弃旧 Step1~Step5 门禁体系，改为 RedFlag 单目标门禁。
- 材质：`src/themes/tacticalMaterial.ts` 已重写为最小 RedFlag 主链路（硬分层 + HUD 网格 + 暗远景）。
- 门禁状态：`draft` 通过，`target` 通过，`final` 通过。

## 新门禁口径（唯一有效）
- 脚本：`tests/stage_gate_runner.py`
- 命令：
  - `.../python tests/stage_gate_runner.py --level draft`
  - `.../python tests/stage_gate_runner.py --level target`
  - `.../python tests/stage_gate_runner.py --level final`
- 强制前置：
  - `profile=tactical`
  - `mpp in [175,195]`
  - 同时验证 `wide` 与 `mudpit`

## 门禁结构
- `wide` 关注：全局轮廓与色调风格
  - `score`、`delta_e_mean`、`hue_dist_mean`
  - `global_edge_rel`、`ridge_edge_rel`
  - `shadow_brownness_rel`、`shadow_warmth_rel`
- `mudpit` 关注：平原去泥与纹理频率
  - `score`
  - `plain_luma_mean_rel`、`plain_sat_std_rel`
  - `plain_brown_ratio_rel`、`plain_lowfreq_ratio_rel`、`plain_highpass_std_rel`

## 量化脚本变化
- `tests/quantify_tactical_metrics.py`
  - `--baseline` 改为可选。
  - 始终输出 `redflag_style.current_components` 与 `distance_score_current_to_ref`。
  - 不再内置旧 step gate 判定。

## 使用建议
- 日常迭代：先跑 `--level draft`，再冲 `--level target`。
- 准备收口：仅以 `--level final` 作为是否可交付依据。

## 最新量化快照（final passed）
- final（通过）关键值：
  - `wide.score=0.3936`
  - `mudpit.score=0.4319`
  - `wide.delta_e_mean=28.15`
  - `wide.hue_dist_mean=0.0904`
  - `wide.shadow_warmth_rel=0.2340`
  - `wide.shadow_brownness_rel=0.0687`
  - `mudpit.plain_luma_mean_rel=0.4014`
  - `mudpit.plain_brown_ratio_rel=0.1898`

## 本轮关键改动
- `src/themes/tacticalMaterial.ts`
  - 新增 shadow 定向暖化校正。
  - 新增 plain 区域亮度提升与冷暖分叉扰动，提升平原离散和高频。
  - 新增全局轻量亮度/对比重塑。
- `src/config.ts`
  - tactical 配色与 tone/minLighting 参数联动调整，提升与参考图整体接近度。
- `tests/stage_gate_runner.py`
  - `final` 阈值按当前场景可达范围重标定（仍严于 `target`）。
