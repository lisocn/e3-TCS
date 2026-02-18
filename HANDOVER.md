# HANDOVER

## 当前状态（2026-02-17）
- 范围：仅 `tactical` 渲染链路，未改其他档位策略。
- 阶段：Step 3 回退为 `in progress`（人工视觉复核判定“平原泥水感仍明显”）。
- 基线：
  - Step 1/2：沿用 `tests/artifacts/capture_tactical_baseline_step2.png` 体系。
  - Step 3（mudpit 口径）：`tests/artifacts/capture_tactical_baseline_step2_mudpit.png`（首次已自动生成）。

## 当前有效验收口径
- 固定前置条件：
  - Step 1/2 使用 `CAPTURE_ALIGN_REDFLAG=wide`
  - Step 3 使用 `CAPTURE_ALIGN_REDFLAG=mudpit`（针对平原泥坑区域）
  - `profile=tactical`
  - `mpp in [175,195]`
  - `ensure_tactical_mpp_satisfied=true`
- 累积门禁：
  - 评估 `Step N` 时必须同时通过 `Step 1..N`。
- baseline 规则：
  - Step 1 使用 `capture_tactical_baseline_step0.png`
  - Step 2+ 使用前一阶段通过图作为滚动 baseline

## Step 3 当前判定（人工复核后）
- 先前 auto-pass 已作废，不作为推进 Step 4 依据。
- 新门禁增加 RedFlag 平原观感约束（防止“指标过线但看起来仍像泥水”）：
  - `RedFlag plain_luma_mean_rel <= 0.12`
  - `RedFlag plain_sat_std_rel <= 0.45`
  - `RedFlag plain_brown_ratio_rel <= 0.20`
- 以当前图对比 RedFlag 的实测（平原窗口）：
  - `plain_luma_mean_rel = 0.1628`（未过）
  - `plain_sat_std_rel = 0.5594`（未过）
  - `plain_brown_ratio_rel = 0.2313`（未过）
- 结论：Step 3 未完成，继续优化。

## 本轮 tactical 参数改动
- 文件：`src/config.ts`
- 仅 `terrain.lodProfiles.tactical.tacticalStyleOverrides`：
  - `plainGrainGain: 1.30 -> 1.48 -> 1.80`
  - `edgeEnhanceGain: 1.44 -> 1.52`
  - `seamBandStrength: 0.04 -> 0.03 -> 0.01`
  - `seamMatteStrength: 0.01 -> 0.00`

## 工具链变更（本轮）
- `tests/quantify_tactical_metrics.py`
  - 新增 `plain_luma_std`、`plain_luma_mean`、`plain_sat_std`、`plain_brown_ratio` 及对应 RedFlag 相对差指标。
- `tests/stage_gate_runner.py`
  - Step 3 门禁改为“相对 baseline_step2 的平原颗粒增量 + RedFlag 平原观感约束 + Step2 护栏”。
  - 新增按 step 选择截图机位（Step3=mudpit）和 `capture_align_variant` 输出。
  - Step3 mudpit 口径下，若缺少基线会自动 bootstrap `capture_tactical_baseline_step2_mudpit.png` 并重抓一帧量化。
- `tests/capture_tactical_view.py`
  - 新增 `mudpit` 对齐机位。
  - 新增锁定机位中心（经纬度+姿态）后仅调高度的 mpp 收敛策略，避免 zoom 导致区域漂移。

## 已验证命令
- `npm run build`：通过
- `npm run lint`：通过

## 下一步（继续 Step 3）
- 目标：优先消除平原“泥水坑”观感，再考虑进入 Step 4。
- 验收：必须先通过更新后的 Step 3 全量门禁。

## 最新一轮结果（2026-02-17）
- 机位与前置：
  - Step3 使用 `mudpit`，`profile=tactical`，`mpp=182.32`，`ensure_tactical_mpp_satisfied=true`。
  - Step1/2 通过 `wide` 守护评估，均通过。
- Step3 主要失败：
  - `plain_luma_mean_rel=0.1197`（阈值 `<=0.10`）
  - `plain_sat_std_rel=0.9522`（阈值 `<=0.40`）
  - `plain_brown_ratio_rel=0.2680`（阈值 `<=0.16`）
  - `plain_highpass_std_rel=0.8098`（阈值 `<=0.26`）
- 结论：仍是典型“泥面低离散度”问题，Step3 未通过。

## 续调进展（2026-02-17）
- 已修复 Step3 机位流程：
  - mudpit 机位可稳定满足 `profile=tactical` 且 `mpp in [175,195]`；
  - Step1/2 改为 wide 守护评估，避免跨场景误判。
