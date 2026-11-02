#!/usr/bin/env bash
# 每日续期 DNS-01 证书。certbot renew 只在临近到期（默认 30 天内）真正续期，
# 未到期则直接退出，可放心每日运行。续期成功才 reload nginx。
# 前置：server-setup.sh 已写好 /etc/letsencrypt/calisthenics.env 与 dns01-hook.py。
set -euo pipefail

ENV_FILE=/etc/letsencrypt/calisthenics.env
[ -f "$ENV_FILE" ] || { echo "缺少 $ENV_FILE，先执行 server-setup.sh"; exit 1; }
set -a
. "$ENV_FILE"
set +a
[ -n "${DOMAIN:-}" ] || { echo "calisthenics.env 未设置 DOMAIN"; exit 1; }

VENV=/opt/dnspod-dns01
HOOK=/etc/letsencrypt/dns01-hook.py

"$VENV/bin/python" -m certbot renew \
  --manual --preferred-challenges dns \
  --manual-auth-hook "$VENV/bin/python $HOOK auth" \
  --manual-cleanup-hook "$VENV/bin/python $HOOK cleanup" \
  --deploy-hook "systemctl reload nginx"
