# TODO (RedFlag Tactical Plan - New Gate)

## Mission
仅聚焦 `tactical` 档位，目标是让画面在 `wide` 与 `mudpit` 两个机位都收敛到 `RedFlag.jpg` 的复古战术风格。

## Effective Gate
唯一有效门禁：
- `tests/stage_gate_runner.py --level draft`
- `tests/stage_gate_runner.py --level target`
- `tests/stage_gate_runner.py --level final`

强制前置：
- `profile=tactical`
- `mpp in [175,195]`
- `wide + mudpit` 双机位同时判定

## Current Status
1. `draft`: passed
2. `target`: passed (2026-02-18 latest run)
3. `final`: passed (2026-02-18 latest run)

## Current Snapshot (final passed)
- `wide`:
  - `distance_score_current_to_ref ≈ 0.394`
  - `delta_e_mean ≈ 28.15`
  - `hue_dist_mean ≈ 0.0904`
  - `shadow_warmth_rel ≈ 0.234`
  - `shadow_brownness_rel ≈ 0.069`
- `mudpit`:
  - `distance_score_current_to_ref ≈ 0.432`
  - `plain_luma_mean_rel ≈ 0.401`
  - `plain_brown_ratio_rel ≈ 0.190`
  - `plain_highpass_std_rel ≈ 0.255`

## Next Actions
1. 固化当前参数与 shader 版本，避免回退。
2. 以当前 `final` 结果截图做视觉复核（wide + mudpit）。
3. 若需要继续逼近参考，可在不破坏 `final` 的前提下小步优化色差与阴影域。
