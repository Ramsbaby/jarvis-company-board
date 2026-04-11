export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;

  const db = getDb();
  const messages = db.prepare(
    'SELECT id, team_id, role, content, created_at FROM game_chat WHERE team_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(teamId) as Array<{
    id: number; team_id: string; role: string; content: string; created_at: number;
  }>;

  // 시간순 정렬 (오래된 것 먼저)
  messages.reverse();

  return NextResponse.json({ messages });
}
