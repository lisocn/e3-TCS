# HANDOVER

## 0. 当前结论（2026-02-15）
- 地形法线数据链路已闭环：`layer.json` 包含 `octvertexnormals`，前端 `CesiumTerrainProvider.hasVertexNormals=true`。
- 技术路线已收敛：
  - 保留 `adaptive LOD + normalEC` 主链路。
  - 不再使用“高度+梯度主导”渲染路线。
- 当前阶段目标：进入 RedFlag 风格精修（配色、岩层质感、等高线节奏、近中远景过渡）。

## 0.7 本轮续作（2026-02-17，档位边界与 tactical 运行约束）
- 用户确认并落地新的 4 档边界（基于 zoom9 + tactical 100m/px 约束）：
  - `global > 9000 m/px`
  - `continental: 2800 ~ 9000 m/px`
  - `regional: 700 ~ 2800 m/px`
  - `tactical: 100 ~ 700 m/px`
- 配置已更新：
  - 文件：`src/config.ts`
  - 字段：`terrain.mppThresholds = { global: 9000, continental: 2800, regional: 700 }`
- tactical 缩放守卫状态：
  - 文件：`src/core/TacticalViewer.ts`
  - 已改为 `wheel` capture 阶段拦截（输入前拦截），目标行为是“100m/px 附近继续放大不响应”，不再“先响应后 reset”。
  - 增加滚轮方向运行时自学习，兼容设备差异（重点针对 Mac 鼠标/触控滚轮方向不一致）。
- HUD 高程状态：
  - 鼠标移动过程不再实时刷新高程，改为短暂停留后精确刷新，避免移动过程错误负值。
- 当前重点从“强压 seam”转向“地表风格收敛”：
  - seam 问题在 zoom9 数据上只能止损，继续强抑制会明显牺牲细节。
  - 后续优先推进 tactical 的“砂砾颗粒 + 古铜/深褐”质感收敛。

## 0.8 本轮续作（2026-02-17，MPP 主轴量化验收）
- 本轮将验收口径改为“先看 m/px，再看图像指标”，避免尺度不一致导致误判。
- 量化前提：
  - 仅比较 `tactical` 档位截图。
  - 仅比较 `mpp in [175, 195]` 的样本。
  - 机位固定 `CAPTURE_ALIGN_REDFLAG=wide`。
- 指标定义（baseline=`tests/artifacts/capture_tactical_baseline_step0.png`）：
  1. `global_luma_mean`：全图亮度均值（可读性）。
  2. `global_luma_std`：全图亮度标准差（全局对比）。
  3. `global_edge_mean`：全图 Sobel 边缘均值（结构清晰度）。
  4. `plain_edge_mean`：平原窗口 Sobel 均值（泥/水平滑反指标）。
  5. `ridge_edge_mean`：山脊窗口 Sobel 均值（山脊锐利主指标）。
- 指标设计原因：
  - `mpp` 先对齐后再比图，避免“缩放差”掩盖真实渲染变化。
  - `ridge/plain` 分区指标可直接对应业务关注的“山脊锐利”与“平原不泥”。
  - 亮度均值/方差用于防止通过“压暗/提亮”伪造锐度。
- 当前进度（最新一轮，`mpp=182.24`, tactical）：
  - `ridge_edge_mean`: `-6.79%`
  - `plain_edge_mean`: `-6.24%`
  - `global_edge_mean`: `-4.19%`
  - `global_luma_mean`: `-2.96%`
- 阶段结论：
  - Step 1 尚未通过门槛（`ridge/plain` 仍低于 `-5%`）。
  - 但相较前几轮（约 `-10%` 级别）已明显收敛，方向有效，继续在 Step 1 迭代。

## 0.1 本轮续作（2026-02-16，颜色组）
- 已完成“颜色组”第一轮精修，且保持单路径架构不变（未重新引入实验开关）。
- 变更文件：
  - `src/themes/tacticalMaterial.ts`
  - `src/config.ts`
