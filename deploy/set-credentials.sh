#!/usr/bin/env bash
# 服务器执行一次：写入 DNSPod API 凭证。口令与密钥只在当前终端输入，不落 shell 历史。
# 用法：sudo bash deploy/set-credentials.sh
set -euo pipefail

CRED=/etc/letsencrypt/dnspod-credentials.json

read -rsp "腾讯云 SecretId: " SECRET_ID
echo
read -rsp "腾讯云 SecretKey: " SECRET_KEY
echo
if [ -z "$SECRET_ID" ] || [ -z "$SECRET_KEY" ]; then
  echo "SecretId 或 SecretKey 为空"
  exit 1
fi

mkdir -p "$(dirname "$CRED")"
printf '{"SecretId": "%s", "SecretKey": "%s"}\n' "$SECRET_ID" "$SECRET_KEY" > "$CRED"
unset SECRET_ID SECRET_KEY
chmod 600 "$CRED"
chown root:root "$CRED"

echo "已写入 $CRED（root 600）。建议该密钥只授予 DNSPod 解析权限。"
