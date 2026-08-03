#!/bin/bash
set -e

APP_DIR="/www/wwwroot/newapi-zack"
REPO="https://github.com/Zack052O/newapi-zack.git"

if [ -d "$APP_DIR/.git" ]; then
  echo "→ 更新代码..."
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  echo "→ 克隆代码..."
  rm -rf "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo "⚠️  请先编辑 .env 文件填入 MySQL 密码："
  echo "    vi $APP_DIR/.env"
  echo "    填好后重新运行此脚本：bash $APP_DIR/deploy.sh"
  exit 1
fi

echo "→ 停止旧容器..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
docker stop newapi-zack 2>/dev/null || true
docker rm newapi-zack 2>/dev/null || true

echo "→ 构建镜像（约 3-5 分钟）..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "✅ 部署完成！"
echo "容器状态："
docker compose -f docker-compose.prod.yml ps
echo ""
echo "日志：docker compose -f docker-compose.prod.yml logs -f"
echo "反代目标：http://127.0.0.1:3050"