- 最新续调结果（mudpit）：
  - `global_edge_mean` 有提升（`+1.09%`），`ridge_edge_mean` 提升（`+1.92%`）；
- 但 plain 指标回落：`plain_luma_std=-2.55%`、`plain_edge_mean=-3.21%`；
- RedFlag 关键项仍失败：`plain_sat_std_rel=0.9523`、`plain_brown_ratio_rel=0.2680`、`plain_highpass_std_rel=0.8093`。

## 口径修正（已落地）
- Step3 baseline 不再允许自动 bootstrap；缺失即失败。
- 已显式冻结：`tests/artifacts/capture_tactical_baseline_step2_mudpit.png`。
- Step3 量化窗口改为 `mudpit` 专用窗口（不再沿用 wide 窗口），避免错窗导致误判。

## 最新判定（mudpit 专用窗口）
- 前置全部满足：`profile=tactical`、`mpp in [175,195]`、`ensure_tactical_mpp_satisfied=true`。
- wide 守护（Step1/2）通过。
- Step3 仍失败，主要失败项：
  - `plain_luma_mean_rel=0.1480`（阈值 `<=0.10`）
  - `plain_sat_std_rel=0.7296`（阈值 `<=0.40`）
  - `plain_brown_ratio_rel=0.1820`（阈值 `<=0.16`）
  - `plain_lowfreq_ratio_rel=0.3929`（阈值 `<=0.18`）
  - `plain_sat_bin_ratio_rel=0.6364`（阈值 `<=0.22`）
- 结论：泥面仍偏低离散、低频占比偏高，继续 Step3。

## 新增进展（2026-02-17）
- `stage_gate_runner` 增加 capture 重试，wide/mudpit 两条链路前置更稳。
- 本轮单变量（`plainChromaticDiversityGain`）结果：
  - plain 指标变化很小：`plain_luma_std +0.40%`、`plain_edge -0.08%`；
  - RedFlag 关键失败仍集中在 `plain_sat_std_rel / plain_brown_ratio_rel / plain_lowfreq_ratio_rel`。
- 结论：单纯 chroma 分裂不足以去泥，下一轮应改前段 plain 结构分层权重与频率配比。

## 最新续调（2026-02-17）
- 单变量：`plainFrequencyMixGain=0.55`（前段频率配比）。
- 结果（mudpit）：
  - `plain_luma_std`: `-0.95%`
  - `plain_edge_mean`: `-0.70%`
  - `plain_sat_std_rel=0.7303`（未过）
  - `plain_brown_ratio_rel=0.1821`（未过）
  - `plain_lowfreq_ratio_rel=0.3877`（未过）
- 结论：该方向无效且有回退，需切换到 plain 分层权重重塑（而非频率配比微调）。

## 本轮新增（2026-02-17）
- 单变量：`plainLayerExpansionGain=0.45`（前段 plain 分层扩展）。
- 结果（mudpit）：
  - `plain_luma_std +0.20%`，`plain_edge -1.28%`，`ridge_edge -1.94%`；
  - `plain_sat_std_rel=0.7406`、`plain_brown_ratio_rel=0.1819`、`plain_lowfreq_ratio_rel=0.3817` 仍失败。
- 结论：前段分层扩展单独使用不能解决泥面问题，需与 plain 频率/色彩离散联动设计。

## 新增迭代（2026-02-17，最新）
- tactical-only 参数续调（`src/config.ts`）：
  - `plainMudBreakGain=0.18`
  - `plainTintSplitGain=0.20`
  - `plainMicroReliefGain=0.55`
- 门禁前置：
  - mudpit 主验收与 wide 守护均满足 `profile=tactical`、`mpp in [175,195]`、`ensure_tactical_mpp_satisfied=true`。
- 量化结果（mudpit）：
  - `global_luma_mean=-0.2789%`
  - `global_luma_std=+0.0889%`
  - `global_edge_mean=-0.2952%`
  - `plain_luma_std=+0.4609%`
  - `plain_edge_mean=-0.3948%`
  - `ridge_edge_mean=-0.4254%`
- Step3 关键失败项：
  - `plain_edge_mean_ge_+1.0%` 未过
  - `plain_luma_std_ge_+0.5%` 未过
  - `plain_luma_mean_rel=0.1508`、`plain_sat_std_rel=0.7160`、`plain_brown_ratio_rel=0.1821`、`plain_lowfreq_ratio_rel=0.3929`、`plain_sat_bin_ratio_rel=0.6364` 均未过
- 结论：Step3 仍未通过。

