# e3-TCS 开发接力手册（Agent/Human 通用）

## 0. 最新交接快照（2026-02-14，供新会话直接使用）

### 0.1 当前代码状态（已落地）
- 已引入 global 实验开关：`window.E3_CONFIG.enableGlobalMaterialAttempt`。
- 默认值为 `false`，默认路径是稳定基线：
  - `stableGlobalBaseline`
  - `global`
  - `imagery=true`
  - `material=off`
- 已引入运行模式可观测字段（状态栏会显示 `Mode`）：
  - `STABLE_GLOBAL_IMAGERY_BASELINE`
  - `STABLE_GLOBAL_MATERIAL_EXPERIMENT`
  - `STABLE_GLOBAL_IMAGERY_FALLBACK`
  - `SAFE_GLOBAL_FALLBACK_WASM_OOM`

### 0.2 你刚看到的日志结论
- 本会话已发生 `WebAssembly.instantiate(): Out of memory`。
- 触发了会话熔断：`Local terrain disabled for this session due to WASM OOM`。
- 后续 provider 变为 `EllipsoidTerrainProvider`，因此：
  - `sampleTerrainMostDetailed unavailable` 是预期
  - `span=0` 是预期
- 该会话内无法再验证 global 材质实验路径（必须新会话）。

### 0.3 新会话启动步骤（严格顺序）
1. 彻底关闭当前页面和 dev 进程，避免继承已熔断状态。
2. 启动新 dev 会话。
3. 在启动前注入：
   - `window.E3_CONFIG.enableGlobalMaterialAttempt = true`
4. 首次进页面后先看状态栏 `Mode`：
   - 目标是 `STABLE_GLOBAL_MATERIAL_EXPERIMENT`
   - 若是 `STABLE_GLOBAL_IMAGERY_FALLBACK`，说明实验未拿到可用 local terrain
   - 若是 `SAFE_GLOBAL_FALLBACK_WASM_OOM`，说明再次 OOM，立即停止实验并记录日志

### 0.4 本轮目标边界（新会话必须遵守）
- 只验证 global 档，不恢复 continental/regional/tactical 实装。
- 一旦 OOM，立即回到稳定基线，不在同会话内反复重试 local terrain。
- 先拿到“稳定可观测结论”，再讨论下一档恢复。

### 0.5 新会话验收信号
- 成功信号：
  - `Mode=STABLE_GLOBAL_MATERIAL_EXPERIMENT`
  - `LOD=GLOBAL`
  - 画面存在海陆/高程分层可读性
  - 无持续 Promise rejection 刷屏
- 失败信号：
  - `Mode=SAFE_GLOBAL_FALLBACK_WASM_OOM`
  - 控制台连续 `WebAssembly.instantiate OOM`
  - 自动回退后仅剩 imagery 基线

## 0. 当前会话交接（2026-02-14）

### 0.1 当前问题定义（仍未闭环）
- 现象：`continental/regional` 档位在“无底图（imagery=0）”策略下，地球呈现纯蓝/灰黑，材质没有体现预期地形细节。
- 约束：用户明确要求**不允许兜底底图**（开发阶段要暴露问题，不接受视觉掩盖）。

### 0.1.1 当前阶段策略（已确认）
- 运行策略切换为 `stableGlobalBaseline`（默认）：
  - 固定 `global` 档位。
  - 默认走稳定底线：`imagery + material off`。
  - 通过 `window.E3_CONFIG.enableGlobalMaterialAttempt=true` 可开启“global 材质实验通道”。
  - 实验通道下若 terrain 不可用或触发 OOM，自动回退到稳定底线。
- 目的：先保证“稳定可用与可读”，再逐步恢复自适应四档（`adaptiveLod`）。

### 0.2 已确认事实（高置信度）
- LOD 切换链路正常：
  - 日志可见 `LOD profile switched to continental/regional/tactical`。
