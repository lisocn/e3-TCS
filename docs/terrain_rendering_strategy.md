# e3-TCS 地形分层渲染与高负载态势并行方案

## 1. 背景与目标

### 1.1 初衷复述
- 依据高程数据和`metersPerPixel (mpp)` 采用不同渲染策略。
- 全球尺度只需稳定呈现海岸线/大洲/陆地轮廓（允许极简渲染）。
- 小比例尺（近景）需要逼近 `RedFlag.jpg` 的战术地貌风格。

### 1.2 约束条件
- 后续要承载约 10 万仿真实体与大量态势效果（雷达、武器、通信、干扰范围、航迹、爆炸等）。
- 地形渲染必须“按需花费”，把 CPU/GPU 预算优先让给态势层。
- 离线内网环境，禁止依赖外网资源。

### 1.4 离线化硬约束（必须满足）
- 禁止外部 CDN、在线字体、在线图标、在线地图 API。
- 所有资源必须本地化或由内网服务提供。
- 配置、代码、构建产物均不得隐式依赖公网。

### 1.3 设计目标
- 在不同尺度达到“足够可读”而非“处处最高质量”。
- 避免频繁策略切换导致抖动、闪烁、帧时间尖峰。
- 可配置、可观测、可压测、可回归。

## 2. 总体架构

采用“双层预算 + 四档渲染”的结构：

1. 地形层预算  
   目标：在当前尺度下用最低成本满足地理可读性。
2. 态势层预算  
   目标：优先保证实体、轨迹、范围效果的实时性。

地形按 `metersPerPixel (mpp)` 划分四档，不使用单一策略覆盖全程。

### 2.1 当前执行策略（2026-02-15）
- 默认运行模式：`adaptiveLod`
- 行为：
  - 按 `mpp` 在 `global/continental/regional/tactical` 四档间自动切换
  - tactical 材质采用 `normalEC` 主链路（法线+光照+坡度），不再走“高度+梯度主导”路线
  - 保留 OOM 安全降级与高空椭球回退，优先保障稳定性
- 说明：
  - 早期实验开关与双模式分叉已移除，当前以单路径维护为准。

## 3. 四档渲染策略

### 3.1 档位定义（建议初值）

1. `global`：`mpp > 5000`
2. `continental`：`800 < mpp <= 5000`
3. `regional`：`80 < mpp <= 800`
4. `tactical`：`mpp <= 80`

> 说明：阈值为首版建议，需以压测结果调优。

### 3.2 各档渲染行为

1. `global`
- terrain provider：椭球地形优先（或极低分辨率地形）
- imagery：可选 NaturalEarthII（海陆轮廓）或纯色分区
- tactical material：关闭
- contour/grid：全部关闭

2. `continental`
- terrain provider：本地 terrain 开启
- tactical material：低成本档（无 micro-grid，弱 contour）
- imagery：默认关闭（避免 global 底图残留遮挡 continental 材质表达）

3. `regional`
- terrain provider：本地 terrain 开启
- tactical material：中成本档（macro-grid + 低频 contour）
- imagery：默认关闭

4. `tactical`
- terrain provider：本地 terrain 开启
- tactical material：高质量档（接近 `RedFlag.jpg`）
- 仅在近景开启 micro-grid 与细节增强
- imagery：默认关闭

## 4. 配置设计（落地到 `AppConfig`）

建议在 `src/config.ts` 新增：

```ts
terrain: {
  modeSwitch: {
    debounceMs: 150,
    hysteresisRatio: 0.15
  },
  lodProfiles: {
    global: { ... },
    continental: { ... },
    regional: { ... },
    tactical: { ... }
  }
}
```

关键字段建议：
- `useLocalTerrain: boolean`
- `enableImagery: boolean`
- `materialPreset: 'off' | 'low' | 'mid' | 'high'`
- `requestVertexNormals: boolean`
- `hudQueryLevel?: number`
- `effectsBudgetHint: 'terrain-low' | 'terrain-mid' | 'terrain-high'`

## 5. 代码改造点

### 5.1 `TacticalViewer`

新增能力：
1. 维护当前 `lodProfile` 状态。
2. 在 `camera.changed` 中计算 `mpp` 并做档位判定。
3. 使用防抖 + 滞回避免频繁来回切换。
4. 仅当档位变化时调用渲染更新。

接口建议：
- `private evaluateLodProfile(mpp: number): ProfileName`
- `private applyLodProfile(profile: ProfileName): void`

### 5.2 `ThemeManager`

新增能力：
1. `applyTacticalProfile(profileConfig)`，统一接收低/中/高材质档参数。
2. `material off` 时彻底关闭 tactical shader，避免空耗。
3. `baseLayerEnabled` 在 tactical/satellite 两种主题保持一致语义（已完成一部分）。

### 5.3 `DataManager`

