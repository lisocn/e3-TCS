#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/tests/artifacts/auto_tune_watchdog.pid"
LOG_FILE="${ROOT_DIR}/tests/artifacts/auto_tune_watchdog.log"
APP_URL="${E3_APP_URL:-http://localhost:5173}"
TERRAIN_URL="${E3_TERRAIN_LAYER_JSON_URL:-http://localhost:4444/terrain/layer.json}"

mkdir -p "${ROOT_DIR}/tests/artifacts"

if [[ -f "${PID_FILE}" ]]; then
  old_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
    echo "watchdog already running pid=${old_pid}"
    exit 0
  fi
fi

check_http_200() {
  local url="$1"
  local code
  local try=0
  while [[ "${try}" -lt 20 ]]; do
    code="$(curl --max-time 4 -s -o /dev/null -w '%{http_code}' "${url}" || true)"
    if [[ "${code}" == "200" ]]; then
      return 0
    fi
    try=$((try + 1))
    sleep 1
  done
  # macOS 上 localhost 偶发返回 000，兜底再测一次 127.0.0.1
  if [[ "${url}" == http://localhost:* ]]; then
    local alt
    alt="${url/http:\/\/localhost/http:\/\/127.0.0.1}"
    code="$(curl --max-time 4 -s -o /dev/null -w '%{http_code}' "${alt}" || true)"
    [[ "${code}" == "200" ]]
    return
  fi
  return 1
}

if [[ "${AUTO_RESTART_SERVERS:-false}" == "true" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] preflight: restart_server.sh begin" >> "${LOG_FILE}"
  if "${ROOT_DIR}/tools/restart_server.sh" >> "${LOG_FILE}" 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] preflight: restart_server.sh done" >> "${LOG_FILE}"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] preflight: restart_server.sh failed, continue watchdog" >> "${LOG_FILE}"
  fi
fi

if [[ "${SKIP_HEALTHCHECK:-false}" != "true" ]]; then
  if ! check_http_200 "${APP_URL}"; then
    echo "watchdog aborted: app unhealthy (${APP_URL})"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] preflight: app unhealthy ${APP_URL}" >> "${LOG_FILE}"
    exit 1
  fi

  if ! check_http_200 "${TERRAIN_URL}"; then
    echo "watchdog aborted: terrain unhealthy (${TERRAIN_URL})"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] preflight: terrain unhealthy ${TERRAIN_URL}" >> "${LOG_FILE}"
    exit 1
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] preflight: healthcheck skipped by SKIP_HEALTHCHECK=true" >> "${LOG_FILE}"
fi

nohup "${ROOT_DIR}/.venv/bin/python" "${ROOT_DIR}/tools/autotune_watchdog.py" \
  --level final \
  --max-evals 24 \
  --verify-runs 1 \
  --keep-running \
  --timeout-seconds 2400 \
  --max-rss-mb 1800 \
  --sleep-seconds 20 \
  >> "${LOG_FILE}" 2>&1 &

new_pid="$!"
echo "${new_pid}" > "${PID_FILE}"
echo "watchdog started pid=${new_pid}"
echo "log=${LOG_FILE}"