- 主题应用链路正常：
  - 日志可见 `Tactical material preset 'mid' enabled (normal)`。
  - 日志可见 `globe.material attached=yes`。
- 当前确实无底图：
  - 日志可见 `imagery layer count = 0`。
- 数据源与服务端主链路正常（非全 0）：
  - `node tools/terrain_probe.mjs` 实测：
    - Tibet-1 ≈ 4937m
    - Tibet-2 ≈ 4956m
    - Everest ≈ 8461m
    - Pacific ≈ -2906m
  - 中国中心点抽样：
    - `h8 ≈ 2451m`
    - `h9 ≈ 2454m`

### 0.3 关键误判已修正
- 之前 `VisualDiagnostics` 使用当前 `viewer.terrainProvider` 抽样，可能被 LOD 回退椭球地形干扰，导致误报 `span=0`。
- 现已修正：
  - `TacticalViewer.runDiagnostics()` 优先传 `localTerrainProvider` 给诊断模块。
  - `VisualDiagnostics` 采样支持 fallback：`sampleTerrainMostDetailed` 不可用时自动降级 `sampleTerrain(level=8)`。

### 0.4 当前最可能根因（优先级）
1. **材质表达链路问题（前端）**：
   - shader 在“无 imagery + 当前 Cesium 版本”条件下，片元表达退化（并非未挂载材质）。
2. **地形几何细节/法线依赖不足**：
   - `requestVertexNormals=false` + 远景 `mid` 参数可能导致视觉对比过弱，表面看似纯色。
3. **诊断指标本身不足**：
   - 现有 `Yellow Density` 指标更偏“网格噪点”，不适用于当前材质风格。

### 0.5 已执行的代码调整（与当前问题相关）
- `src/themes/ThemeManager.ts`
  - tactical 无底图路径已改为**不添加任何 imagery fallback**。
  - 保留日志：材质启用、imagery 层数量、每层 alpha/show。
- `src/themes/tacticalMaterial.ts`
  - 去除对 `materialInput.slope` 的依赖（兼容性修正）。
  - `uv` 从 `normalEC` 推导改为 `materialInput.st`（更稳定）。
  - 加强海陆分段着色策略（但问题仍未完全消除）。
- `src/core/VisualDiagnostics.ts`
  - 新增地形高度跨度诊断（3x3 采样，输出 `min/max/span`）。
  - 增加 provider 输出与 mostDetailed->level8 降级逻辑。
- `src/core/TacticalViewer.ts`
  - 诊断时优先使用 `localTerrainProvider`。

### 0.6 下一步执行方案（新会话直接按此做）
1. 做最小二分材质（强制常量色）：
   - 在 `tacticalMaterial` 增加 `debugSolidColor` 分支，`material.diffuse = vec3(1,0,0)`。
   - 仅对 `continental/regional` 临时启用，验证片元材质是否真实生效。
2. 如果常量色生效，再加一步“仅 height 分层，不含网格/光照”：
   - 仅用 `materialInput.height` 做 2-3 段阈值着色，确认高度链路有效性。
3. 若步骤2生效，再逐项恢复：
   - 先恢复 contour，再恢复 macroGrid，再恢复微网格，逐步找出导致退化的表达项。
4. 若步骤1都不生效：
   - 转向 Cesium 渲染状态排查（globe/translucency/lighting/requestRenderMode/相机状态）。

### 0.7 验收标准（当前问题闭环判定）
- 在 `continental/regional` 且 `imagery layer count = 0` 条件下：
  - 肉眼可辨海陆/高程分层（非纯蓝、非纯灰黑、非单色球）。
  - 控制台无 `DeveloperError`、无 shader 编译报错。
  - LOD 切换日志仍稳定，性能无明显退化。

### 0.8 本轮新增进展（2026-02-14）
- 已在 `src/themes/tacticalMaterial.ts` 增加 `debugMode` 二分开关：
  - `solidRed`：片元输出固定红色（`vec3(1,0,0)`）。
  - `heightBands`：仅按 `materialInput.height` 做三段分层（海平面以下/平原/高地）。
