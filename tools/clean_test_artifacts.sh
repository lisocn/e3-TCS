#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ARTIFACT_DIR="${PROJECT_ROOT}/tests/artifacts"

mkdir -p "$ARTIFACT_DIR"

before_count="$(find "$ARTIFACT_DIR" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \) | wc -l | tr -d ' ')"
find "$ARTIFACT_DIR" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \) -delete

removed_legacy=0

for file in \
    "${PROJECT_ROOT}/diagnostic_report.png" \
    "${PROJECT_ROOT}/capture_tactical_view.png" \
    "${PROJECT_ROOT}/lod_switch_benchmark.png" \
    "${PROJECT_ROOT}/lod_perf_gate.png"; do
    if [[ -f "$file" ]]; then
        rm -f "$file"
        removed_legacy=$((removed_legacy + 1))
    fi
done

shopt -s nullglob
for file in "${PROJECT_ROOT}"/lod_soak_round*.png; do
    rm -f "$file"
    removed_legacy=$((removed_legacy + 1))
done
shopt -u nullglob

echo "[INFO] Removed artifacts from tests/artifacts: ${before_count}"
echo "[INFO] Removed legacy root screenshots: ${removed_legacy}"
