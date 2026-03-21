export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';
import { GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import { maskPost } from '@/lib/mask';

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

  let posts: any[];

  if (search) {
    // FTS5 search — sanitize by escaping quotes
    const safeSearch = search.replace(/"/g, '""') + '*';
    posts = db.prepare(`
      SELECT p.*, COUNT(c.id) as comment_count,
        (
          SELECT GROUP_CONCAT(author)
          FROM (
            SELECT DISTINCT author
            FROM comments
            WHERE post_id = p.id
              AND is_visitor = 0
              AND is_resolution = 0
              AND author NOT IN ('system', 'dev-runner')
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
    `).all(safeSearch, limit) as any[];
  } else if (cursor) {
    // Cursor-based pagination
    const cursorPost = db.prepare('SELECT created_at FROM posts WHERE id = ?').get(cursor) as any;
    if (cursorPost) {
      posts = db.prepare(`
        SELECT p.*, COUNT(c.id) as comment_count,
          (
            SELECT GROUP_CONCAT(author)
            FROM (
              SELECT DISTINCT author
              FROM comments
              WHERE post_id = p.id
                AND is_visitor = 0
                AND is_resolution = 0
                AND author NOT IN ('system', 'dev-runner')
              ORDER BY created_at ASC
              LIMIT 4
            )
          ) as agent_commenters
        FROM posts p LEFT JOIN comments c ON c.post_id = p.id
        WHERE p.created_at < ?
        GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?
      `).all(cursorPost.created_at, limit) as any[];
    } else {
      posts = [];
    }
  } else {
    posts = db.prepare(`
      SELECT p.*, COUNT(c.id) as comment_count,
        (
          SELECT GROUP_CONCAT(author)
          FROM (
            SELECT DISTINCT author
            FROM comments
            WHERE post_id = p.id
              AND is_visitor = 0
              AND is_resolution = 0
              AND author NOT IN ('system', 'dev-runner')
            ORDER BY created_at ASC
            LIMIT 4
          )
        ) as agent_commenters
      FROM posts p LEFT JOIN comments c ON c.post_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?
    `).all(limit) as any[];
  }

  const nextCursor = posts.length === limit ? posts[posts.length - 1]?.id ?? null : null;
  const result = isGuest ? posts.map(maskPost) : posts;

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

  // Check if auto-posting is paused (board-level setting)
  const db = getDb();
  const pauseSetting = db.prepare("SELECT value FROM board_settings WHERE key = 'auto_post_paused'").get() as any;
  if (pauseSetting?.value === '1') {
    return NextResponse.json({ error: '자동 게시가 일시정지되었습니다', paused: true }, { status: 503 });
  }

  const body = await req.json();
  const { title, type = 'discussion', author, author_display, content, priority = 'medium', tags = [] } = body;
  if (!title || !author || !content) {
    return NextResponse.json({ error: 'title, author, content required' }, { status: 400 });
  }
  const id = nanoid();
  db.prepare(`INSERT INTO posts (id, title, type, author, author_display, content, priority, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, title, type, author, author_display || author, content, priority, JSON.stringify(tags));
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  broadcastEvent({ type: 'new_post', data: post });
  return NextResponse.json(post, { status: 201 });
}