- 已将材质诊断开关改为运行时注入（默认 `off`），不再在 `src/config.ts` 固定写死 `solidRed`。
- `ThemeManager` 日志已增加 `diagnostic=...` 字段，便于直接在控制台确认当前材质诊断分支。
- 已补充运行时配置注入能力：`window.E3_CONFIG.lodMaterialDebugMode`（按档位配置 `off/solidRed/heightBands`）：
  - 支持精确控制 `global/continental/regional/tactical` 各档诊断模式。
  - 默认 `off`，不改变 `stableGlobalBaseline` 的稳定路径。
- 门禁结果：
  - `npm run lint` 通过
  - `npm run build` 通过

### 0.9 下一步（按顺序）
1. 先保持默认 `stableGlobalBaseline`（`enableGlobalMaterialAttempt=false`）用于联调稳定性。
2. 需要验证 global 材质时，仅在开发机设置 `window.E3_CONFIG.enableGlobalMaterialAttempt=true`。
3. 观察状态栏 `Mode` 字段：
   - `STABLE_GLOBAL_MATERIAL_EXPERIMENT`：实验通道生效。
   - `STABLE_GLOBAL_IMAGERY_FALLBACK`：实验已自动回退。
   - `SAFE_GLOBAL_FALLBACK_WASM_OOM`：会话已熔断本地 terrain。
4. 缺瓦片回退与可复现能力补充（2026-02-14）：
   - 新增 `terrain.debug.forceProfile`（支持 `window.E3_CONFIG.forceProfile` 运行时注入）：
     - 可固定到 `global/continental/regional/tactical` 做定点复现。
   - `public/config.js` 改为 `Object.assign` 合并，避免覆盖掉注入的运行时诊断字段。
   - 关键发现：
     - 当固定在 `tactical` 且处于全球尺度（本地 terrain 覆盖不足）时，地球会退化到 `globe.baseColor`，此前值为深灰，视觉表现为“全屏黑灰球”。
   - 已修复：
     - `ThemeManager` 在 tactical 模式下把 `globe.baseColor` 回退色改为 `tacticalStyle.colorLow`，缺瓦片时不再黑灰。
   - 现状验证：
     - `FORCE_PROFILE=tactical` 截图从黑灰球变为蓝色回退球（`diagnostic_report_tactical.png`）。
     - 默认自动档位下，自检前后仍可稳定回到 `global`（`material=off, imagery=true`）。
5. 根因归纳（关键结论）：
   - 触发点不是单一 shader 语句，而是“本地 terrain 解码链路在当前会话内存条件下触发 Wasm OOM”。
   - OOM 后若仍允许 LOD 回切到本地 terrain 档，会持续出现 Promise rejection，形成重复告警与画面退化。
   - 因此当前采用“先锁 global 保底，再恢复局部能力”的策略是必要且正确的。
6. 下一步路线（确定方向）：
   1. 在 `stableGlobalBaseline` 下固化 global 单档可读性（海陆边界/高程分层、UI 与态势稳定）。
   2. 其他档位暂缓实现，只保留配置位，不进入默认路径。
   3. 增加“可控试验入口”：仅在开发开关下启用 `adaptiveLod`，并分阶段恢复 `continental -> regional -> tactical`。
   4. 每恢复一个档位都必须通过：
      - 无 OOM（至少 10 分钟交互）。
      - 无持续 `unhandledrejection`。
      - 视觉可读（非纯色球、非大面积黑灰）。

### 0.10 本轮实测结论（2026-02-14）
- 已修复运行时配置覆盖问题：
  - `public/config.js` 的 `Object.assign` 顺序改为 `defaults -> runtime`，避免默认值覆盖注入参数。
  - 修复前现象：即使注入 `enableGlobalMaterialAttempt=true`，`Mode` 仍显示 `STABLE_GLOBAL_IMAGERY_BASELINE`。
