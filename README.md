# e3-TCS

e3-TCS 是 E3 平台的战术可视化子项目，负责基于 Cesium 的场景编辑、推演与态势标绘相关 GIS 能力。

## 项目约束

### 1) 交流与注释
- 所有协作交流、文档、代码注释使用中文。
- 运行时日志、调试输出、错误信息保持英文（避免编码问题，便于日志工具处理）。
- 提交信息使用中文。

### 2) 离线化与本地化
- 禁止外部 CDN（JS/CSS/字体）。
- 资源（字体、图标、第三方静态文件）必须本地化。
- 地图底图/高程/样式走本地服务与本地数据，不调用在线地图 API。
- 前后端通信仅限 `127.0.0.1` 或指定内网地址。

### 3) 配置驱动
- 业务参数统一放在 `src/config.ts`，避免硬编码。
- 样式统一走 `src/themes/` 与 CSS 变量。
- UI 可见文本必须走国际化。

### 4) 质量门禁
- 严格类型检查（`strict`）。
- 提交前必须通过：
  - `npm run build`
  - `npm run lint`

## Tactical RedFlag 新门禁（2026-02-18 起）

旧的 Step1~Step5 验收口径已废弃。当前仅围绕 `RedFlag.jpg` 建立单一目标门禁。

### 验收前提（强制）
- 仅 `tactical` 档位。
- `mpp in [175,195]`。
- 同时验证两个机位：
  - `wide`（全局结构/阴影风格）
  - `mudpit`（平原去泥与频率分布）

### 新门禁等级
- `draft`：风格方向正确，可继续迭代。
- `target`：开发主线门禁，作为默认目标。
- `final`：最终交付门禁。

### 统一门禁脚本
```bash
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level target
```

可选：
```bash
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level draft
/Users/wangshanping/_code/e3-TCS/.venv/bin/python tests/stage_gate_runner.py --level final
```

### 评价维度（RedFlag-centric）
- `wide`：`distance_score_current_to_ref`、`delta_e_mean`、`hue_dist_mean`、`global_edge_rel`、`ridge_edge_rel`、`shadow_brownness_rel`、`shadow_warmth_rel`。
- `mudpit`：`distance_score_current_to_ref`、`plain_luma_mean_rel`、`plain_sat_std_rel`、`plain_brown_ratio_rel`、`plain_lowfreq_ratio_rel`、`plain_highpass_std_rel`。

## 相关文档
- 当前阶段计划与状态：`TODO.md`
- 当前有效交接信息：`HANDOVER.md`

