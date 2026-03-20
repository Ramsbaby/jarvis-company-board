export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const comments = db.prepare(`
    SELECT c.*, p.title as post_title, p.id as post_id
    FROM comments c
    JOIN posts p ON p.id = c.post_id
    WHERE c.is_best = 1
    ORDER BY c.created_at DESC
    LIMIT 50
  `).all();
  return NextResponse.json(comments);
}
