# TODO（RedFlag 分层搭建看板）

## 总目标
- 按 `Layer-0 ~ Layer-5` 顺序搭建。
- `Layer-0 ~ Layer-4`每层都能直接与 `RedFlag_4k_style.jpg` 对照,其中`Layer-5` 对照 `RedFlag.jpg`。
- 每层都能独立通过/否决。

## Layer-0 地表底板（Surface Base）
- 状态：已完成（当前基线：`tests/artifacts/layer0_focus_metrics.json`）
- 目标：平坦区无波纹、无脏纹。
- 指标关注：`plain_highpass_std`
- 通过后再进 Layer-1。

## Layer-1 山体大形体（Macro Relief）
- 状态：进行中（当前结果：`tests/artifacts/layer1_focus_metrics.json`）
- 目标：山体“高起来”、峡谷“下去”。
- 指标关注：`contrast_span_p10_p90`、`distance_score_current_to_ref`

## Layer-2 山脊峡谷特征（Crest & Valley）
- 状态：待执行
- 目标：山脊锋利、峡谷线清晰。
- 指标关注：`ridge_edge_mean`、`plain_edge_mean`

## Layer-3 远近层次（Near/Mid/Far）
- 状态：待执行
- 目标：近景清晰、远景简洁，层次明显。

## Layer-4 光照分离（Front/Back/Rim）
- 状态：待执行
- 目标：山尖、背光、逆光分离明确。
- 指标关注：`shadow_luma_mean`、`distance_score_current_to_ref`

## Layer-5 覆盖层（Overlay）
- 状态：待执行
- 目标：网格后叠加，不污染地形主渲染。

## 执行纪律
- 每轮只改一层一个子通道。
- 每轮必须产出：截图 + focus 指标 + 通过/否决结论。
- 连续两轮无改善，立即止损并回退上一稳定层。