- 关键收敛：
  - 将 valley/ridge 配色混合与色调压缩参数提取为可配置项：
    - `valleyContourMix`
    - `ridgeAccentMix`
    - `toneGamma`
    - `toneShadowFloor`
    - `toneHighlightCeiling`
  - 在 `continental/regional/tactical` 三档中按颜色组目标做小幅调参：
    - 山脊/谷地对比增强
    - 明度高光上限压缩
    - 暗部保真抬升
- 验证结果：
  - `npm run lint` ✅
  - `npm run build` ✅
  - `tests/capture_tactical_view.py` ✅
    - 输出：`tests/artifacts/capture_tactical_view.png`
    - LOD 最终状态：`tactical`（`mpp≈12.07`）
    - `hasVertexNormals=true`，`extensions` 含 `octvertexnormals`

## 0.2 本轮续作（2026-02-16，RedFlag 对照去虚线）
- 对照 `RedFlag.jpg` 后识别的主要差距：
  1. 地表存在规则化斑驳/虚线感（高频方向性纹理导致）。
  2. 轮廓线在部分区域出现点状断续，连续性不足。
  3. 与参考图相比，当前仍缺少战术网格与空地目标符号层（后续做 overlay 组）。
- 本轮代码修正：
  - 文件：`src/themes/tacticalMaterial.ts`
  - 将方向性 `sin(uv.x*a + uv.y*b)` 纹理替换为 `value-noise/fbm`，消除大面积平行条纹伪影。
  - 重构 contour 生成与抗锯齿：使用更平滑的 contour 场并调整线宽/AA，降低点状断续。
  - 线色改为暖亮轮廓混色（`contourLineColor`），避免暗色虚点观感。
  - 下调法线边缘增强强度，减少三角网边线被过度点亮。
  - tactical 档位 contour 参数同步回调：
    - `contourInterval: 56.0`
    - `contourThickness: 2.6`
- 验证：
  - `npm run lint` ✅
  - `npm run build` ✅
  - `tests/capture_tactical_view.py` ✅（新截图已覆盖 `tests/artifacts/capture_tactical_view.png`）

## 0.3 本轮续作（2026-02-16，RedFlag 机位对齐）
- 目标：把视角先对齐到参考图，再做风格差距收敛。
- 新增能力：
  - `TacticalViewer.alignToRedFlagReference()` 支持双机位：
    - `variant: 'wide'`：用于整体构图对照（推荐）
    - `variant: 'focus'`：用于细节对照
  - `TacticalViewer.clearTacticalOverlay()`：清理 RedFlag 叠加层
  - Dev 全局接口：
    - `window.alignRedFlagReference('wide' | 'focus')`
    - `window.clearRedFlagOverlay()`
    - `window.getCameraPose()`
  - Dev 面板按钮：
    - “对齐 RedFlag 视角”（默认应用 `wide`）
- 脚本增强：
  - `tests/capture_tactical_view.py` 新增环境变量
    - `CAPTURE_ALIGN_REDFLAG=wide|focus`
    - 用于直接生成对齐机位截图，方便回归比对
- 实测产物：
  - `tests/artifacts/capture_tactical_view.png`（wide）
  - `tests/artifacts/capture_redflag_focus.png`（focus）
- 当前结论：
  - `wide` 机位已将 RedFlag 演示区域（网格+走廊+单元）稳定对准，适合作为后续材质差距对照基线。

