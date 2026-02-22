# RedFlag 重构执行计划（分层搭建版）

更新时间：2026-02-21  
适用范围：仅 `tactical + materialPreset=high`

## 1. 执行原则（像盖房子）
- 按层搭建：`Layer-0` 到 `Layer-5`。
- 每层都有：
  - 单独开关
  - 单独截图
  - 单独和 `RedFlag_4k_style.jpg` 对照
  - 单独通过/否决
- 未通过当前层，禁止进入下一层。
- 强制前置：`Layer-N` 通过前，`Layer-0..Layer-(N-1)` 必须已通过（自动校验）。
- 强制重验：任一低层重跑通过后，高层状态自动失效，必须逐层重验。

## 2. 固定采集口径
1. 机位：`tests/capture_tactical_view.py`（Nevada focus）
2. 量化：`tests/quantify_tactical_metrics.py --window-preset focus`
3. 参考：`RedFlag_4k_style.jpg`（地形主参考）
4. 基线：`tests/artifacts/rebuild_stage_baseline_focus.json`

### 分层执行命令（统一）
- Layer-0：`tests/stage_gate_runner.py --level layer0`
- Layer-1：`tests/stage_gate_runner.py --level layer1 --baseline <layer0_capture.png>`
- Layer-2：`tests/stage_gate_runner.py --level layer2 --baseline <layer1_capture.png>`
- Layer-3：`tests/stage_gate_runner.py --level layer3 --baseline <layer2_capture.png>`
- Layer-4：`tests/stage_gate_runner.py --level layer4 --baseline <layer3_capture.png>`
- Final：`tests/stage_gate_runner.py --level final --baseline <layer4_capture.png>`

说明：
- `baseline` 必须使用上一层“已通过截图”，用于“不可退化”检测。
- 任一层未通过，禁止进入下一层。
- 默认状态文件：`tests/artifacts/layer_gate_state.json`
- 每层产物自动输出到 `tests/artifacts/`：
  - `<level>_wide.png` / `<level>_mudpit.png` / `<level>_focus.png`（按层机位策略）
  - `<level>_wide_metrics.json` / `<level>_mudpit_metrics.json` / `<level>_focus_metrics.json`
  - `<level>_gate_report.json`

## 3. 分层计划

### Layer-0：地表底板（Surface Base）
目标：
- 平坦区干净稳定，无水波纹，无脏纹。

实现范围：
- 仅 `FlatStabilizer + BaseRelief(低频)`。
- 禁止山脊强化、禁止网格、禁止细节线。

通过门禁：
- 主观：平坦区无明显波纹。
- 指标（全部必须满足）：
  - `wide.flat_roi_highpass_std <= 0.070`
  - `mudpit.flat_roi_highpass_std <= 0.068`
  - `wide.plain_highpass_std <= 0.110`
  - `mudpit.plain_highpass_std <= 0.100`
  - `wide.near_white_ratio <= 0.0010`
  - `mudpit.near_white_ratio <= 0.0010`

否决条件：
- 连续 2 轮 `plain_highpass_std` 上升。
- 主观出现“地表抖纹回潮”。

---

### Layer-1：山体大形体（Macro Relief）
目标：
- 山体“高起来”、峡谷“下去”，但不脏。

实现范围：
- 仅增强低频体积场（峰谷大关系）。
- 不加峰脊细线，不加背光特效。

通过门禁：
- `contrast_span_p10_p90 >= Layer-0 * 1.15`
- `distance_score_current_to_ref` 下降 `>= 0.01`
- 绝对锚点（必须同时满足）：
  - `ridge_edge_mean >= 0.28`
  - `plain_edge_mean >= 0.26`
  - `contrast_span_p10_p90 >= 0.34`
  - `global_luma_mean in [0.33, 0.52]`
  - `near_white_ratio <= 0.0010`
  - `flat_roi_highpass_std <= 0.060`
  - `valley_roi_edge_mean >= 0.20`

自动化执行口径：
- `tests/stage_gate_runner.py --level layer1`

