# TODO (Tactical RedFlag Recovery Plan)

## Mission
只聚焦 `tactical` 档位，把当前“泥/水感 + 山脊不清晰”的效果，收敛到接近 `RedFlag.jpg` 的风格：
1. 山脊锐利、可读。
2. 阴影呈深褐色且有层次。
3. 平原区有砂砾颗粒，不再一片涂抹。

## Hard Constraints
1. 只改 `tactical` 渲染链路，不改其他档位视觉策略。
2. 继续保持 tactical 运行约束：`100 ~ 700 m/px`。
3. 每一步不达标，不进入下一步。

## Quantitative Gate (MPP-First)
1. 比较前提（必须满足）
- 只在 `tactical` 档位比较。
- 只在近似同尺度比较：`mpp in [175, 195]`。
- 只用 `CAPTURE_ALIGN_REDFLAG=wide` 的截图。

2. 指标定义（baseline vs current）
- `global_luma_mean`: 全图亮度均值（可读性底线）。
- `global_luma_std`: 全图亮度标准差（整体对比度）。
- `global_edge_mean`: 全图 Sobel 边缘均值（整体结构清晰度）。
- `plain_edge_mean`: 平原窗口 Sobel 边缘均值（“泥/水感”反指标）。
- `ridge_edge_mean`: 山脊窗口 Sobel 边缘均值（山脊锐利度主指标）。

3. 为什么用这组指标
- `m/px` 先对齐，避免把“尺度差异”误判成“材质改进”。
- `ridge_edge_mean` 直接对应“山脊是否更锐利”。
- `plain_edge_mean` 直接对应“平原是否被抹平成泥/水”。
- `global_luma_mean/std` 用于防止通过“过暗或过曝”伪造锐度。

4. Step 1 放行条件
- `ridge_edge_mean >= -5%`（相对 baseline）
- `plain_edge_mean >= -5%`
- `global_edge_mean >= -5%`
- 且 `global_luma_mean` 不低于 baseline 的 `-8%`（避免可读性崩溃）

## Baseline (Locked)
1. 数据：`maxzoom=9`（已知先天细节上限）。
2. LOD 阈值：`global=9000`、`continental=2800`、`regional=700`。
3. 当前主要问题：
- 全局亮度在逆光下仍不稳定。
- 山脊增强方式偏“后期锐化”，会带出噪声/拼块感。
- 平原层过于平滑，导致“泥/水感”。

## Execution Plan (Strict Gate)

Status:
1. Step 0: completed
2. Step 1: in progress (quantitative gate not passed)
3. Step 2-5: pending

### Step 0 - 对比基线冻结（必须先完成）
目标：
- 冻结一套固定机位与光照条件，作为后续唯一比较基线。
动作：
- 固定 capture 机位（优先 `CAPTURE_ALIGN_REDFLAG=wide`）。
- 固定 tactical 档位截图命名。
验收：
- 输出 baseline 截图并在后续步骤重复对比。
结果：
- 已完成，基线截图：`tests/artifacts/capture_tactical_baseline_step0.png`

### Step 1 - 材质骨架重构（三层地貌分带）
目标：
- 把当前单层混色改为 `ridge/slope/plain` 三层分带。
动作：
- 在 `src/themes/tacticalMaterial.ts` 中新增分带权重：
  - `ridge layer`：高频细节 + 定向高光
  - `slope layer`：中频过渡层
  - `plain layer`：砂砾颗粒主导，抑制低频涂抹
- 分带权重由 `slope + curvature(法线导数近似)` 驱动。
验收：
- 平原区不再“整片抹平”，山脊分区明确。
结果：
- 已完成首版实现（`ridge/slope/plain` 显式分带 + 权重归一化 + `slope+curvature` 驱动），
  待按基线截图进行人工视觉验收后决定是否进入 Step 2。
- 量化对比（baseline=`capture_tactical_baseline_step0.png`）当前仍未过线：
  - 最新一轮（`mpp=182.24`，tactical）：
    - `ridge_edge_mean`: `-6.79%`
    - `plain_edge_mean`: `-6.24%`
    - `global_edge_mean`: `-4.19%`
    - `global_luma_mean`: `-2.96%`
  - 趋势：较早期轮次持续回升，但 `ridge/plain` 仍未达 `-5%` 门槛。
  结论：当前版本整体仍偏软，继续停留 Step 1 调整。

### Step 2 - 光照模型重构（战术风格，不是纯 lambert）
目标：
- 逆光场景保持可读，阴影进入深褐色域。
动作：
- 引入 `half-lambert + wrap diffuse + 控制型 rim`（仅 tactical）。
- 阴影采用“深褐色映射”而不是线性压暗。
- 高光限制在 ridge 区域，不污染 plain 区域。
验收：
- 中国区域逆光场景不再整体发黑；
- 阴影深褐且有层次，不是一片黑块。

### Step 3 - “泥/水感”专项清除
目标：
- 去除平原湿泥观感，建立砂砾颗粒地表。
动作：
- 降低 plain 低频混合权重。
- 提高高频砂砾噪声比重（near/mid 合理衰减）。
- seam 抑制改为窄带局部处理，避免全局雾化。
验收：
- 平原区域出现稳定颗粒，不再“水面般平滑”。

### Step 4 - 山脊锐利化结构信号化
目标：
- 山脊“锐利”来自地貌信号，不靠全局锐化。
动作：
- ridge mask = `slope_high * curvature_high * lit_condition`。
- 只对 ridge mask 内执行高光/对比增强。
- 降低全局 `edgeEnhance` 依赖，避免噪声和拼块被一起放大。
验收：
- 山脊更“刀锋化”，但平原和拼块边不会同步变脏。

### Step 5 - Tactical 参数包固化
目标：
- 避免继续无边界微调，形成稳定可复用方案。
动作：
- 固化三套 tactical 参数包：
  1. `Tactical_Balanced`（默认）
  2. `Tactical_Contrast`（强调山脊）
  3. `Tactical_DimSafe`（逆光保障）
- 每套输出截图对比并记录用途。
验收：
- 能稳定复现三种可解释风格，不再“每次一坨参数”。

## Per-Step Output Requirements
每一步都必须产出：
1. 代码改动清单（只限 tactical 链路）。
2. 构建检查：
- `npm run build`
- `npm run lint`
3. 对比截图：
- `tests/artifacts/capture_tactical_view.png`
4. 一句话结论：是否达标、是否进入下一步。

## Commands
1. 重启服务
- `./tools/restart_server.sh`
2. tactical 截图
- `/Users/wangshanping/_code/e3-TCS/.venv/bin/python /Users/wangshanping/_code/e3-TCS/tests/capture_tactical_view.py`
3. 构建检查
- `npm run build`
- `npm run lint`
