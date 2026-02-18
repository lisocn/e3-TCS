# e3-TCS 地形渲染策略（当前有效版）

## 1. 目标
- 仅聚焦 tactical 近景风格，向 `RedFlag.jpg` 收敛。
- 地形渲染采用“按需花费”原则，为高负载态势层预留预算。
- 全链路适配离线内网部署，不依赖公网资源。

## 2. 当前有效架构
- 运行模式：`adaptiveLod`
- 档位：`global / continental / regional / tactical`
- 自动切换依据：`metersPerPixel (mpp)`
- tactical 材质：最小 RedFlag 主链路（硬分层 + HUD 网格 + 暗远景）
- 安全策略：保留 OOM 熔断与高空椭球回退

## 3. 档位职责
1. `global`
- 目标：低成本海陆可读性
- 策略：优先椭球/低成本渲染

2. `continental`
- 目标：区域级轮廓与地貌趋势
- 策略：中低成本材质，默认不依赖影像增强

3. `regional`
- 目标：地貌结构可读与平滑过渡
- 策略：中成本材质

4. `tactical`
- 目标：接近 RedFlag 风格
- 策略：高对比、硬朗分层、网格主导

## 4. 当前唯一有效门禁
统一脚本：`tests/stage_gate_runner.py`

可用等级：
- `--level draft`
- `--level target`
- `--level final`

强制前置：
- `profile=tactical`
- `mpp in [175,195]`
- 同时验证 `wide` 与 `mudpit`

## 5. 门禁维度
- `wide`：全局风格与结构
  - score、deltaE、hue distance、global/ridge edge、shadow 色域
- `mudpit`：平原去泥与频率结构
  - score、plain luma、plain saturation dispersion、brown ratio、low/high frequency ratio

## 6. 性能原则
- 地形参数按档位批量切换，避免每帧重建。
- 远景不启用高成本细节链路。
- 优先保障态势层渲染稳定性，必要时地形自动降档。

## 7. 迭代约束
- 每轮必须执行：
  - `npm run build`
  - `npm run lint`
  - `tests/stage_gate_runner.py --level target`（主线）
- 收口必须执行：
  - `tests/stage_gate_runner.py --level final`

## 8. 当前状态
- `target`：已通过
- `final`：未通过
- 后续重点：继续降低 `wide` 色差/色相偏差，收敛 `mudpit` 明度与棕色占比。
