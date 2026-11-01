#!/usr/bin/env bash
# 服务器执行：设置或更换看板登录口令，口令只在当前终端输入，不落历史也不进配置文件。
# 用法：sudo bash deploy/set-auth.sh <用户名>
set -euo pipefail

AUTH_USER="${1:?用法：sudo bash deploy/set-auth.sh <用户名>}"
[ -n "$AUTH_USER" ] || { echo "用户名不能为空"; exit 1; }
HTPASSWD=/etc/nginx/calisthenics.htpasswd

if id -u www-data >/dev/null 2>&1; then
  WEB_GROUP=www-data
else
  WEB_GROUP=nginx
fi

read -rsp "为 $AUTH_USER 设置登录密码: " PASS1
echo
read -rsp "再输一次: " PASS2
echo
if [ "$PASS1" != "$PASS2" ]; then
  echo "两次输入不一致"
  exit 1
fi
if [ "${#PASS1}" -lt 8 ]; then
  echo "口令至少 8 位"
  exit 1
fi

printf '%s:%s\n' "$AUTH_USER" "$(openssl passwd -6 "$PASS1")" > "$HTPASSWD"
unset PASS1 PASS2
chmod 640 "$HTPASSWD"
chown "root:$WEB_GROUP" "$HTPASSWD"

echo "已写入 $HTPASSWD，nginx 每次请求都重新读取，立即生效。"