- 失败尝试说明（已回退）：
  - 尝试在 `src/themes/tacticalMaterial.ts` 增加 plain 低频块混色/亮度偏置后，出现 `ridge_edge` 守护退化；
  - 已在同轮回退该 shader 修改，不保留该实验代码。

## 2026-02-18 续调记录
- 尝试 A（参数增强，仅 tactical）：
  - `plainGrainGain=1.42`、`plainMudBreakGain=0.34`、`plainTintSplitGain=0.34`、`plainChromaticDiversityGain=0.82`。
  - 结果：`plain_luma_std` 提升到 `+0.7666%`，但 `plain_edge` 仍为负（`-0.6146%`）；Step3 未通过。
- 尝试 B（shader plain 色相分叉）：
  - 在 `tacticalMaterial` 新增 plain chroma field/de-brown 分叉后，`wide` 守护出现 `step_2.redflag_global_edge_rel_le_0_32=false`。
  - 判定：影响前序守护，已回退。
- 当前已回滚到稳定参数：
  - `plainGrainGain=1.30`
  - `plainMudBreakGain=0.18`
  - `plainTintSplitGain=0.20`
  - `plainMicroReliefGain=0.55`
  - `plainChromaticDiversityGain=0.60`
- 最新稳定量化（mudpit）：
  - `global_luma_mean=-0.2787%`
  - `global_luma_std=+0.0892%`
  - `global_edge_mean=-0.2950%`
  - `plain_luma_std=+0.4609%`
  - `plain_edge_mean=-0.3948%`
  - `ridge_edge_mean=-0.4254%`
- 结论：Step1/2 累积守护通过，Step3 仍未通过，继续 Step3。

## 2026-02-18 追加轮次（轻量 plain 色彩分叉）
- 变更：`src/themes/tacticalMaterial.ts`
  - 在 plain tint 后新增小幅 warm/cool 分叉与去棕偏移，作用域限制在 plainMask。
- 结果（mudpit）：
  - `global_luma_mean=-0.2787%`
  - `global_luma_std=+0.0896%`
  - `global_edge_mean=-0.2952%`
  - `plain_luma_std=+0.4611%`
  - `plain_edge_mean=-0.3943%`
  - `ridge_edge_mean=-0.4245%`
- 门禁判定：
  - Step1/Step2 累积守护通过；
  - Step3 仍失败（`plain_edge_mean_ge_+1.0%`、`plain_luma_std_ge_+0.5%` 未过；RedFlag plain 系列约束仍未过）。
- 结论：该改动影响幅度过小，未产生有效增益。

## 2026-02-18 最新续调（结构增益微抬）
- tactical-only 变更：
  - `src/config.ts`
    - `edgeEnhanceGain=1.48`
    - `plainMicroReliefGain=0.62`
    - `plainStructureGain=1.32`
  - `src/themes/tacticalMaterial.ts`
    - plain tint 后轻量 warm/cool 分叉与 de-brown 偏移（小权重）。
- 量化结果（mudpit）：
  - `global_luma_mean=-0.2615%`
  - `global_luma_std=+0.1057%`
  - `global_edge_mean=-0.2015%`
  - `plain_luma_std=+0.4870%`
  - `plain_edge_mean=-0.2508%`
  - `ridge_edge_mean=-0.3272%`
- 门禁判定：
  - Step1/Step2 累积守护通过；
  - Step3 仍失败，但较上一稳定轮次有小幅改善（plain_edge、plain_luma_std 更接近增量门槛）。

## 2026-02-18 实验：地面禁光照可行性
- 新增 tactical-only 能力：
  - `plainLightingSuppress`（仅作用 plain 区，抑制 sun/shadow/warm/cool 与 relief 光照分量）。
- 实测：
  - `plainLightingSuppress=0.78`：视觉反光显著下降，但 Step2 wide 守护回退（`global_edge/plain_edge/ridge_edge` 三项失败）。
  - `plainLightingSuppress=0.22`：回退减轻但仍触发 `redflag_plain_edge_rel` 失败。
  - `plainLightingSuppress=0.00`：守护恢复（Step1/Step2 通过），作为当前稳定值保留。
- 结论：
  - 不能直接“禁用地面光照”；
  - 下一步应做“仅抑制视角相关高光分量”的定向方案，避免破坏前序门禁。

## 2026-02-18 实验：视角高光定向抑制
- tactical-only 新增：
  - `plainViewGlareSuppress`（`ndotv` 驱动的 plain 眩光抑制项）。
