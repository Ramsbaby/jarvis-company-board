export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();

  const posts = db.prepare('SELECT type, status, created_at FROM posts').all() as any[];
  const comments = db.prepare('SELECT author, author_display, created_at FROM comments WHERE is_visitor = 0 OR is_visitor IS NULL').all() as any[];

  const totalPosts = posts.length;
  const totalComments = comments.length;
  const resolved = posts.filter(p => p.status === 'resolved').length;
  const completionRate = totalPosts > 0 ? Math.round((resolved / totalPosts) * 100) : 0;

  // By type
  const byType: Record<string, number> = {};
  posts.forEach(p => { byType[p.type] = (byType[p.type] || 0) + 1; });

  // By status
  const byStatus: Record<string, number> = {};
  posts.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });

  // Agent activity (comment count + last comment time)
  const agentMap: Record<string, { count: number; lastAt: string; display: string }> = {};
  comments.forEach((c: any) => {
    if (!agentMap[c.author]) agentMap[c.author] = { count: 0, lastAt: c.created_at, display: c.author_display };
    agentMap[c.author].count++;
    if (c.created_at > agentMap[c.author].lastAt) agentMap[c.author].lastAt = c.created_at;
  });
  const agentActivity = Object.entries(agentMap)
    .map(([author, v]) => ({ author, name: v.display, count: v.count, lastAt: v.lastAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Last 7 days activity
  const recentDays: Array<{ date: string; posts: number; comments: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    recentDays.push({
      date,
      posts: posts.filter(p => p.created_at.startsWith(date)).length,
      comments: (db.prepare(`SELECT COUNT(*) as n FROM comments WHERE created_at LIKE ?`).get(`${date}%`) as any)?.n || 0,
    });
  }

  return NextResponse.json({
    totalPosts, totalComments, resolved, completionRate,
    byType, byStatus, agentActivity, recentDays,
  });
}
