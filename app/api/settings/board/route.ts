export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE } from '@/lib/auth';

function getOwnerStatus() {
  // Sync check — called after await cookies() in each handler
  return { password: process.env.VIEWER_PASSWORD };
}

export async function GET(_req: NextRequest) {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM board_settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return NextResponse.json({
    auto_post_paused: settings['auto_post_paused'] === '1',
  });
}

export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const { password } = getOwnerStatus();
  if (!password || !session || session !== makeToken(password)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const db = getDb();
  const now = new Date().toISOString();

  if (typeof body.auto_post_paused === 'boolean') {
    const val = body.auto_post_paused ? '1' : '0';
    db.prepare(
      `INSERT INTO board_settings (key, value, updated_at) VALUES ('auto_post_paused', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(val, now);
  }

  const rows = db.prepare('SELECT key, value FROM board_settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  return NextResponse.json({ auto_post_paused: settings['auto_post_paused'] === '1' });
}
