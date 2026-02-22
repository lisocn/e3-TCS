#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${ROOT_DIR}/tests/artifacts/auto_tune_watchdog.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "watchdog pid file not found"
  exit 0
fi

pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
if [[ -z "${pid}" ]]; then
  echo "pid file empty"
  rm -f "${PID_FILE}"
  exit 0
fi

if kill -0 "${pid}" 2>/dev/null; then
  kill "${pid}" 2>/dev/null || true
  sleep 1
  if kill -0 "${pid}" 2>/dev/null; then
    kill -9 "${pid}" 2>/dev/null || true
  fi
  echo "watchdog stopped pid=${pid}"
else
  echo "watchdog not running"
fi

rm -f "${PID_FILE}"