## 0.4 本轮续作（2026-02-16，基于对齐机位的收敛）
- 目标：在 `CAPTURE_ALIGN_REDFLAG=wide` 基线下，继续缩小与 `RedFlag.jpg` 的视觉差距。
- 本轮调整：
  1. 光照组（`src/themes/tacticalMaterial.ts`）
     - 提升侧光方向明暗分离：加强阳坡高光、加深阴坡暗部。
     - 提高地形形态权重（slope 主导）与 relief/cavity 对比。
     - 优化最终色调压缩，强化山脊体积感。
  2. 配色组（`src/config.ts`）
     - `continental/regional` 调整为更暖的黄棕主色。
     - 同步调整 `toneGamma/toneShadowFloor/toneHighlightCeiling`，扩大明暗动态范围。
  3. 视效组（`src/core/TacticalViewer.ts`）
     - 提升 `continental/regional` 的 `verticalExaggeration`，降低 `maximumScreenSpaceError`，增强中远景起伏层次。
  4. 叠加层组（`src/core/TacticalOverlayManager.ts`）
     - 地面网格从青色改为琥珀色，收敛到参考图风格。
     - 蓝色走廊适度加粗，强化“航迹走廊”主视觉。
- 验证：
  - `npm run lint` ✅
  - `npm run build` ✅
  - `CAPTURE_ALIGN_REDFLAG=wide tests/capture_tactical_view.py` ✅
  - 新截图：`tests/artifacts/capture_tactical_view.png`（已覆盖）

## 0.5 本轮续作（2026-02-16，远山高光层次）
- 目标：在不改“单位符号/航迹”语义前提下，提升中远景山脊高光层次，对齐 `RedFlag.jpg` 的山体光影关系。
- 主要改动：
  1. 材质层（`src/themes/tacticalMaterial.ts`）
     - 新增中远距脊线高光/阴影通道（`ridgeSunColor + distanceRidgeBoost + ridgeSunMask + ridgeShadowMask`）。
     - 调整 `colorFar` 基底亮度，避免远景整体过暗导致层次丢失。
     - 通过 `mid/far` 权重分别注入脊线高光与背光压暗，强化“远山光带”。
  2. 配置层（`src/config.ts`）
     - `continental/regional` 的 `colorRidge` 进一步偏暖提亮。
     - `toneHighlightCeiling` 上调，提升远景阳坡亮部可见性。
- 验证：
  - `npm run lint` ✅
  - `npm run build` ✅
  - `CAPTURE_ALIGN_REDFLAG=wide tests/capture_tactical_view.py` ✅
  - 新截图：`tests/artifacts/capture_tactical_view.png`（已覆盖）
- 当前观测：
  - 远处山脊亮带与背光分离度提升，画面层次更接近参考图；
  - 仍可继续微调项：远山亮带强度与网格透明度平衡，避免“亮带过硬”。

## 0.6 本轮续作（2026-02-16，亮带软化与网格降权）
- 目标：继续收敛远山高光，但避免“高光硬边”与“网格抢画面”。
- 调整内容：
  1. 材质层（`src/themes/tacticalMaterial.ts`）
     - 下调中远景脊线高光增益（`midRidgeGain/farRidgeGain`）。
     - 新增 `ridgeSunSoft`，在尖锐脊线处软化高光。
     - 同步减弱中远景脊线阴影压暗幅度，保留细节。
  2. 叠加层（`src/core/TacticalOverlayManager.ts`）
     - 网格透明度从 `0.44` 降至 `0.30`。
     - 网格线宽从 `1.25` 降至 `1.15`。
- 验证：
  - `npm run lint` ✅
  - `npm run build` ✅
  - `E3_APP_URL=http://localhost:5174 CAPTURE_ALIGN_REDFLAG=wide tests/capture_tactical_view.py` ✅
  - 新截图：`tests/artifacts/capture_tactical_view.png`（已覆盖）

## 1. 本轮已完成的代码收敛

### 1.1 配置层（移除实验分叉）
- 文件：`src/config.ts`
- 已移除：
  - `stableGlobalBaseline`
  - `enableGlobalMaterialAttempt`
  - `forceProfile`
  - `adaptiveLodMaxProfile`
  - 相关运行时实验字段与分支逻辑
