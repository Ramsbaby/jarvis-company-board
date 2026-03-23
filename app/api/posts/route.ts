export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';
import { GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import { maskPost } from '@/lib/mask';
import { getDiscussionWindow } from '@/lib/constants';
import type { PostWithCommentCount, PostCursorRow, CountRow, BoardSetting, IdRow } from '@/lib/types';

function checkAuth(req: NextRequest) {
  const key = req.headers.get('x-agent-key');
  return key === process.env.AGENT_API_KEY;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim();
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

  const db = getDb();

  // Guest masking
  const cookieStore = await cookies();
  const isGuest = isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  let posts: PostWithCommentCount[];

  if (search) {
    // FTS5 search — sanitize by escaping quotes
    const safeSearch = search.replace(/"/g, '""') + '*';
    posts = db.prepare(`
      SELECT p.*, COUNT(CASE WHEN c.is_resolution = 0 OR c.is_resolution IS NULL THEN c.id END) as comment_count,
        (
          SELECT GROUP_CONCAT(author)
          FROM (
            SELECT DISTINCT author
            FROM comments
            WHERE post_id = p.id
              AND is_visitor = 0
              AND is_resolution = 0
              AND author NOT IN ('system', 'dev-runner', 'jarvis-coder')
            ORDER BY created_at ASC
            LIMIT 4
          )
        ) as agent_commenters
      FROM posts p
      JOIN posts_fts f ON p.rowid = f.rowid
      LEFT JOIN comments c ON c.post_id = p.id
      WHERE posts_fts MATCH ?
      GROUP BY p.id
      ORDER BY rank
      LIMIT ?
    `).all(safeSearch, limit) as PostWithCommentCount[];
  } else if (cursor) {
    // Cursor-based pagination
    const cursorPost = db.prepare('SELECT created_at FROM posts WHERE id = ?').get(cursor) as PostCursorRow | undefined;
    if (cursorPost) {
      posts = db.prepare(`
        SELECT p.*, COUNT(CASE WHEN c.is_resolution = 0 OR c.is_resolution IS NULL THEN c.id END) as comment_count,
          (
            SELECT GROUP_CONCAT(author)
            FROM (
              SELECT DISTINCT author
              FROM comments
              WHERE post_id = p.id
                AND is_visitor = 0
                AND is_resolution = 0
                AND author NOT IN ('system', 'dev-runner', 'jarvis-coder')
              ORDER BY created_at ASC
              LIMIT 4
            )
          ) as agent_commenters
        FROM posts p LEFT JOIN comments c ON c.post_id = p.id
        WHERE p.created_at < ?
        GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?
      `).all(cursorPost.created_at, limit) as PostWithCommentCount[];
    } else {
      posts = [];
    }
  } else {
    posts = db.prepare(`
      SELECT p.*, COUNT(CASE WHEN c.is_resolution = 0 OR c.is_resolution IS NULL THEN c.id END) as comment_count,
        (
          SELECT GROUP_CONCAT(author)
          FROM (
            SELECT DISTINCT author
            FROM comments
            WHERE post_id = p.id
              AND is_visitor = 0
              AND is_resolution = 0
              AND author NOT IN ('system', 'dev-runner', 'jarvis-coder')
            ORDER BY created_at ASC
            LIMIT 4
          )
        ) as agent_commenters
      FROM posts p LEFT JOIN comments c ON c.post_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?
    `).all(limit) as PostWithCommentCount[];
  }

  const nextCursor = posts.length === limit ? posts[posts.length - 1]?.id ?? null : null;
  const baseResult: PostWithCommentCount[] = isGuest ? posts.map(maskPost) : posts;

  // Add computed board_closes_at for active posts (daemon uses this to track deadlines incl. extensions)
  const result = baseResult.map((p: PostWithCommentCount) => {
    if (p.status === 'open' || p.status === 'in-progress') {
      const startStr = p.restarted_at || p.created_at;
      const startMs = new Date(startStr.includes('Z') ? startStr : startStr + 'Z').getTime();
      const closesMs = startMs + getDiscussionWindow(p.type) + (p.extra_ms || 0);
      return { ...p, board_closes_at: new Date(closesMs).toISOString() };
    }
    return p;
  });

  // If cursor/search requested, return paginated format
  if (cursor || search) {
    return NextResponse.json({ posts: result, nextCursor });
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  // Check if auto-posting is paused (board-level setting)
  const pauseSetting = db.prepare("SELECT value FROM board_settings WHERE key = 'auto_post_paused'").get() as BoardSetting | undefined;
  if (pauseSetting?.value === '1') {
    return NextResponse.json({ error: '자동 게시가 일시정지되었습니다', paused: true }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const { title, type = 'discussion', author, author_display, content, priority = 'medium', tags = [] } = body;

  // Prevent multiple active discussions — only one at a time
  if (type === 'discussion') {
    const activeCount = (db.prepare(
      "SELECT COUNT(*) as cnt FROM posts WHERE status IN ('open', 'in-progress') AND type = 'discussion'"
    ).get() as CountRow | undefined)?.cnt ?? 0;
    if (activeCount >= 1) {
      return NextResponse.json({ error: '이미 활성 토론이 있습니다', activeCount }, { status: 409 });
    }
  }
  if (!title || !author || !content) {
    return NextResponse.json({ error: 'title, author, content required' }, { status: 400 });
  }

  // Prevent same-title posts within 7 days
  const recentDupe = db.prepare(
    `SELECT id FROM posts WHERE title = ? AND created_at > datetime('now', '-7 days')`
  ).get(title) as IdRow | undefined;
  if (recentDupe) {
    return NextResponse.json({ error: '같은 제목의 토론이 7일 내에 이미 있습니다', duplicate: true, existing_id: recentDupe.id }, { status: 409 });
  }

  const id = nanoid();
  db.prepare(`INSERT INTO posts (id, title, type, author, author_display, content, priority, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title, type, author, author_display || author, content, priority, JSON.stringify(tags));
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  broadcastEvent({ type: 'new_post', post_id: id, data: post });
  return NextResponse.json(post, { status: 201 });
}
