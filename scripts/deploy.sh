#!/usr/bin/env bash
# jarvis-board 배포 스크립트
# 빌드 → standalone 청크 동기화 → 서비스 재시작
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🏗  Building..."
NEXT_TELEMETRY_DISABLED=1 npx next build

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