- 保留：
  - 单一路径配置：`adaptive LOD`
  - `mppThresholds` + `lodProfiles`
  - `enableGlobalFallback`（高空回退椭球，保留稳定性）

### 1.2 Viewer 层（移除实验状态机）
- 文件：`src/core/TacticalViewer.ts`
- 已移除：
  - stable/global experiment 相关状态与判断
  - `forceProfile`、LOD cap 钳制等实验控制
  - tactical 自动演示聚焦开关依赖
- 保留：
  - `adaptive LOD` 自动切档
  - OOM 安全降级（`SAFE_GLOBAL_FALLBACK_WASM_OOM`）
  - 高空椭球回退与地形就绪后重套主题

### 1.3 主题层（移除实验贴图通道）
- 文件：`src/themes/ThemeManager.ts`
- 已移除：
  - tacticalDetailImagery 低透明叠层
  - debug overlay imagery 诊断层
- 当前策略：
  - tactical 仅保留正式材质与必要 fallback imagery。

### 1.4 材质层（单一路径）
- 文件：`src/themes/tacticalMaterial.ts`
- 已收敛为单一正式材质：
  - 以 `normalEC + lambert + slope + normal variation` 驱动
  - 保留 contour/macro/micro 与近中远景过渡
- 已移除：
  - 高度链路依赖（`materialInput.height` 主导）
  - 实验性 debug 材质分支

### 1.5 测试脚本（移除实验参数注入）
- 文件：
  - `tests/capture_tactical_view.py`
  - `tests/visual_verification.py`
  - `tests/lod_switch_benchmark.py`
  - `tests/lod_perf_gate.py`
  - `tests/lod_soak_test.py`
  - `tests/stage2_matrix.py`
- 已移除：实验性运行时注入参数（`forceProfile / terrainOperationMode / adaptiveLodMaxProfile / enableGlobalMaterialAttempt`）与对应验证分支。

### 1.6 运行脚本
- 文件：`tools/restart_server.sh`
- 默认地形数据已切到最新：
  - `/Users/wangshanping/terrain/webgis/e3_terrain_zoom9_octvertexnormals.mbtiles`
- Vite 启动逻辑已修复：
  - 使用 `nohup` 保持驻留
  - PID=0 视为非法，避免误判

## 2. 当前关键链路
- 前端：`e3-TCS`
- 地形服务：`../e3-gis`
- 数据链路：`e3-TCS -> http://localhost:4444/terrain/ -> e3-gis -> MBTiles(含 octvertexnormals)`

## 3. 快速验证命令

### 3.1 启动
```bash
./tools/restart_server.sh
```

### 3.2 基础连通
```bash
curl -i http://localhost:4444/terrain/layer.json
curl -i http://localhost:5173
```

### 3.3 视觉验收
```bash
/Users/wangshanping/_code/e3-TCS/.venv/bin/python /Users/wangshanping/_code/e3-TCS/tests/capture_tactical_view.py
```
- 默认截图输出目录：`tests/artifacts/`

### 3.4 质量门禁
```bash
npm run lint
npm run build
```

### 3.5 清理测试截图
```bash
npm run test:artifacts:clean
```

## 4. 下一阶段（RedFlag 精修）
按“每次只动一组参数”的方式推进：
1. 颜色组：谷地/山脊对比、明度压缩曲线、暗部保真。
2. 光照组：lambert 权重、cavity 抑制、边缘增强幅度。
3. 纹理组：macro/micro 频率与强度，避免规则条纹。
4. 等高线组：间隔与线宽，确保“辅助可读”而非“主视觉噪声”。
5. 近中远景组：LOD 过渡平滑，避免切换观感突变。

## 5. 注意事项
- 本仓库当前有多文件未提交改动，提交前先按功能分组检查 diff。
- 不要重新引入旧实验开关，保持单路径可维护性。
- 若再次出现 OOM，以稳定性优先，先保留安全降级再分析性能瓶颈。
