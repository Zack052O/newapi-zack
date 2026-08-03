#!/bin/bash
echo "正在关闭 New-API 本地开发环境..."

# 停前端
FRONT_PIDS=$(lsof -t -i :3050 2>/dev/null)
if [ -n "$FRONT_PIDS" ]; then
  kill $FRONT_PIDS 2>/dev/null
  echo "✅ 前端已停止 (端口 3050)"
else
  echo "— 前端未在运行"
fi

# 停后端
API_PIDS=$(lsof -t -i :3000 2>/dev/null)
if [ -n "$API_PIDS" ]; then
  kill $API_PIDS 2>/dev/null
  echo "✅ 后端已停止 (端口 3000)"
else
  echo "— 后端未在运行"
fi

# 清理 go run 子进程
pkill -f "go run main.go" 2>/dev/null
pkill -f "/new-api$" 2>/dev/null

echo ""
echo "══════════════════════════════════════"
echo "  New-API 本地开发环境已关闭"
echo "══════════════════════════════════════"
echo ""
echo "按回车关闭此窗口"
read
