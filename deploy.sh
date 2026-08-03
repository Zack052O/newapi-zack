#!/bin/bash
set -e

APP_DIR="/www/wwwroot/newapi-zack"
REPO="https://github.com/Zack052O/newapi-zack.git"

# 自动从宝塔配置读取 MySQL root 密码
BT_MYSQL_PASS=""
if [ -f /www/server/panel/data/default.pl ]; then
  BT_MYSQL_PASS=$(cat /www/server/panel/data/default.pl 2>/dev/null)
fi

echo "→ 拉取代码..."
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "→ 配置 .env..."
cp -n .env.example .env

if [ -n "$BT_MYSQL_PASS" ]; then
  sed -i "s/YOUR_MYSQL_PASSWORD/$BT_MYSQL_PASS/g" .env
  echo "  MySQL 密码已从宝塔配置自动填入"
fi

SESSION_SECRET=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
sed -i "s/CHANGE_ME_TO_RANDOM_STRING/$SESSION_SECRET/g" .env

echo "→ 停止旧容器..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
docker stop newapi-zack 2>/dev/null || true
docker rm newapi-zack 2>/dev/null || true

echo "→ 构建镜像（约 3-5 分钟）..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "✅ 部署完成！"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "反代目标: http://127.0.0.1:3050"
echo "查看日志: docker compose -f docker-compose.prod.yml logs -f"
