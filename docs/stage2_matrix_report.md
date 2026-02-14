# Stage2 Matrix Report

Generated at: 2026-02-14 19:17:28

| Profile | Benchmark | Cap Check | Perf Gate |
|---|---:|---:|---:|
| continental | PASS | PASS | PASS |
| regional | PASS | PASS | PASS |
| tactical | PASS | PASS | PASS |

## Details

### continental
- benchmark_rc: 0
- Switch Count: 2
- Switch Sequence: ['continental', 'global']
- cap_check: True
- perf_rc: 0
- perf_passed: True
- Mode: ADAPTIVE_LOD
- LOD State: {'profile': 'continental', 'metersPerPixel': 125.76652471249686}
- Perf: {'averageFps': 20.03745950323848, 'recentFps': 22.347454333398172, 'sampleSeconds': 47.41120000000298}

### regional
- benchmark_rc: 0
- Switch Count: 4
- Switch Sequence: ['continental', 'regional', 'continental', 'global']
- cap_check: True
- perf_rc: 0
- perf_passed: True
- Mode: ADAPTIVE_LOD
- LOD State: {'profile': 'regional', 'metersPerPixel': 125.76652471260951}
- Perf: {'averageFps': 16.35493803061325, 'recentFps': 17.124916753974002, 'sampleSeconds': 47.38629999999702}

### tactical
- benchmark_rc: 0
- Switch Count: 6
- Switch Sequence: ['continental', 'regional', 'tactical', 'regional', 'continental', 'global']
- cap_check: True
- perf_rc: 0
- perf_passed: True
- Mode: ADAPTIVE_LOD
- LOD State: {'profile': 'tactical', 'metersPerPixel': 125.76652471260951}
- Perf: {'averageFps': 16.336202828952196, 'recentFps': 17.84475066912543, 'sampleSeconds': 47.6855}

