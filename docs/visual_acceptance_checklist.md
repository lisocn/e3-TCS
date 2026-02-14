# Visual Acceptance Checklist

## 1. 执行前准备
- 使用 `npm run config:stable` 或 `npm run config:adaptive` 选择目标配置。
- 启动：`npm run dev -- --host 0.0.0.0 --port 5173`。
- 清理浏览器缓存并强刷页面，确保 `public/config.js` 生效。

## 2. 基础可见性（必须通过）
- 地球不黑屏、不闪烁、不出现大面积破洞。
- HUD 数值持续刷新，无明显卡死。
- 状态栏 `Mode` 与预期配置一致。

## 3. 档位视觉验收（adaptiveLod）
- `continental`：
  - 海陆分层可辨识。
  - 不应出现纯色球或大面积灰黑覆盖。
- `regional`：
  - 地形层次比 continental 更明显。
  - 视角移动时无突发大面积纹理错乱。
- `tactical`：
  - 近景地形细节可读，边界无明显撕裂。
  - 连续缩放不出现持续闪烁。

## 4. 高程一致性抽样（必须通过）
- 中国中心点附近抽样高程为正值（非 0 常量）。
- 海域抽样高程应为负值。
- HUD 快速值与精确回填值不应长期偏离。

## 5. 失败判定（任一即失败）
- 出现 `WebAssembly.instantiate OOM`。
- 控制台持续 `unhandledrejection` 刷屏。
- 档位切换后画面长期退化为不可读纯色球。
- 高程持续接近常量 0 且与已知地形不符。

## 6. 记录要求
- 保存截图（每个档位至少一张）。
- 记录 `Mode`、`LOD`、关键日志和复现步骤。
- 记录机器配置与浏览器版本，便于横向比对。
