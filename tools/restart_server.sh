#!/bin/bash

# Configuration
# Resolving Paths relative to the script location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
GIS_PROJECT_PATH="${PROJECT_ROOT}/../e3-gis"

# Default Values (can be overridden by Env Vars)
SERVER_BIN="${E3_SERVER_BIN:-${GIS_PROJECT_PATH}/build-macos-release/bin/e3_tile_server}"
# 默认指向最新的 octvertexnormals 数据，可通过 E3_TERRAIN_DATA 覆盖
MBTILES_FILE="${E3_TERRAIN_DATA:-/Users/wangshanping/terrain/webgis/e3_terrain_zoom9_octvertexnormals.mbtiles}"
PORT="${E3_SERVER_PORT:-4444}"
LOG_FILE="${GIS_PROJECT_PATH}/e3_tiles_server.log"
PID_FILE="${GIS_PROJECT_PATH}/server.pid"
FRONTEND_PID_FILE="${PROJECT_ROOT}/.vite.pid"
FRONTEND_LOG_FILE="/tmp/e3-tcs-vite.log"

# Web Server Configuration
WEB_PORT=5173

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[INFO] Project Root: ${PROJECT_ROOT}${NC}"

# --- 函数：进程管理 ---
is_pid_running() {
    local pid=$1
    kill -0 "$pid" > /dev/null 2>&1
}

process_matches() {
    local pid=$1
    local expected=$2
    local cmdline
    cmdline=$(ps -p "$pid" -o command= 2>/dev/null || true)
    [[ -n "$cmdline" && "$cmdline" == *"$expected"* ]]
}

terminate_pid() {
    local pid=$1
    local name=$2

    if ! is_pid_running "$pid"; then
        return 0
    fi

    echo -e "${YELLOW}[INFO] Stopping ${name} (PID: $pid) ...${NC}"
    kill "$pid" > /dev/null 2>&1 || true

    for i in {1..10}; do
        if ! is_pid_running "$pid"; then
            echo -e "${GREEN}[SUCCESS] ${name} stopped.${NC}"
            return 0
        fi
        sleep 0.5
    done

    echo -e "${RED}[WARN] ${name} did not exit, force killing (PID: $pid).${NC}"
    kill -9 "$pid" > /dev/null 2>&1 || true
}

stop_by_pid_file() {
    local pid_file=$1
    local expected=$2
    local name=$3

    if [ ! -f "$pid_file" ]; then
        return 0
    fi

    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    # PID 0 在 kill -0 语义下代表当前进程组，不能作为有效服务 PID。
    if [[ ! "$pid" =~ ^[1-9][0-9]*$ ]]; then
        echo -e "${YELLOW}[INFO] Invalid PID file ${pid_file}, removing.${NC}"
        rm -f "$pid_file"
        return 0
    fi

    if ! is_pid_running "$pid"; then
        echo -e "${YELLOW}[INFO] Stale PID file ${pid_file}, removing.${NC}"
        rm -f "$pid_file"
        return 0
    fi

    if ! process_matches "$pid" "$expected"; then
        echo -e "${RED}[WARN] PID $pid from ${pid_file} does not match expected process; skip kill for safety.${NC}"
        rm -f "$pid_file"
        return 0
    fi

    terminate_pid "$pid" "$name"
    rm -f "$pid_file"
}

# --- 1. Manage Backend Process ---
echo -e "${YELLOW}[INFO] Managing Backend Server...${NC}"

# Kill existing by PID file first
stop_by_pid_file "$PID_FILE" "$SERVER_BIN" "backend server"

# Fallback: kill orphan process only when command line strictly matches this project binary and port
ORPHAN_PIDS=$(pgrep -f "$SERVER_BIN" || true)
if [ -n "$ORPHAN_PIDS" ]; then
    for pid in $ORPHAN_PIDS; do
        if process_matches "$pid" "$SERVER_BIN" && process_matches "$pid" "-p $PORT"; then
            terminate_pid "$pid" "backend orphan"
        fi
    done
fi

# Check if binary exists
if [ ! -f "$SERVER_BIN" ]; then
    echo -e "${RED}[ERROR] Server binary not found at: $SERVER_BIN${NC}"
    echo "Please verify build."
    exit 1
fi

echo -e "${YELLOW}[INFO] Starting e3_tile_server...${NC}"
echo "Binary: $SERVER_BIN"
echo "Data:   $MBTILES_FILE"

# Start new server and save PID
# Note: The C++ server has a --background flag, but for PID management it's often easier to control from shell
# However, if the C++ binary daemonizes itself, it forks and the PID changes.
# Let's run it in foreground mode '&' effectively to capture the correct PID.
# We remove --background flag to keep it simple and controllable here.

"$SERVER_BIN" -f "$MBTILES_FILE" -p "$PORT" --log "$LOG_FILE" > /dev/null 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

# Verify start
sleep 1
if kill -0 "$NEW_PID" > /dev/null 2>&1; then
    echo -e "${GREEN}[SUCCESS] Server started (PID: $NEW_PID). Listening on port $PORT${NC}"
    echo "Logs: $LOG_FILE"
else
    echo -e "${RED}[ERROR] Server failed to start. Check logs at $LOG_FILE${NC}"
    exit 1
fi

# --- 2. Manage Frontend ---
echo -e "${YELLOW}[INFO] Managing Web Server...${NC}"

# Stop frontend started by this script
stop_by_pid_file "$FRONTEND_PID_FILE" "$PROJECT_ROOT" "frontend server"

# Check config file existence
if [ ! -f "${PROJECT_ROOT}/public/config.js" ]; then
    echo -e "${YELLOW}[WARN] public/config.js not found. Creating from example...${NC}"
    cp "${PROJECT_ROOT}/public/config.example.js" "${PROJECT_ROOT}/public/config.js"
fi

# Fallback: only stop process bound to WEB_PORT when cmdline belongs to this project and vite
PORT_PIDS=$(lsof -ti :"$WEB_PORT" 2>/dev/null || true)
if [ -n "$PORT_PIDS" ]; then
    for pid in $PORT_PIDS; do
        if process_matches "$pid" "$PROJECT_ROOT" && process_matches "$pid" "vite"; then
            terminate_pid "$pid" "frontend port-owner"
        else
            echo -e "${YELLOW}[INFO] Skip PID $pid on port $WEB_PORT (not this project's vite process).${NC}"
        fi
    done
fi

echo -e "${YELLOW}[INFO] Starting Vite...${NC}"
cd "$PROJECT_ROOT"
# 使用 nohup 保证脚本退出后 Vite 仍持续运行。
nohup npm run dev -- --host 0.0.0.0 --port "$WEB_PORT" > "$FRONTEND_LOG_FILE" 2>&1 &
echo "$!" > "$FRONTEND_PID_FILE"

# Verify Web Server
sleep 2
if lsof -i :$WEB_PORT > /dev/null; then
    echo -e "${GREEN}[SUCCESS] Web server started. Listening on http://localhost:$WEB_PORT${NC}"
    echo "Vite logs: $FRONTEND_LOG_FILE"
else
    echo -e "${RED}[ERROR] Web server failed to start.${NC}"
    echo "Check logs: $FRONTEND_LOG_FILE"
fi

echo -e "${GREEN}--- All services restarted successfully ---${NC}"
