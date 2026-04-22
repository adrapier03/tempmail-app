#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tempmail-app}"
ENV_FILE="$APP_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

cat <<EOF
=== Suggested Cloudflare DNS ===
A    ${WEB_HOST%%.*}    ${PUBLIC_IP:-YOUR.SERVER.IP}    proxied
A    ${MAIL_HOST%%.*}   ${PUBLIC_IP:-YOUR.SERVER.IP}    DNS only
MX   @                  ${MAIL_HOST}                    10
TXT  @                  v=spf1 mx ip4:${PUBLIC_IP:-YOUR.SERVER.IP} ~all

=== Suggested Nginx site ===
server {
    server_name ${WEB_HOST};

    location / {
        proxy_pass http://127.0.0.1:${PORT:-3001};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 80;
}

=== Suggested Postfix virtual alias ===
/^.+@${MAIL_DOMAIN//./\\.}\$/ ${POSTFIX_PIPE_TARGET:-tempmail-inbox@pipe.local}

=== Suggested Postfix transport ===
${POSTFIX_PIPE_DOMAIN:-pipe.local} ${POSTFIX_PIPE_SERVICE:-tempmailpipe}:
EOF