- 新会话验证（注入 `ENABLE_GLOBAL_MATERIAL_ATTEMPT=true`）结果：
  - `Runtime mode before diagnostics = STABLE_GLOBAL_MATERIAL_EXPERIMENT`
  - `Runtime mode after diagnostics = STABLE_GLOBAL_MATERIAL_EXPERIMENT`
  - `LOD profile = global`
  - `Terrain Spread provider = CesiumTerrainProvider`
  - `span ≈ 1110.62m`（most-detailed，中心点约 `104.0000, 34.4052`）
  - 无 `WebAssembly.instantiate OOM` 日志
  - 产物截图：`diagnostic_report_global_material.png`

### 0.11 本轮新增能力（2026-02-14）
- 新增运行时策略注入：
  - `window.E3_CONFIG.terrainOperationMode`：`stableGlobalBaseline | adaptiveLod`
  - `window.E3_CONFIG.adaptiveLodMaxProfile`：`global | continental | regional | tactical`
- 行为说明：
  - 默认仍为 `stableGlobalBaseline`（不改变线上稳定路径）。
  - 当切到 `adaptiveLod` 时，系统会对目标档位做上限钳制，不会超过 `adaptiveLodMaxProfile`。
  - 可用于分阶段恢复：先放开到 `continental`，稳定后再放开到 `regional/tactical`。
- 推荐实验顺序：
  1. `terrainOperationMode='adaptiveLod' + adaptiveLodMaxProfile='continental'`
  2. 稳定后升到 `regional`
  3. 最后升到 `tactical`
- 自动化脚本已支持上述注入参数：
  - `tests/visual_verification.py` 支持环境变量
    - `TERRAIN_OPERATION_MODE`
    - `ADAPTIVE_LOD_MAX_PROFILE`

### 0.12 分阶段恢复实测（2026-02-14）
- 条件：
  - `TERRAIN_OPERATION_MODE=adaptiveLod`
  - `ADAPTIVE_LOD_MAX_PROFILE=continental`
  - `ENABLE_GLOBAL_MATERIAL_ATTEMPT=true`
- 结果（来自 `tests/visual_verification.py`）：
  - 运行模式：`ADAPTIVE_LOD`
  - 诊断期间发生切档：
    - `global -> continental`（`mpp≈5165.84`）
    - `continental -> global`（相机恢复后）
  - 未出现 `regional/tactical` 切档日志，说明“最大档位钳制”生效。
  - 无 OOM 日志，地形采样仍为 `CesiumTerrainProvider`。

### 0.13 LOD 基准脚本增强（2026-02-14）
- `tests/lod_switch_benchmark.py` 已增强：
  - 支持运行时注入：
    - `FORCE_PROFILE`
    - `TERRAIN_OPERATION_MODE`
    - `ADAPTIVE_LOD_MAX_PROFILE`
    - `ENABLE_GLOBAL_MATERIAL_ATTEMPT`
  - 由“固定 zoom 量”改为“按目标 mpp 驱动”路径，避免出现无切档样本。
  - 新增切档序列提取（解析 `LOD profile switched to ...` 日志）。
  - 在 `adaptiveLod + adaptiveLodMaxProfile` 条件下自动做越级校验，越级则返回非 0 退出码。
- 最新基准结果（`adaptiveLod + max=continental`）：
  - `Switch Count=2`
  - `Switch Sequence=['continental', 'global']`
  - `Cap check passed: no profile exceeded continental`
  - 截图：`lod_switch_benchmark_adaptiveLod_continental_global_material.png`

### 0.14 第二阶段基准结果（2026-02-14）
- 场景：`adaptiveLod + max=regional + enableGlobalMaterialAttempt=true`
- 结果：
  - `Switch Count=4`
  - `Switch Sequence=['continental', 'regional', 'continental', 'global']`
  - `Cap check passed: no profile exceeded regional`
  - 说明分阶段恢复在 `regional` 上限下可达且可回退，未发生越级。
  - 截图：`lod_switch_benchmark_adaptiveLod_regional_global_material.png`

