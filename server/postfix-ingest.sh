#!/bin/bash
set -euo pipefail
cd /opt/tempmail-app/server
exec /usr/local/bin/node /opt/tempmail-app/server/ingest.js "$1"

