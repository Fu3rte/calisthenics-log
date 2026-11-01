#!/usr/bin/env bash
# 服务器执行一次：装 nginx、开 Basic Auth、签 HTTPS 证书、挂站点。
# 前置：域名已解析到本机公网 IP，安全组放行 80/443，域名已完成 ICP 备案。
# 用法：sudo DOMAIN=train.example.com AUTH_USER=eric LETSENCRYPT_EMAIL=you@example.com bash deploy/server-setup.sh
set -euo pipefail

DOMAIN="${DOMAIN:?缺少 DOMAIN，例：DOMAIN=train.example.com}"
AUTH_USER="${AUTH_USER:?缺少 AUTH_USER，登录用户名}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?缺少 LETSENCRYPT_EMAIL，证书到期提醒邮箱}"
REMOTE_DIR=/srv/calisthenics
HTPASSWD=/etc/nginx/calisthenics.htpasswd
CONF=/etc/nginx/conf.d/calisthenics.conf

command -v apt-get >/dev/null 2>&1 || { echo "需要 Debian/Ubuntu 的 apt-get"; exit 1; }
apt-get update -qq
command -v nginx >/dev/null 2>&1 || apt-get install -y nginx
command -v certbot >/dev/null 2>&1 || apt-get install -y certbot python3-certbot-nginx

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

read -rsp "为 $AUTH_USER 设置登录密码: " AUTH_PASS
echo
printf '%s:%s\n' "$AUTH_USER" "$(openssl passwd -6 "$AUTH_PASS")" > "$HTPASSWD"
unset AUTH_PASS
chmod 640 "$HTPASSWD"
chown "root:$WEB_GROUP" "$HTPASSWD"

mkdir -p "$REMOTE_DIR/incoming" "$REMOTE_DIR/releases/empty"
if [ ! -e "$REMOTE_DIR/current" ]; then
  echo '<!doctype html><title>尚未部署</title>' > "$REMOTE_DIR/releases/empty/index.html"
  ln -sfn releases/empty "$REMOTE_DIR/current"
fi
chown -R "${SUDO_USER:-root}:$WEB_GROUP" "$REMOTE_DIR"
chmod -R u+rwX,go+rX "$REMOTE_DIR"

# 默认站点先跑起来，用 /var/www/html 承接 ACME HTTP-01 校验
systemctl enable --now nginx
certbot certonly --webroot -w /var/www/html -d "$DOMAIN" \
  --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --keep-until-expiring

cat > "$CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    $LISTEN_V4
    $LISTEN_V6
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
echo "完成。登录用户 $AUTH_USER，地址 https://$DOMAIN"
echo "之后每次记录完训练：本机执行 SERVER=<用户>@<IP> bash deploy/deploy.sh"
