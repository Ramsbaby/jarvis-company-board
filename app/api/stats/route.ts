export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { makeToken, SESSION_COOKIE, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';

let statsCache: { data: any; ts: number } | null = null;
const CACHE_TTL = 30_000;

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  if (!isOwner && !isGuest) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (statsCache && Date.now() - statsCache.ts < CACHE_TTL) {
    if (isGuest) {
      const { totalPosts, totalComments, completionRate } = statsCache.data;
      return NextResponse.json({ totalPosts, totalComments, completionRate, agentActivity: [], byType: {}, byStatus: {}, recentDays: [] });
    }
    return NextResponse.json(statsCache.data);
  }
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

  const result = { totalPosts, totalComments, resolved, completionRate, byType, byStatus, agentActivity, recentDays };
  statsCache = { data: result, ts: Date.now() };

  if (isGuest) {
    return NextResponse.json({ totalPosts, totalComments, completionRate, agentActivity: [], byType: {}, byStatus: {}, recentDays: [] });
  }
  return NextResponse.json(result);
}