层间隔离门禁（必须）：
- `wide.flat_roi_highpass_std <= Layer-0 * 1.05`
- `mudpit.flat_roi_highpass_std <= Layer-0 * 1.05`

否决条件：
- 对比提高但平坦区再现波纹。
- 连续 2 轮 `distance_score_current_to_ref` 不降。

---

### Layer-2：山脊/峡谷特征（Crest & Valley）
目标：
- 山脊更锋利、峡谷线更清晰。

实现范围：
- 仅 `CrestValley` 通道（梯度/曲率类特征）。
- 不改平坦区稳定器。

通过门禁：
- `wide.ridge_edge_mean >= 0.34`
- `wide.plain_edge_mean >= 0.30`
- `wide.ridge_roi_edge_mean >= 0.42`
- `mudpit.valley_roi_edge_mean >= 0.24`
- 隔离门禁：
  - `wide.flat_roi_highpass_std <= Layer-1 * 1.05`
  - `mudpit.flat_roi_highpass_std <= Layer-1 * 1.05`
  - `wide.global_luma_mean >= 0.33`
  - `wide.near_white_ratio <= 0.0010`

否决条件：
- 连续 2 轮边缘指标不升。
- 结构增强带来明显“脏纹”。

---

### Layer-3：远近层次（Near/Mid/Far）
目标：
- 近景清晰、远景简洁，空间层次明确。

实现范围：
- 引入 near/mid/far 权重（仅权重，不加新噪声）。

通过门禁：
- 主观：远近层次明显，不一锅粥。
- 指标（全部必须满足）：
  - `distance_score_current_to_ref <= Layer-2 - 0.008`（无 baseline 时 `<= 0.60`）
  - `wide.global_luma_mean in [0.33, 0.48]`
  - `wide.contrast_span_p10_p90 in [0.36, 0.50]`
  - `mudpit.plain_lowfreq_ratio in [0.48, 0.70]`
  - 隔离门禁：
    - `wide.flat_roi_highpass_std <= Layer-2 * 1.05`
    - `mudpit.flat_roi_highpass_std <= Layer-2 * 1.05`

否决条件：
- 层次增强导致整体发灰或压抑。
- 远景层次有了但近景山体被削弱。

---

### Layer-4：光照分离（Front/Back/Rim）
目标：
- 山尖正光、背光压暗、逆光轮廓清晰分离。

实现范围：
- 仅 `LightingDesign` 通道（front/back/rim）。

通过门禁：
- 主观：山尖与背光面分离明显。
- 指标：
  - `front_back_luma_delta >= Layer-3 * 1.10`（无 baseline 时 `>= 0.28`）
  - `rim_intensity_ratio in [1.10, 1.45]`
  - `abs(shadow_luma_mean - ref.shadow_luma_mean) <= 0.04`
  - `wide.global_luma_mean in [0.34, 0.50]`
  - `wide.near_white_ratio <= 0.0008`
  - 隔离门禁：
    - `wide.flat_roi_highpass_std <= Layer-3 * 1.05`
    - `mudpit.flat_roi_highpass_std <= Layer-3 * 1.05`

否决条件：
- 画面整体压黑或发闷。
- 轮廓增强引发平坦区噪声。

---

### Layer-5：后叠加层（Overlay）
目标：
- 网格/HUD 后叠加，不污染地形主渲染。

实现范围：
- 单独 pass 叠加（当前阶段可先保持关闭）。

通过门禁：
- 主观：覆盖层可见且不干扰山体。
- 指标：地形主指标不显著退化（`distance_score` 退化 < 2%）。

否决条件：
- 一开启覆盖层就破坏地形清晰度。

## 4. 每层交付物（必须）
1. 本层开关状态（开/关）
2. 本层截图（与 RedFlag 对照）
3. 本层指标对照
4. 通过/否决结论

## 5. 早否决总规则
- 任一层连续 2 轮无有效改善，立即冻结该层实现并回退到上一稳定层。
- 同一层累计 4 轮未通过，判定当前技术路径 No-Go，切换多 pass 方案。
