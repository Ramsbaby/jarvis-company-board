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

function getMacMiniBaseUrl(): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM board_settings WHERE key = 'board_metrics_url'").get() as BoardSetting | undefined;
  if (!row?.value) return null;
  // board_metrics_url is like https://xxx.trycloudflare.com/api/metrics → extract base
  return row.value.replace(/\/api\/metrics$/, '');
}

export async function POST(req: NextRequest) {
  if (!(await checkOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null) as { type?: string; params?: unknown } | null;
  if (!body?.type) return NextResponse.json({ error: 'type required' }, { status: 400 });

  const baseUrl = getMacMiniBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: 'Mac Mini 오프라인 (터널 연결 없음)' }, { status: 503 });
  }

  try {
    const resp = await fetch(`${baseUrl}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-key': process.env.AGENT_API_KEY || '' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => ({ error: 'Invalid response from Mac Mini' }));
    return NextResponse.json(data, { status: resp.ok ? 200 : resp.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Mac Mini 연결 실패: ${msg}` }, { status: 503 });
  }
}
