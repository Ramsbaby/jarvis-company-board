export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestAuth } from '@/lib/guest-guard';

function nanoid(size = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const session = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id) as { share_token: string | null } | undefined;
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let token = session.share_token;
  if (!token) {
    token = nanoid(12);
    db.prepare('UPDATE interview_sessions SET share_token = ? WHERE id = ?').run(token, id);
  }

  return NextResponse.json({ token, url: `/interview/share/${token}` });
}