### 0.15 第三阶段基准与诊断结果（2026-02-14）
- 基准场景：`adaptiveLod + max=tactical + enableGlobalMaterialAttempt=true`
- 基准结果（`tests/lod_switch_benchmark.py`）：
  - `Switch Count=6`
  - `Switch Sequence=['continental', 'regional', 'tactical', 'regional', 'continental', 'global']`
  - `Cap check passed: no profile exceeded tactical`
  - 说明 tactical 档位可达且可按路径回退。
  - 截图：`lod_switch_benchmark_adaptiveLod_tactical_global_material.png`
- 诊断结果（`tests/visual_verification.py`）：
  - 运行模式：`ADAPTIVE_LOD`
  - 诊断过程中出现 `global -> continental -> regional -> tactical`，并可恢复到 `global`。
  - `Terrain Spread provider=CesiumTerrainProvider`，`span≈1110.62m`。
  - 本轮未观测到 `WebAssembly.instantiate OOM` 或持续 `unhandledrejection` 刷屏。

### 0.16 长时稳定性回归（2026-02-14）
- 新增脚本：`tests/lod_soak_test.py`
  - 支持参数：`SOAK_ROUNDS`、`SOAK_DURATION_SECONDS`、`TERRAIN_OPERATION_MODE`、`ADAPTIVE_LOD_MAX_PROFILE`、`ENABLE_GLOBAL_MATERIAL_ATTEMPT`
  - 作用：长时交替缩放 + 每轮统计 `Mode/LOD/切档统计/OOM/rejection` 并保存截图。
- 执行配置：
  - `SOAK_ROUNDS=3`
  - `SOAK_DURATION_SECONDS=200`（总时长约 10 分钟）
  - `TERRAIN_OPERATION_MODE=adaptiveLod`
  - `ADAPTIVE_LOD_MAX_PROFILE=tactical`
  - `ENABLE_GLOBAL_MATERIAL_ATTEMPT=true`
- 结果：
  - `Soak summary: rounds=3, failures=0`
  - Round1/2/3 均为 `Mode=ADAPTIVE_LOD`
  - Round1/2/3 均为 `WASM_OOM_HITS=0`
  - Round1/2/3 均为 `UNHANDLED_REJECTION_HITS=0`
  - 产物截图：
    - `lod_soak_round1_adaptiveLod_tactical.png`
    - `lod_soak_round2_adaptiveLod_tactical.png`
    - `lod_soak_round3_adaptiveLod_tactical.png`

### 0.17 下一阶段（性能门禁基线）进展（2026-02-14）
- 新增运行时性能采样接口：
  - `TacticalViewer.getRenderPerfStats()`（平均 FPS、最近窗口 FPS、采样时长）
  - `window.getRenderPerfStats()`（调试页暴露）
- 新增性能门禁脚本：`tests/lod_perf_gate.py`
  - 工作负载：持续缩放（默认 90s）
  - 指标门限（可通过环境变量覆盖）：
    - `MIN_AVG_FPS`（默认 15）
    - `MIN_RECENT_FPS`（默认 12）
    - `MAX_AVG_SWITCH_COST_MS`（默认 30）
  - 同时检测：
    - `WASM_OOM_HITS`
    - `UNHANDLED_REJECTION_HITS`
- 本轮门禁实测（`adaptiveLod + max=tactical + enableGlobalMaterialAttempt=true`）：
  - `averageFps≈16.53`
  - `recentFps≈16.51`
  - `averageSwitchDurationMs≈1.10ms`
  - `WASM_OOM_HITS=0`
  - `UNHANDLED_REJECTION_HITS=0`
  - 结果：`PERF GATE PASSED`
  - 截图：`lod_perf_gate_adaptiveLod_tactical.png`

