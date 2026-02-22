# e3-TCS Tactical 重构策略（RedFlag 4K 对齐版）

更新时间：2026-02-21

## 1. 目标与边界
- 主参考图：`RedFlag_4k_style.jpg`（地形渲染主目标）。
- 风格参考图：`RedFlag.jpg`（后续 HUD/战术叠加层参考）。
- 目标：在真实高程数据上实现 `RedFlag_4k_style.jpg` 的山峰/峡谷与平地观感。
- 关键视觉：清晰、干净、峰脊锋利、峡谷分明、平坦区无“水波纹”。
- 非目标：写实纹理细节、PBR 真实感。
- 生效边界：仅 `tactical + materialPreset=high`，不影响 `global/continental/regional`。

## 2. 为什么重构（不再参数微调）
- 旧链路问题：单一 `slopeBand` 同时驱动底色/高光/阴影，参数强耦合，改一处动全局。
- 结果：频繁出现“按下葫芦起了瓢”，无法稳定收敛到 RedFlag。
- 结论：改为“通道解耦 + 分层组合”的新管线。

## 3. 新管线设计（分层搭建）
1. `Layer-0 SurfaceBase`：地表底板（平坦区稳定、无波纹）。
2. `Layer-1 MacroRelief`：山体大形体（先有“高低关系”）。
3. `Layer-2 CrestValley`：山脊/峡谷特征（锋利感来源）。
4. `Layer-3 NearMidFar`：远近层次（空间感来源）。
5. `Layer-4 LightingDesign`：正光/背光/逆光分离。
6. `Layer-5 Overlay`：网格/等高线后叠加（当前关闭，后续独立加回）。

## 4. 分层目标映射（对照 RedFlag_4k_style.jpg）
- Layer-0（地表底板）：
  - 视觉目标：大平地连续、干净、无镜面反光、无“水波纹”。
  - 允许变化：整体暖棕色调轻微浮动。
  - 禁止现象：pitch/区域切换后出现条带、网格、亮斑反光。
- Layer-1（大形体）：
  - 视觉目标：山体“立起来”，平地不被拖脏。
  - 允许变化：山体明暗对比增强。
  - 禁止现象：只变暗不变“立”、平地纹理回潮。
- Layer-2（脊谷特征）：
  - 视觉目标：山脊边线清晰，峡谷边界明确。
  - 允许变化：局部边缘增强。
  - 禁止现象：边缘锯齿化、伪网格线增强。
- Layer-3（远近层次）：
  - 视觉目标：近景信息密度高，远景更简洁，空间分层明显。
  - 允许变化：远景轻雾化、平地低频化。
  - 禁止现象：画面发闷发灰、整体压暗、平地“糊脏”。
- Layer-4（光照分离）：
  - 视觉目标：正光峰面、背光阴影、轮廓光三者分离清晰。
  - 允许变化：峰顶高光增强，但不白膜化。
  - 禁止现象：白膜覆盖山体、背光死黑导致层次丢失。

## 5. 当前执行原则
- 按层推进，未通过当前层不得进入下一层。
- 每次只改一个子通道，不跨层混改。
- 每层都必须能“单独和 RedFlag 对照”。
- 每层都有通过/否决门禁，连续两轮无改善即止损。
- `Layer-N` 通过前，`Layer-0..Layer-(N-1)` 必须已通过（由 `stage_gate_runner` 状态机强制）。
- 任一低层重跑后，高层状态自动失效，必须重验，防止层间联动破坏质量。

## 6. 验证口径
- 脚本：`tests/capture_tactical_view.py` + `tests/quantify_tactical_metrics.py --window-preset focus`
- 分层门禁：
  - Layer 机位策略：`layer0~final` 统一使用 `wide + mudpit + focus`（多视角兜底，避免“固定机位通过、换角度失败”）。
  - Layer-0：`tests/stage_gate_runner.py --level layer0`
  - Layer-1：`tests/stage_gate_runner.py --level layer1`
  - Layer-2：`tests/stage_gate_runner.py --level layer2 --baseline <layer1_capture.png>`
  - Layer-3：`tests/stage_gate_runner.py --level layer3 --baseline <layer2_capture.png>`
  - Layer-4：`tests/stage_gate_runner.py --level layer4 --baseline <layer3_capture.png>`
  - Final：`tests/stage_gate_runner.py --level final`
- 主观验收优先项：
  - 平坦区无水波纹。
  - 山尖有锋利感，背光与逆光分离清晰。
  - 峡谷线条明确，不糊不脏。
- 客观追踪项（focus）：
  - `distance_score_current_to_ref`（越低越好）
  - `ridge_edge_mean`（越高越好）
  - `plain_edge_mean`（越高越好）
  - `contrast_span_p10_p90`（越高越好）
  - `plain_highpass_std`（保持可控，避免水波纹回潮）
  - `flat_roi_highpass_std`（平坦区局部波纹抑制）
  - `ridge_roi_edge_mean` / `valley_roi_edge_mean`（山脊/峡谷局部特征）
  - `front_back_luma_delta` / `rim_intensity_ratio`（正背光分离与轮廓光）

### Layer 对应硬门禁（当前实现）
- Layer-0：
  - `flat_roi_highpass_std`、`plain_highpass_std`、`plain_luma_span_p10_p90`、`near_white_ratio` 必须通过
  - 且 `focus` 机位必须通过（防切角失真）
- Layer-1：
  - `ridge_edge_mean`、`plain_edge_mean`、`contrast_span_p10_p90`、`global_luma_mean` 通过
  - 且自动复核 Layer-0 全部门禁（链式强约束）
- Layer-2：
  - `ridge_roi_edge_mean`、`valley_roi_edge_mean`、`plain_edge_mean` 通过
  - 且自动复核 Layer-0/1 全部门禁
- Layer-3：
  - `distance_score` 改善、`contrast_span`、`plain_lowfreq_ratio` 通过
  - 且自动复核 Layer-0/1/2 全部门禁
- Layer-4：
  - `front_back_luma_delta`、`rim_intensity_ratio`、`shadow_luma_mean` 通过
  - 且自动复核 Layer-0/1/2/3 全部门禁

## 7. 当前状态
- 网格已关闭（专注地形主渲染）。
- 已进入“分层搭建阶段”，不再走旧的参数盲调路线。
- 详细执行步骤见：`docs/redflag_rebuild_plan.md`
