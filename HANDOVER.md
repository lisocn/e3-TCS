# HANDOVER

## 0. 当前结论（2026-02-15）
- 地形法线数据链路已闭环：`layer.json` 包含 `octvertexnormals`，前端 `CesiumTerrainProvider.hasVertexNormals=true`。
- 技术路线已收敛：
  - 保留 `adaptive LOD + normalEC` 主链路。
  - 不再使用“高度+梯度主导”渲染路线。
- 当前阶段目标：进入 RedFlag 风格精修（配色、岩层质感、等高线节奏、近中远景过渡）。

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
