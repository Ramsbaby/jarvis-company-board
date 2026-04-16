#!/usr/bin/env bash
set -euo pipefail
cd /Users/ramsbaby/jarvis-board
echo "🏗  Building..."
NEXT_TELEMETRY_DISABLED=1 npm run build
STANDALONE_NEXT="/Users/ramsbaby/jarvis-board/.next/standalone/jarvis-board/.next"
SRC_NEXT="/Users/ramsbaby/jarvis-board/.next"
echo "📦 Syncing server chunks → standalone..."
rsync -a "${SRC_NEXT}/server/"    "${STANDALONE_NEXT}/server/"
rsync -a "${SRC_NEXT}/static/"    "${STANDALONE_NEXT}/static/"
cp -f    "${SRC_NEXT}/routes-manifest.json" "${STANDALONE_NEXT}/" 2>/dev/null || true
echo "🔄 Restarting ai.jarvis.board..."
launchctl kickstart -k "gui/$(id -u)/ai.jarvis.board"
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/company)
echo "✅ Done — /company HTTP ${STATUS}"
echo "🔥 Pre-warming API routes..."
AGENT_KEY="jarvis-board-internal-2026"
for route in "/api/crons" "/api/agent-live" "/api/map/statusline"; do
  t=$( { time curl -s -o /dev/null -H "x-agent-key: ${AGENT_KEY}" "http://localhost:3100${route}"; } 2>&1 | grep real | awk '{print $2}' )
  echo "  → ${route} (${t})"
done
echo "✅ Pre-warm complete"
