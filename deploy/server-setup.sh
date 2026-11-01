#!/usr/bin/env bash
# 服务器执行一次：装 SDK 依赖、DNS-01 签证书、挂站点。只新增 conf.d 一个文件并 reload nginx。
# 前置：DNSPod 已解析该子域，且 /etc/letsencrypt/dnspod-credentials.json 已写好 API 凭证。
# 用法：sudo DOMAIN=train.f1nnian.site bash deploy/server-setup.sh
set -euo pipefail

DOMAIN="${DOMAIN:?缺少 DOMAIN，例：DOMAIN=train.f1nnian.site}"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REMOTE_DIR=/srv/calisthenics
HTPASSWD=/etc/nginx/calisthenics.htpasswd
CONF=/etc/nginx/conf.d/calisthenics.conf
CRED=/etc/letsencrypt/dnspod-credentials.json
VENV=/opt/dnspod-dns01
HOOK=/etc/letsencrypt/dns01-hook.py
PIP_MIRROR=https://mirrors.cloud.tencent.com/pypi/simple

command -v apt-get >/dev/null 2>&1 || { echo "需要 Debian/Ubuntu 的 apt-get"; exit 1; }
[ -f "$SCRIPT_DIR/dns01-hook.py" ] || { echo "缺少 $SCRIPT_DIR/dns01-hook.py"; exit 1; }
if [ ! -f "$CRED" ]; then
  echo "缺少 $CRED，先执行：sudo bash $SCRIPT_DIR/set-credentials.sh"
  exit 1
fi

apt-get update -qq
command -v nginx >/dev/null 2>&1 || apt-get install -y nginx
command -v certbot >/dev/null 2>&1 || apt-get install -y certbot
command -v dig >/dev/null 2>&1 || apt-get install -y dnsutils
[ -d "$VENV" ] || apt-get install -y python3-venv

if id -u www-data >/dev/null 2>&1; then
  WEB_GROUP=www-data
else
  WEB_GROUP=nginx
fi

# nginx 1.25.1 起 http2 从 listen 参数改为独立指令
minor=$(nginx -v 2>&1 | tr -dc '0-9.' | cut -d. -f2)
if [ "$minor" -ge 25 ]; then
  LISTEN_V4="listen 443 ssl;"
  LISTEN_V6="listen [::]:443 ssl;"
  HTTP2_ON="http2 on;"
else
  LISTEN_V4="listen 443 ssl http2;"
  LISTEN_V6="listen [::]:443 ssl http2;"
  HTTP2_ON=""
fi

# 登录口令由 set-auth.sh 单独写入；空文件即全员 401，属于失败关闭
if [ ! -f "$HTPASSWD" ]; then
  : > "$HTPASSWD"
  chmod 640 "$HTPASSWD"
  chown "root:$WEB_GROUP" "$HTPASSWD"
fi
chmod 600 "$CRED"
chown root:root "$CRED"

mkdir -p "$REMOTE_DIR/incoming" "$REMOTE_DIR/releases/empty"
if [ ! -e "$REMOTE_DIR/current" ]; then
  echo '<!doctype html><title>尚未部署</title>' > "$REMOTE_DIR/releases/empty/index.html"
  ln -sfn releases/empty "$REMOTE_DIR/current"
fi
chown -R "${SUDO_USER:-root}:$WEB_GROUP" "$REMOTE_DIR"
chmod -R u+rwX,go+rX "$REMOTE_DIR"

[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade -i "$PIP_MIRROR" tencentcloud-sdk-python
install -m 640 "$SCRIPT_DIR/dns01-hook.py" "$HOOK"

DNS_HOOKS=(
  --manual
  --preferred-challenges dns
  --manual-auth-hook "$VENV/bin/python $HOOK auth"
  --manual-cleanup-hook "$VENV/bin/python $HOOK cleanup"
)
certbot certonly "${DNS_HOOKS[@]}" -d "$DOMAIN" \
  --non-interactive --agree-tos --key-type ecdsa --keep-until-expiring

cat > "$CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    $LISTEN_V4
    $LISTEN_V6
    # 腾讯云备案拦截只作用于 80/443，备案下来前用 8443 走同一张证书
    listen 8443 ssl;
    listen [::]:8443 ssl;
    $HTTP2_ON
    server_name $DOMAIN;

    root $REMOTE_DIR/current;
    index index.html;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    auth_basic           "Calisthenics";
    auth_basic_user_file $HTPASSWD;

    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location ~ /\\. {
        deny all;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "no-referrer" always;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "no-referrer" always;
    }
}
EOF

nginx -t
systemctl reload nginx

echo
echo "站点已挂好，口令未设置前一律 401。设置口令："
echo "  sudo bash $SCRIPT_DIR/set-auth.sh <用户名>"
echo "之后每次记录完训练：本机执行 SERVER=<用户>@<IP> bash deploy/deploy.sh"
