#!/usr/bin/env bash
# 本机执行：构建并把 dist 原子发布到服务器。
# 用法：SERVER=ubuntu@1.2.3.4 bash deploy/deploy.sh
set -euo pipefail

SERVER="${SERVER:?缺少 SERVER，例：SERVER=ubuntu@43.136.5.20}"
REMOTE_DIR="${REMOTE_DIR:-/srv/calisthenics}"
KEEP=3

cd "$(dirname "$0")/.."
mkdir -p .deploy
rm -f .deploy/dist.tar.gz

npm run build
tar -czf .deploy/dist.tar.gz -C frontend/dist .
scp -q .deploy/dist.tar.gz "$SERVER:$REMOTE_DIR/incoming/dist.tar.gz"

ssh "$SERVER" REMOTE_DIR="$REMOTE_DIR" KEEP="$KEEP" 'bash -s' <<'REMOTE'
set -eu
ts=$(date +%Y%m%d-%H%M%S)
cd "$REMOTE_DIR"
mkdir -p "releases/$ts"
tar -xzf "incoming/dist.tar.gz" -C "releases/$ts"

ln -sfn "releases/$ts" ".current.tmp"
mv -Tf ".current.tmp" current

live=$(readlink -f current)
kept=0
for d in $(ls -1dt releases/*/); do
  if [ "$(readlink -f "$d")" = "$live" ]; then
    continue
  fi
  kept=$((kept + 1))
  if [ "$kept" -gt "$KEEP" ]; then
    rm -rf "$d"
  fi
done
rm -f incoming/dist.tar.gz

echo "已发布 releases/$ts"
REMOTE