### 0.18 下一阶段（矩阵化回归）进展（2026-02-14）
- 新增总控脚本：`tests/stage2_matrix.py`
  - 自动执行三组档位上限（`continental/regional/tactical`）：
    1. `tests/lod_switch_benchmark.py`
    2. `tests/lod_perf_gate.py`
  - 自动输出：
    - `docs/stage2_matrix_report.md`
    - `docs/stage2_matrix_report.json`
- 本轮矩阵结果（`STAGE2_PERF_DURATION_SECONDS=45`）：
  - `Cases=3, failed=0`
  - `continental`：Benchmark=PASS，CapCheck=PASS，PerfGate=PASS
  - `regional`：Benchmark=PASS，CapCheck=PASS，PerfGate=PASS
  - `tactical`：Benchmark=PASS，CapCheck=PASS，PerfGate=PASS
- 关键指标（报告摘录）：
  - `continental`: `Switch Count=2`, `averageFps≈20.04`
  - `regional`: `Switch Count=4`, `averageFps≈16.35`
  - `tactical`: `Switch Count=6`, `averageFps≈16.34`

### 0.19 高程回归修复（2026-02-14）
- 问题：
  - 默认配置 `stableGlobalBaseline + enableGlobalMaterialAttempt=false` 下，渲染走椭球地形。
  - 旧逻辑仅在“需要本地 terrain 渲染”时才加载 provider，导致高程查询链路也退化到椭球（表现为高程不准/接近 0）。
- 修复：
  - `TacticalViewer.initialize()` 在稳定基线模式下增加“后台预加载本地 terrain（仅供查询）”：
    - 渲染策略不变（仍是稳定 imagery 基线）
    - `DataManager` 可恢复使用真实地形 provider 做采样
- 回归门禁增强：
  - `tests/visual_verification.py` 新增可选断言环境变量：
    - `EXPECT_MODE`
    - `EXPECT_TERRAIN_PROVIDER`
    - `MIN_TERRAIN_SPAN`
  - 失败时返回非 0 并输出断言错误。
- 实测（默认基线）：
  - `EXPECT_MODE=STABLE_GLOBAL_IMAGERY_BASELINE`
  - `EXPECT_TERRAIN_PROVIDER=CesiumTerrainProvider`
  - `MIN_TERRAIN_SPAN=500`
  - 结果：通过（`span≈1110.62m`）

### 0.20 上线前收口（三件事）落地（2026-02-14）
- 运行策略固化（双配置模板）：
  - `public/config.stable.js`：上线默认稳定模板（`stableGlobalBaseline`）
  - `public/config.adaptive.js`：预发/灰度模板（`adaptiveLod`）
  - 切换命令：
    - `npm run config:stable`
    - `npm run config:adaptive`
- 一键回归命令：
  - `npm run gate:baseline:elevation`（默认基线高程门禁）
  - `npm run gate:stage2:matrix`（三档位 benchmark+perf 矩阵）
  - `npm run gate:stage2:soak`（长时稳定性回归）
- 人工视觉验收清单：
  - 文档：`docs/visual_acceptance_checklist.md`
  - 覆盖项：档位视觉可读性、高程一致性、失败判定与记录规范。

### 0.21 Tactical 画面“整片土黄”根因修复（2026-02-14）
- 现象：
  - `adaptive + tactical` 下状态显示已进入 tactical，但画面长期为平色土黄，几乎无起伏。
- 根因：
  - `initialize()` 尾部再次执行 `applyInitialView()`，把已进入 tactical 的相机重置回 `26000000m` 高空。
  - `configureTerrain()` 异步加载成功后仅切换 provider，未重新 `applyTheme()`，导致继续停留在 `terrain unavailable` 的 fallback imagery。
