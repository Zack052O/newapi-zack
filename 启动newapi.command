#!/bin/bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$HOME/go-sdk/go/bin:$HOME/go/bin:$PATH"
cd /Volumes/T7/VUE/newapi

echo "正在启动 New-API 本地开发环境..."
echo ""

# 创建占位文件（如果不存在）
mkdir -p web/dist
[ -f web/dist/index.html ] || echo '<!doctype html><html><head><title>dev</title></head><body>use frontend dev server</body></html>' > web/dist/index.html

# 启动后端
export SQL_DSN=""
export PORT=3000
nohup go run main.go > /tmp/newapi-api.log 2>&1 &
API_PID=$!
echo "后端启动中 (PID: $API_PID)..."

# 等后端就绪
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "" http://localhost:3000/api/setup 2>/dev/null; then
    echo "✅ 后端就绪 → http://localhost:3000"
    break
  fi
  sleep 2
done

# 启动前端
cd /Volumes/T7/VUE/newapi/web
nohup bun run dev --host 0.0.0.0 --port 3050 > /tmp/newapi-dev.log 2>&1 &
WEB_PID=$!
echo "前端启动中 (PID: $WEB_PID)..."

# 等前端就绪
for i in $(seq 1 15); do
  if curl -s -o /dev/null -w "" http://localhost:3050 2>/dev/null; then
    echo "✅ 前端就绪 → http://localhost:3050"
    break
  fi
  sleep 2
done

echo ""
echo "══════════════════════════════════════"
echo "  New-API 本地开发环境已启动"
echo "  前端: http://localhost:3050"
echo "  后端: http://localhost:3000"
echo "  数据库: SQLite（不影响线上）"
echo "══════════════════════════════════════"
echo ""

# 打开浏览器
open http://localhost:3050

echo "按回车关闭此窗口（项目继续运行）"
read
