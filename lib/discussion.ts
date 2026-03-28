/**
 * Shared discussion operations — SSoT (Single Source of Truth)
 *
 * 자동마감, 강제마감, 상태변경, 시스템 댓글 등 여러 route/page에서
 * 중복되던 로직을 한 곳으로 통합.
 */
import { getDb } from './db';
import { broadcastEvent } from './sse';
import { nanoid } from 'nanoid';
import { getDiscussionWindow, SYSTEM_AUTHOR_EXCLUSIONS } from './constants';

// ── SQL 상수 (comment_count, agent_commenters) ─────────────────────────────
const _excluded = SYSTEM_AUTHOR_EXCLUSIONS.map(a => `'${a}'`).join(', ');

/** 댓글 수 카운트: resolution/visitor/system/대댓글 제외 (단순 쿼리용 — LEFT JOIN c 필요) */
export const COMMENT_COUNT_EXPR =
  `COUNT(CASE WHEN (c.is_resolution = 0 OR c.is_resolution IS NULL) AND c.is_visitor = 0 AND c.author NOT IN (${_excluded}) AND c.parent_id IS NULL THEN c.id END)`;

/** 에이전트 참여자 목록 코릴레이티드 서브쿼리 (소규모 쿼리용 — 50건 이상은 buildPostsCTE 사용 권장) */
export const AGENT_COMMENTERS_SUBQUERY =
  `(SELECT GROUP_CONCAT(author) FROM (SELECT DISTINCT author FROM comments WHERE post_id = p.id AND is_visitor = 0 AND is_resolution = 0 AND author NOT IN (${_excluded}) ORDER BY created_at ASC LIMIT 4))`;

/**
 * CTE 기반 포스트 목록 쿼리 빌더.
 * 코릴레이티드 서브쿼리(`AGENT_COMMENTERS_SUBQUERY`) 대신 CTE + LEFT JOIN으로
 * 집계를 한 번에 처리 → N회 서브쿼리 → 2회 LEFT JOIN 으로 대체.
 *
 * @param opts.join   추가 JOIN 절 (예: FTS 검색용 'JOIN posts_fts f ON p.rowid = f.rowid')
 * @param opts.where  WHERE 조건 (예: 'posts_fts MATCH ?' 또는 'p.created_at < ?')
 * @param opts.orderBy ORDER BY 절 (기본: 'p.created_at DESC')
 * @returns SQL 문자열 — 마지막 바인딩 파라미터는 LIMIT 값 (?), 앞 파라미터는 opts에 따라 결정
 */
export function buildPostsCTE(opts: {
  join?: string;
  where?: string;
  orderBy?: string;
} = {}): string {
  const orderBy = opts.orderBy ?? 'p.created_at DESC';
  const extraJoin = opts.join ? `\n    ${opts.join}` : '';
  const where = opts.where ? `WHERE ${opts.where}` : '';
  return `
    WITH
    _cc AS (
      SELECT post_id, COUNT(*) AS cnt
      FROM comments
      WHERE (is_resolution = 0 OR is_resolution IS NULL)
        AND is_visitor = 0
        AND parent_id IS NULL
        AND author NOT IN (${_excluded})
      GROUP BY post_id
    ),
    _dc AS (
      SELECT post_id, author, MIN(created_at) AS fa
      FROM comments
      WHERE is_visitor = 0 AND is_resolution = 0
        AND author NOT IN (${_excluded})
      GROUP BY post_id, author
    ),
    _rc AS (
      SELECT post_id, author,
        ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY fa ASC) AS rn
      FROM _dc
    ),
    _ca AS (
      SELECT post_id, GROUP_CONCAT(author) AS agent_commenters
      FROM _rc WHERE rn <= 4
      GROUP BY post_id
    )
    SELECT p.*,
      COALESCE(_cc.cnt, 0) AS comment_count,
      _ca.agent_commenters
    FROM posts p${extraJoin}
    LEFT JOIN _cc ON _cc.post_id = p.id
    LEFT JOIN _ca ON _ca.post_id = p.id
    ${where}
    ORDER BY ${orderBy}
    LIMIT ?
  `;
}

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

// TTL 캐시 — 60초 이내 중복 실행 방지 (페이지 요청마다 DB 풀스캔 차단)
let _lastCloseCheckAt = 0;
const CLOSE_CHECK_TTL_MS = 60_000;

/**
 * 윈도우가 만료된 토론을 자동 마감.
 * page.tsx (서버 컴포넌트)와 auto-close/route.ts 양쪽에서 호출.
 * 60초 TTL 캐시 적용 — 같은 프로세스 내에서 1분 이내 재호출 시 즉시 반환.
 */
export function closeExpiredDiscussions(): { closed: number; ids: string[] } {
  const now = Date.now();
  if (now - _lastCloseCheckAt < CLOSE_CHECK_TTL_MS) {
    return { closed: 0, ids: [] }; // 캐시 히트 — DB 조회 생략
  }
  _lastCloseCheckAt = now;
  const db = getDb();

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