- 修复：
  - `src/core/TacticalViewer.ts`
    - 移除初始化尾部的重复 `applyInitialView()` 覆盖。
    - `configureTerrain()` 成功/失败后均重新 `applyTheme(this.currentTheme)`，确保 fallback 与真实材质状态同步。
    - tactical 相机安全阈值与可视化参数调整为低空斜视友好（降低最小高度、降低最小 zoom 距离）。
  - `src/config.ts`
    - `tacticalReliefFocus` 调整为 Nevada/东 Sierra 高起伏区域默认焦点（更符合 Red Flag 目标场景）。
  - `src/themes/tacticalMaterial.ts`
    - 强化 tactical 局部起伏可读性（高程映射范围、等高线权重、坡度对比增强）。
- 验证：
  - 新增 `tests/capture_tactical_view.py`（强制 tactical 抓图 + 中心 3x3 高程跨度）。
  - 验证日志显示：
    - `ThemeManager: Tactical material preset 'high' enabled`
    - `ThemeManager: globe.material attached=yes`
    - `ThemeManager: imagery layer count = 0`
    - `TerrainProbe span` 从 0（故障态）恢复到正值（示例约 `455m~2528m`，取决于视角）。

### 0.22 RedFlag 态势层接入（2026-02-14）
- 新增模块：
  - `src/core/TacticalOverlayManager.ts`
  - 内容：战术网格线、航线通道、动态空中航迹、地面阵位标绘（离线纯程序绘制，无外部资源依赖）。
- 生命周期接入：
  - `src/core/TacticalViewer.ts` 初始化后按配置启用态势层，销毁时清理。
- 配置化：
  - `src/config.ts` 新增 `tacticalOverlay`：
    - `enabled`
    - `scenario: 'redFlagDemo' | 'off'`
- 关键修正：
  - 初版网格使用矩形网格面会“盖平”地形视觉，已改为 `clampToGround` 线网格，只画线不铺面。
- 验证：
  - `npm run build`、`npm run lint` 通过。
  - 自动截图：`capture_tactical_view.png`（可见战术网格与航线要素）。

## 1. 项目定位
- 本项目是 E3 平台的战术可视化子系统，基于 Cesium 提供地形渲染、战术风格表达、HUD 态势信息展示。
- 目标不是“炫技 UI”，而是：稳定、可扩展、可配置、可联调。

## 2. 仓库与依赖关系
- 前端仓库：`e3-TCS`（当前仓库）
- 地形服务仓库：`../e3-gis`
- 关键联调链路：`e3-TCS -> http://localhost:4444/terrain/ -> e3-gis -> MBTiles`

## 3. 当前核心模块职责
- `src/core/TacticalViewer.ts`
  - Viewer 生命周期、地形接入、HUD 事件、缩放限制、全局地形回退。
- `src/themes/ThemeManager.ts`
  - Cesium 场景主题（tactical/satellite）切换。
- `src/themes/UiThemeManager.ts`
  - UI 主题包 token 下发（CSS 变量），禁止组件硬编码主题色。
- `src/themes/themePacks.ts`
  - 主题包注册中心（统一维护 UI token 与 tacticalStyle）。
- `src/data/DataManager.ts`
  - 高程查询与点位信息聚合（sampleTerrain + fallback）。
- `src/ui/HudManager.ts`
  - 原生 DOM HUD，支持 follow/docked，接收实时 metrics。
- `src/i18n/*`
  - i18next 国际化资源与管理器。
- `src/dev.ts`
  - 调试页面逻辑、控件绑定（语言/主题包/HUD 模式/诊断）。

## 4. 硬性开发规范（必须遵守）
- 交流、代码注释：中文。
- 运行时日志与错误输出：英文。
- 所有 UI 可见文案必须走 i18n（`i18n.t(...)`），禁止写死中英文。
- 所有主题色、面板色、HUD 色、控件色必须走 CSS 变量和 `UiThemeManager`，禁止硬编码。
- 业务参数“有 1% 变更可能”也必须配置化（优先放 `src/config.ts`）。
- 离线化是硬性约束：部署环境不可联网，严禁引入外部 CDN/在线字体/在线地图 API。
- 所有运行时资源必须本地化（`public/`、`dist/` 或内网服务），不得依赖公网可达性。
- 前后端通信仅允许环回地址或指定内网 IP。
- 修改 `src/**/*` 后必须执行：
  - `npm run lint`
  - `npm run build`

