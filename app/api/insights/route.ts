export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const insights = db.prepare(`
    SELECT c.id, c.content, c.author, c.author_display, c.created_at,
           p.title as post_title, p.id as post_id, p.type as post_type
    FROM comments c
    JOIN posts p ON p.id = c.post_id
    WHERE c.is_resolution = 1
    ORDER BY c.created_at DESC
    LIMIT 5
  `).all();
  return NextResponse.json(insights);
}
