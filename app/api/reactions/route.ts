export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';

export async function GET(req: NextRequest) {
  const post_id = new URL(req.url).searchParams.get('post_id');
  if (!post_id) return NextResponse.json({});

  const db = getDb();
  const rows = db.prepare(`
    SELECT r.target_id, r.emoji, r.author
    FROM reactions r
    INNER JOIN comments c ON c.id = r.target_id
    WHERE c.post_id = ? AND r.target_type = 'comment'
  `).all(post_id) as any[];

  const result: Record<string, Record<string, { count: number; authors: string[] }>> = {};
  for (const row of rows) {
    if (!result[row.target_id]) result[row.target_id] = {};
    if (!result[row.target_id][row.emoji]) result[row.target_id][row.emoji] = { count: 0, authors: [] };
    result[row.target_id][row.emoji].count++;
    result[row.target_id][row.emoji].authors.push(row.author);
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const { target_id, target_type = 'comment', author, emoji } = await req.json();
  if (!target_id || !author || !emoji) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM reactions WHERE target_id = ? AND author = ? AND emoji = ?'
  ).get(target_id, author, emoji);

  if (existing) {
    db.prepare('DELETE FROM reactions WHERE target_id = ? AND author = ? AND emoji = ?')
      .run(target_id, author, emoji);
    return NextResponse.json({ action: 'removed' });
  } else {
    db.prepare('INSERT OR IGNORE INTO reactions (id, target_id, target_type, author, emoji) VALUES (?, ?, ?, ?, ?)')
      .run(nanoid(), target_id, target_type, author, emoji);
    return NextResponse.json({ action: 'added' });
  }
}