- 结果：
  - 当 `plainViewGlareSuppress=0.45`：Step2 wide 守护出现 `redflag_global_edge_rel_le_0_32=false`，仍有前序回退风险。
  - 回退到 `plainViewGlareSuppress=0.00`：Step1/Step2 守护恢复通过。
- 当前稳定参数：
  - `plainLightingSuppress=0.00`
  - `plainViewGlareSuppress=0.00`
- 当前稳定量化（mudpit）：
  - `global_luma_mean=-0.2617%`
  - `global_luma_std=+0.1057%`
  - `global_edge_mean=-0.2051%`
  - `plain_luma_std=+0.4870%`
  - `plain_edge_mean=-0.2508%`
  - `ridge_edge_mean=-0.3272%`
- 结论：反光抑制方向成立，但当前实现仍影响守护，后续需更窄范围（仅限定低坡 plain + 高亮项）实现。

## 2026-02-18 当前收敛状态（最新）
- 已回退项：
  - `plainLightingSuppress` 与 `plainViewGlareSuppress` 实验链路已撤销，避免影响累计守护。
- tactical 参数调整：
  - `edgeEnhanceGain` 下调到 `1.20`（从 1.48 连续回调）。
  - `plainMicroReliefGain` 提升到 `0.74`。
- 最新量化（mudpit）：
  - `global_luma_mean=-0.2541%`
  - `global_luma_std=+0.0987%`
  - `global_edge_mean=-0.2011%`
  - `plain_luma_std=+0.4701%`
  - `plain_edge_mean=-0.2279%`
  - `ridge_edge_mean=-0.3184%`
- 门禁状态：
  - Step1/Step2 累积守护恢复通过；
  - Step3 仍失败（plain 增量项与 RedFlag plain 约束未达标）。

## 2026-02-18 最新进展（继续 Step3）
- tactical-only 代码状态：
  - `plainLightingSuppress/plainViewGlareSuppress` 已从 shader 主链路回退，避免 wide 守护回退风险。
- tactical 参数状态（`src/config.ts`）：
  - `edgeEnhanceGain=1.20`
  - `plainMicroReliefGain=0.74`
  - `plainGrainGain=1.48`
  - `plainTintSplitGain=0.28`
- 最新量化（mudpit）：
  - `global_luma_mean=-0.2554%`
  - `global_luma_std=+0.1324%`
  - `global_edge_mean=+0.0113%`
  - `plain_luma_std=+0.5545%`（已过 `+0.5%`）
  - `plain_edge_mean=+0.0960%`（未达 `+1.0%`）
  - `ridge_edge_mean=-0.0985%`
- 门禁结论：
  - Step1/Step2 累积守护通过；
  - Step3 仍未通过（主要卡在 `plain_edge` 增量与 RedFlag plain 指标）。

## 2026-02-18 终止尝试说明（切换策略前冻结点）
- 已按要求终止继续微调，准备切换到新策略。
- 冻结代码状态（最后一次已量化验证参数）：
  - `edgeEnhanceGain=0.96`
  - `normalDetailGain=1.34`
  - `plainCrispGain=2.55`
  - `plainGrainGain=1.42`
  - `plainMicroReliefGain=0.92`
  - `plainTintSplitGain=0.45`
  - `plainChromaticDiversityGain=1.00`
- 对应最近一轮量化（mudpit）：
  - `global_luma_mean=-0.6712%`
  - `global_luma_std=+0.4427%`
  - `global_edge_mean=+0.9024%`
  - `plain_luma_std=+1.6474%`
  - `plain_edge_mean=+1.3649%`
  - `ridge_edge_mean=+0.8954%`
- 阶段门禁结论：
  - Step1：通过。
  - Step2：未通过（仅 `redflag_plain_edge_rel_le_0_78` 未过，当前 `0.7848`，超线很小）。
  - Step3：未通过（`redflag_plain_luma_mean_rel / sat_std_rel / brown_ratio_rel / lowfreq_ratio_rel / sat_bin_ratio_rel` 未过）。
- 当前困难点（导致继续微调收益很低）：
  - 指标耦合明显：为了过 Step3 提升 plain 结构，会反向顶高 Step2 的 plain/global edge 约束。
  - “泥坑感”本质是 plain 区域低频块状 + 棕色域占比偏高；仅增益和颜色参数难同时解决。
  - 禁用/抑制地面光照会破坏前序守护，不是可持续路径。
- 建议下一策略（待新任务执行）：
  - 走“plain 独立着色分支”重构：把 plain 的低频破碎、色域分叉、光照响应单独设计，与 ridge/slope 解耦。
  - 使用限幅的分段光照与局部 tone-map，避免全局调参联动失控。
