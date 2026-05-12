#!/usr/bin/env bash
set -euo pipefail

: "${SLACK_SIGNING_SECRET:?Set SLACK_SIGNING_SECRET (the one from your Slack app)}"
: "${SLACK_BOT_TOKEN:?Set SLACK_BOT_TOKEN (e.g. xoxb-fake for channel-only smoke test)}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Build
( cd "$ROOT" && npm run build )

# Write a local HTTP wrapper next to the bundle.
# CJS so it can `require` the esbuild CJS bundle directly without interop quirks.
WRAPPER="$ROOT/dist/local-server.cjs"
cat > "$WRAPPER" <<'EOF'
const http = require('node:http');
const mod = require('./handler.js');
const handler = mod.handler || mod.default || mod;

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  const event = {
    httpMethod: req.method,
    headers: req.headers,
    body,
    isBase64Encoded: false,
  };
  const result = await handler(event, {});
  res.statusCode = result.statusCode || 200;
  for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, String(v));
  res.end(result.body || '');
}).listen(3000, () => console.log('listening on :3000'));
EOF

node "$WRAPPER" &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f \"$WRAPPER\"" EXIT
sleep 1

# Build a signed request mimicking Slack
TS=$(date +%s)
BODY="token=xxx&team_id=T1&channel_id=C1&channel_name=nuage&user_id=U1&user_name=test&command=%2Fvisio&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Ffake"
BASE="v0:${TS}:${BODY}"
SIG="v0=$(printf '%s' "$BASE" | openssl dgst -sha256 -hmac "$SLACK_SIGNING_SECRET" -hex | awk '{print $2}')"

echo "POSTing to local handler with signed body:"
curl -sS -X POST http://localhost:3000/ \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Slack-Request-Timestamp: $TS" \
  -H "X-Slack-Signature: $SIG" \
  --data "$BODY"
echo
