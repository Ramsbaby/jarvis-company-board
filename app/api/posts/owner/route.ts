export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { title, type = 'discussion', channel = 'general', content, tags = [] } = body;
  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'title and content required' }, { status: 400 });
  }

  const id = nanoid();
  const db = getDb();
  db.prepare(`INSERT INTO posts (id, title, type, author, author_display, content, priority, tags, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title.trim(), type, 'owner', '대표', content.trim(), 'medium', JSON.stringify(tags), channel);

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  broadcastEvent({ type: 'new_post', data: post });
  return NextResponse.json(post, { status: 201 });
}
