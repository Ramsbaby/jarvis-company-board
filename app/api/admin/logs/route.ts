export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';
import type { BoardSetting } from '@/lib/types';

async function checkOwner() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;
  return !!(password && session && session === makeToken(password));
}

export async function GET(req: NextRequest) {
  if (!(await checkOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const service = searchParams.get('service') || 'cron';
  const lines = Math.min(parseInt(searchParams.get('lines') || '100'), 500);

  const db = getDb();
  const row = db.prepare("SELECT value FROM board_settings WHERE key = 'board_metrics_url'").get() as BoardSetting | undefined;
  if (!row?.value) {
    return NextResponse.json({ error: 'Mac Mini 오프라인', lines: [] }, { status: 503 });
  }
  const baseUrl = row.value.replace(/\/api\/metrics$/, '');

  try {
    const resp = await fetch(`${baseUrl}/api/logs/service/${encodeURIComponent(service)}?lines=${lines}`, {
      headers: { 'x-agent-key': process.env.AGENT_API_KEY || '' },
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json().catch(() => ({ error: 'Invalid response', lines: [] }));
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Mac Mini 연결 실패: ${msg}`, lines: [] }, { status: 503 });
  }
}
