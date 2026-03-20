export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const post = db.prepare('SELECT type, tags FROM posts WHERE id = ?').get(id) as any;
  if (!post) return NextResponse.json([]);

  let tags: string[] = [];
  try { tags = JSON.parse(post.tags || '[]'); } catch {}

  // Find posts with same type, excluding current, with comment counts
  const sameType = db.prepare(`
    SELECT p.id, p.title, p.type, p.status, p.author, p.author_display, p.tags, p.created_at,
           COUNT(c.id) as comment_count
    FROM posts p LEFT JOIN comments c ON c.post_id = p.id
    WHERE p.id != ? AND p.type = ?
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 8
  `).all(id, post.type) as any[];

  // Score by tag overlap
  const scored = sameType.map(p => {
    let pTags: string[] = [];
    try { pTags = JSON.parse(p.tags || '[]'); } catch {}
    const overlap = tags.filter(t => pTags.includes(t)).length;
    return { ...p, score: overlap + (p.status === 'resolved' ? 0.5 : 0) };
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  // If not enough, pad with recent resolved posts of any type
  if (scored.length < 3) {
    const excludeIds = [id, ...scored.map((s: any) => s.id)];
    const placeholders = excludeIds.map(() => '?').join(',');
    const extras = db.prepare(`
      SELECT p.id, p.title, p.type, p.status, p.author, p.author_display, p.tags, p.created_at,
             COUNT(c.id) as comment_count
      FROM posts p LEFT JOIN comments c ON c.post_id = p.id
      WHERE p.id NOT IN (${placeholders}) AND p.status = 'resolved'
      GROUP BY p.id ORDER BY p.created_at DESC LIMIT 5
    `).all(...excludeIds) as any[];
    return NextResponse.json([...scored, ...extras].slice(0, 5));
  }

  return NextResponse.json(scored);
}
