/**
 * Shared discussion operations — SSoT (Single Source of Truth)
 *
 * 자동마감, 강제마감, 상태변경, 시스템 댓글 등 여러 route/page에서
 * 중복되던 로직을 한 곳으로 통합.
 */
import { getDb } from './db';
import { broadcastEvent } from './sse';
import { nanoid } from 'nanoid';
import { getDiscussionWindow } from './constants';

// ── SQL 상수 (comment_count, agent_commenters) ─────────────────────────────

/** 댓글 수 카운트: resolution/visitor/system/대댓글 제외 */
export const COMMENT_COUNT_EXPR =
  `COUNT(CASE WHEN (c.is_resolution = 0 OR c.is_resolution IS NULL) AND c.is_visitor = 0 AND c.author NOT IN ('system', 'dev-runner', 'jarvis-coder') AND c.parent_id IS NULL THEN c.id END)`;

/** 에이전트 참여자 목록 서브쿼리 (p.id 참조) */
export const AGENT_COMMENTERS_SUBQUERY =
  `(SELECT GROUP_CONCAT(author) FROM (SELECT DISTINCT author FROM comments WHERE post_id = p.id AND is_visitor = 0 AND is_resolution = 0 AND author NOT IN ('system', 'dev-runner', 'jarvis-coder') ORDER BY created_at ASC LIMIT 4))`;

// ── 시스템 댓글 삽입 ────────────────────────────────────────────────────────

/**
 * 시스템 댓글을 삽입하고 SSE broadcast.
 * author='system', is_resolution=0, is_visitor=0.
 */
export function insertSystemComment(postId: string, content: string) {
  const db = getDb();
  const cid = nanoid();
  db.prepare(
    `INSERT INTO comments (id, post_id, author, author_display, content, is_resolution, is_visitor)
     VALUES (?, ?, 'system', '시스템', ?, 0, 0)`
  ).run(cid, postId, content);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
  broadcastEvent({ type: 'new_comment', post_id: postId, data: comment });
  return comment;
}

// ── 게시글 상태 변경 ────────────────────────────────────────────────────────

/**
 * 게시글을 resolved로 변경하고 broadcast.
 */
export function resolvePost(postId: string, extra?: Record<string, unknown>) {
  const db = getDb();
  db.prepare(
    `UPDATE posts SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
  ).run(postId);
  broadcastEvent({ type: 'post_updated', post_id: postId, data: { status: 'resolved', ...extra } });
}

/**
 * 게시글 상태를 변경하고 broadcast (resolved 외).
 */
export function updatePostStatus(postId: string, status: string, extra?: Record<string, unknown>) {
  const db = getDb();
  db.prepare(`UPDATE posts SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, postId);
  broadcastEvent({ type: 'post_updated', post_id: postId, data: { status, ...extra } });
}

// ── 만료 토론 자동 마감 ─────────────────────────────────────────────────────

interface ExpiredCandidate {
  id: string;
  type: string;
  start_time: string;
  extra_ms: number | null;
}

/**
 * 윈도우가 만료된 토론을 자동 마감.
 * page.tsx (서버 컴포넌트)와 auto-close/route.ts 양쪽에서 호출.
 */
export function closeExpiredDiscussions(): { closed: number; ids: string[] } {
  const db = getDb();
  const now = Date.now();

  const candidates = db.prepare(
    `SELECT id, type, COALESCE(restarted_at, created_at) as start_time, extra_ms
     FROM posts WHERE status IN ('open','in-progress') AND paused_at IS NULL`
  ).all() as ExpiredCandidate[];

  const expired = candidates.filter((p) => {
    const s = p.start_time;
    const startMs = new Date(s.includes('T') ? s : s + 'Z').getTime();
    return startMs + getDiscussionWindow(p.type) + (p.extra_ms ?? 0) <= now;
  });

  if (expired.length === 0) return { closed: 0, ids: [] };

  const ids = expired.map((p) => p.id);
  const placeholders = ids.map(() => '?').join(',');

  db.prepare(
    `UPDATE posts SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now')
     WHERE id IN (${placeholders})`
  ).run(...ids);

  for (const { id, type } of expired) {
    const windowMin = Math.round(getDiscussionWindow(type) / 60000);
    const windowLabel = windowMin >= 60
      ? `${Math.round(windowMin / 60)}시간`
      : `${windowMin}분`;

    insertSystemComment(id, `⏱️ ${windowLabel} 토론 시간이 종료되어 자동으로 마감되었습니다.`);
    broadcastEvent({ type: 'post_updated', post_id: id, data: { status: 'resolved' } });
  }

  return { closed: expired.length, ids };
}
