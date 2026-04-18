export const runtime = 'nodejs';

/**
 * /api/system-metrics
 *
 * Mac Mini → Railway 메트릭 push 엔드포인트.
 * sync-system-metrics.sh (5분 주기 LaunchAgent)가 디스크/메모리/CPU/크론 통계를
 * 이 라우트에 POST → board_settings 키-값 캐시에 저장.
 * GET은 저장된 스냅샷을 반환 (디버그·헬스체크용).
 *
 * 인증: x-agent-key 헤더 (AGENT_API_KEY 환경변수)
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const CACHE_KEY = 'system_metrics_cache';
// 15분 초과 시 stale 처리 (sync 주기 5분의 3배 여유)
const STALE_MS = 15 * 60 * 1000;

function isAuthorized(req: Request): boolean {
  const agentKey = process.env.AGENT_API_KEY;
  return !!(agentKey && req.headers.get('x-agent-key') === agentKey);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO board_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(CACHE_KEY, JSON.stringify(body));

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const row = db
    .prepare('SELECT value, updated_at FROM board_settings WHERE key = ?')
    .get(CACHE_KEY) as { value: string; updated_at: string } | undefined;

  if (!row) {
    return NextResponse.json({ ok: false, data: null, stale: true });
  }

  const updatedAt = new Date(row.updated_at + 'Z'); // SQLite stores without TZ — treat as UTC
  const stale = Date.now() - updatedAt.getTime() > STALE_MS;

  return NextResponse.json({
    ok: true,
    stale,
    updated_at: row.updated_at,
    data: JSON.parse(row.value),
  });
}
