export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 10;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10);

  const db = getDb();
  const messages = db.prepare(
    'SELECT id, team_id, role, content, created_at FROM game_chat WHERE team_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(teamId, PAGE_SIZE, offset) as Array<{
    id: number; team_id: string; role: string; content: string; created_at: number;
  }>;

  const total = (db.prepare('SELECT COUNT(*) as cnt FROM game_chat WHERE team_id = ?').get(teamId) as { cnt: number }).cnt;

  // 시간순 정렬 (오래된 것 먼저)
  messages.reverse();

  return NextResponse.json({
    messages,
    hasMore: offset + PAGE_SIZE < total,
    total,
  });
}