## 5. 国际化约定（i18next）
- 初始化：`await i18n.init(...)` 后再渲染依赖文案的 UI。
- 资源位置：`src/i18n/resources.ts`
- 新增语言步骤：
  1. 在 `AppConfig.i18n.supportedLanguages` 增加语言代码。
  2. 在 `resources` 增加对应语言完整词条。
  3. 在 UI 语言下拉中增加选项。

## 6. 主题系统约定
- 场景主题注册源：`src/config.ts -> ui.sceneThemes`（新增主题名只改这里，不改核心代码）
- 主题包配置源：`src/config.ts -> ui.themePacks`
- 主题包注册实现：`src/themes/themePacks.ts`
- 每个主题包必须同时包含：
  - `uiTokens`（UI 颜色/面板/控件/HUD 变量）
  - `tacticalStyle`（地形 shader 渲染参数）
- CSS 变量定义与通用类：`src/themes/variables.css`
- 运行时切换：`UiThemeManager.apply(themePack)` + `TacticalViewer.applyThemePack(themePack)`
- 场景主题切换：`TacticalViewer.applyTheme(sceneThemeName)`，内部按 `sceneThemes[sceneThemeName].renderMode` 分发
- 主题包模板工具：
  - 代码模板：`src/themes/themePackTemplate.ts`
  - CLI 生成：`npm run theme:template -- <newThemePackName>`
- 禁止做法：
  - 在 TS/HTML 内直接写 `#00f0ff`、`rgba(...)` 作为业务主题色。

## 7. 地形联调基线与已知关键坑
- 基线服务地址：`http://localhost:4444/terrain/`
- 快速重启脚本：`./tools/restart_server.sh`
- 核心已修复坑（高风险回归点）：
  - `scheme=tms` 与服务端 Y 翻转重复，导致“青藏高原变海洋负高程”。
  - 修复位置：`../e3-gis/src/main.cpp` 使用 `TerrainTileSource(mbtilesPath, false)`。
- 回归验证命令：
  - `node tools/terrain_probe.mjs`
  - 预期：青藏高原/珠峰高程为正值，深海为负值。

## 8. HUD 与交互约定
- HUD 更新采用“双通道”：
  - 鼠标移动同步快速更新（流畅）
  - 防抖异步精确回填（准确）
- HUD 必须展示：
  - 经纬度、高程、地形类型、声学参数
  - 缩放等级、比例尺、m/px
- 默认限制最大拉远：地球充满窗口后不允许继续变小（基于 `screenSpaceCameraController.maximumZoomDistance`）。

## 9. 提交前检查清单（每次改动都做）
- 功能检查：
  - 语言切换可即时生效。
  - 主题切换全局一致生效。
  - HUD 跟随模式位置正确、数据连续刷新。
  - 高原点位不再显示为海洋负高程。
- 工程检查：
  - `npm run lint` 通过。
  - `npm run build` 通过。
  - 不引入新的硬编码文案和硬编码主题色。
  - 若修改 LOD 切档逻辑，执行 `python tests/lod_switch_benchmark.py` 做基线观测。

## 10. 推荐开发模式（后续 Agent 按此执行）
1. 先定位：明确修改影响的模块边界（core/data/ui/themes/i18n）。
2. 再改配置：能放 `config.ts` 的参数先抽出，不直接写死。
3. 再改实现：小步提交，避免跨模块大爆改。
4. 强制自测：至少跑 lint/build + 关键路径人工验证。
5. 明确回执：给出改动文件、行为变化、未完成项和风险。
