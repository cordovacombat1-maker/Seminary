#!/usr/bin/env bash
# Start the fake AI service and write the settings `netlify dev` needs to .env.local-stack.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
nohup node "$HERE/mock-ai.mjs" > /tmp/mock-ai.log 2>&1 &
sleep 1
cat > "$HERE/.env.local-stack" <<ENV
ANTHROPIC_API_KEY=test-key
ANTHROPIC_BASE_URL=http://127.0.0.1:4010
TUTOR_DAILY_MESSAGE_LIMIT=50
INGEST_CACHE_DIR=$ROOT/scripts/.cache
ENV
echo "mock AI running; settings in $HERE/.env.local-stack"
