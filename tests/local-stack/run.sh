#!/usr/bin/env bash
# Start PostgREST + gateway + mock AI for local end-to-end tests. Writes connection settings to .env.local-stack
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
POSTGREST_BIN=${POSTGREST_BIN:-postgrest}
PGHOST=${PGHOST:-/tmp}; PGPORT=${PGPORT:-54329}; DB=${DB:-seminary}
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export JWT_SECRET=$SECRET
export DATABASE_URL="postgresql://postgres@localhost/$DB?host=$PGHOST&port=$PGPORT"
PGRST_DB_URI="postgresql://authenticator@localhost/$DB?host=$PGHOST&port=$PGPORT" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET=$SECRET PGRST_SERVER_PORT=3001 \
PGRST_DB_EXTRA_SEARCH_PATH=public,extensions \
  nohup "$POSTGREST_BIN" > /tmp/postgrest.log 2>&1 &
nohup node "$HERE/gateway.mjs" > /tmp/gateway.log 2>&1 &
nohup node "$HERE/mock-ai.mjs" > /tmp/mock-ai.log 2>&1 &
sleep 2
SERVICE=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'service_role',iss:'local'});
console.log(h+'.'+p+'.'+c.createHmac('sha256',process.env.JWT_SECRET).update(h+'.'+p).digest('base64url'))")
ANON=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'anon',iss:'local'});
console.log(h+'.'+p+'.'+c.createHmac('sha256',process.env.JWT_SECRET).update(h+'.'+p).digest('base64url'))")
cat > "$HERE/.env.local-stack" <<ENV
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
ANTHROPIC_API_KEY=test-key
ANTHROPIC_BASE_URL=http://127.0.0.1:4010
VOYAGE_API_KEY=test-key
VOYAGE_BASE_URL=http://127.0.0.1:4010/v1/embeddings
ADMIN_EMAIL=admin@example.com
TUTOR_DAILY_MESSAGE_LIMIT=50
ENV
echo "stack running; settings in $HERE/.env.local-stack"
