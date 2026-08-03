#!/bin/bash
# ============================================================
# New-API 本地开发启动脚本
# ============================================================
# 用法:
#   ./dev.sh          — 同时启动前端+后端
#   ./dev.sh web       — 只启动前端（热更新，改前端代码即时生效）
#   ./dev.sh api       — 只启动后端
#   ./dev.sh proxy     — 前端连接线上 API（不需要本地后端）
# ============================================================

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$HOME/go-sdk/go/bin:$HOME/go/bin:$PATH"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$ROOT_DIR/web"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_banner() {
  echo -e "${GREEN}"
  echo "  ╔═══════════════════════════════════════════════╗"
  echo "  ║          New-API 本地开发环境                ║"
  echo "  ╚═══════════════════════════════════════════════╝"
  echo -e "${NC}"
}

start_web() {
  echo -e "${BLUE}→ 启动前端开发服务器 (HMR 热更新)...${NC}"
  cd "$WEB_DIR"
  bun run dev --host 0.0.0.0 --port 3050
}

start_web_proxy() {
  echo -e "${YELLOW}→ 启动前端（API 代理到 newapi.zackary.cn）...${NC}"
  cd "$WEB_DIR"
  VITE_REACT_APP_SERVER_URL=https://newapi.zackary.cn bun run dev --host 0.0.0.0 --port 3050
}

start_api() {
  echo -e "${BLUE}→ 启动后端 (Go, SQLite)...${NC}"
  cd "$ROOT_DIR"
  # 使用 SQLite，不需要 MySQL
  export SQL_DSN=""
  export PORT=3000
  go run main.go
}

start_all() {
  print_banner
  
  # 启动后端（后台）
  echo -e "${BLUE}→ [1/2] 启动后端...${NC}"
  cd "$ROOT_DIR"
  export SQL_DSN=""
  export PORT=3000
  go run main.go &
  API_PID=$!
  echo -e "${GREEN}  后端 PID: $API_PID (localhost:3000)${NC}"
  
  # 等后端启动
  sleep 3
  
  # 启动前端（前台）
  echo -e "${BLUE}→ [2/2] 启动前端...${NC}"
  cd "$WEB_DIR"
  bun run dev --host 0.0.0.0 --port 3050 &
  WEB_PID=$!
  echo -e "${GREEN}  前端 PID: $WEB_PID (localhost:3050)${NC}"
  
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  前端: http://localhost:3050${NC}"
  echo -e "${GREEN}  后端: http://localhost:3000${NC}"
  echo -e "${GREEN}  按 Ctrl+C 停止所有服务${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════${NC}"
  
  # 捕获退出信号
  trap "kill $API_PID $WEB_PID 2>/dev/null; exit" INT TERM
  wait
}

case "${1:-all}" in
  web)
    print_banner
    start_web
    ;;
  proxy)
    print_banner
    start_web_proxy
    ;;
  api)
    print_banner
    start_api
    ;;
  all|"")
    start_all
    ;;
  *)
    echo "用法: $0 [web|api|proxy|all]"
    echo "  web   — 只启动前端（需要后端在运行）"
    echo "  proxy — 前端连接线上 API（不需要本地后端）"
    echo "  api   — 只启动后端"
    echo "  all   — 同时启动前后端（默认）"
    exit 1
    ;;
esac