新增能力：
1. 根据档位调整 `queryLevel`（远景可固定低级别或降频）。
2. 远景 HUD 允许仅快速值，不强制高频 `sampleTerrainMostDetailed`。

### 5.4 `dev.ts` / 调试面板

新增观测项：
- 当前档位（global/continental/regional/tactical）
- 当前 mpp
- 最近一次切档耗时
- 当前 terrain provider（local/ellipsoid）

## 6. 性能预算与原则

### 6.1 地形层原则
- 远景不做高成本 shader 细节。
- 材质参数变化按档位批量切换，不在每帧重建。
- 仅在必要时切换 provider，避免反复重连与资源抖动。

### 6.2 态势层原则（为 10 万对象预留）
- 主通道使用 `Primitive/Collection`，避免以 `Entity` 为主渲染路径。
- 按样式桶批处理，降低 draw call。
- 动态效果对象池化，禁止频繁创建销毁。
- 轨迹与范围效果按距离/重要性分级绘制。

### 6.3 验收指标（首版）
- 1080p：平均 FPS >= 50，P95 帧时 < 22ms。
- 快速缩放 30 秒：无明显闪烁、无高频切档抖动。
- global 档 GPU 压力显著低于 tactical 档。

## 7. 实施里程碑

### M1（地形分层最小可用）
1. 配置化四档 profile。
2. `TacticalViewer` 实现档位判定与切换。
3. `ThemeManager` 支持 `off/low/mid/high` 四档材质。
4. 加入调试观测字段。

### M2（性能固化）
1. 加入滞回、防抖、切档冷却时间。
2. 地形查询频率随档位动态调整。
3. 基准压测脚本输出帧时间统计。

当前已落地：
- `terrain.modeSwitch.cooldownMs` 已配置并在切档逻辑生效。
- `TacticalViewer.getLodSwitchStats()` 可输出切档次数与耗时统计。
- 基准脚本：`tests/lod_switch_benchmark.py`（依赖本地 dev server）。

### M3（态势层并行优化）
1. 建立 10 万对象批渲染骨架。
2. 范围圈/轨迹/爆炸效果池化与分级显示。
3. 完整回归测试与性能对比报告。

## 8. 风险与应对

1. 风险：切档阈值不合理导致画面抖动  
应对：滞回区间 + 冷却时间 + 统一 mpp 口径。

2. 风险：近景材质过重挤占态势渲染  
应对：设置地形上限预算，必要时自动降档。

3. 风险：主题 token 与 profile 参数分散漂移  
应对：单一配置源（`themePacks + lodProfiles`），样式表仅保底变量。

4. 风险：本地 terrain 触发 Wasm OOM 导致会话不稳定  
应对：保留 OOM 熔断与高空椭球回退，触发后会话内禁用本地 terrain，不再自动重试。

## 9. 根因说明（为什么当前要这么做）

### 9.1 已证据化现象
- 控制台明确报错：`WebAssembly.instantiate(): Out of memory`
- 报错链路出现在本地 terrain 路径（`CesiumTerrainProvider` 解码阶段）。
- 若 OOM 后仍允许 LOD 切回本地 terrain 档位，会持续出现 Promise rejection。

### 9.2 根因判断（工程结论）
- 根因是“本地 terrain 的 Wasm 内存压力超出当前会话可分配预算”，而不是单纯颜色或 shader 参数问题。
- 影响因素通常是叠加的：
  - 瓦片覆盖范围与分辨率
  - 解码并发与短时峰值
  - 浏览器/驱动/系统内存状态
  - Cesium 版本实现细节

### 9.4 当前阶段边界
- 四档 `adaptiveLod` 均已纳入主路径维护。
- 当前工作重点从“路线探索”切换到 RedFlag 视觉精修与性能稳态优化。

### 9.3 是否是版本或操作系统问题
- 当前证据不足以把问题归因到“单一版本 bug”或“单一 OS bug”。
- 更准确表述是：在“当前版本 + 当前数据 + 当前环境”组合下出现内存峰值超限。
- 因此当前采用“单路径 + 安全回退”的策略，兼顾稳定性与可维护性。

## 10. 开发清单（可直接开工）

1. `src/config.ts` 新增 `terrain.modeSwitch` 与 `terrain.lodProfiles`。
2. `src/core/TacticalViewer.ts` 新增 `evaluate/apply profile` 逻辑。
3. `src/themes/ThemeManager.ts` 新增 `applyTacticalProfile` 与四档材质支持。
4. `src/data/DataManager.ts` 增加按 profile 调整查询策略接口。
5. `src/dev.ts` 增加档位与性能观测 UI。
6. 新增 `tests` 压测/回归脚本（至少覆盖切档逻辑与无抖动判定）。

---

该方案的核心是：**先稳态保底，再分阶段恢复能力；全局“够用就好”，近景“重点增强”。**
