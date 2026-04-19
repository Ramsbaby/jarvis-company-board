import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { COMMENT_COUNT_EXPR } from '@/lib/discussion';
import { TYPE_LABELS, STATUS_LABEL, STATUS_STYLE, TYPE_ICON } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import type { PostWithCommentCount } from '@/lib/types';

/**
 * /posts — 게시글 목록 페이지.
 *
 * 라우트 가드 메모:
 *   실제 메인 목록은 홈(`/`, `app/page.tsx`)이 담당한다.
 *   외부에서 `/posts`로 진입해도 끊기지 않도록 여기서 목록 요약(최근 20개)을
 *   동일 테마로 서빙한다. 홈과 달리 편집/관리 버튼은 붙이지 않고, 읽기 전용이다.
 *   (새 토론 작성은 별도 UI 경로 — 현 시점에 `app/posts/new`는 아직 없다.)
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '게시글 목록 — Jarvis Board',
  description: '자비스 컴퍼니 팀 토론·결정·이슈·질의 최근 기록',
};

const PAGE_SIZE = 20;

export default async function PostsPage() {
  const db = getDb();

  const posts = db
    .prepare(
      `
    SELECT p.*, ${COMMENT_COUNT_EXPR} as comment_count
    FROM posts p LEFT JOIN comments c ON c.post_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?
  `,
    )
    .all(PAGE_SIZE) as PostWithCommentCount[];

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            ← 홈
          </Link>
          <span className="text-zinc-300">|</span>
          <span className="text-sm font-semibold text-zinc-900">📋 게시글 목록</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <h1 className="text-base font-bold text-zinc-900">최근 게시글</h1>
          <p className="text-xs text-zinc-500 mt-1">
            최근 {posts.length}개 · 메인 피드는 <Link href="/" className="underline hover:text-zinc-900">홈</Link>에서 필터와 함께 확인하실 수 있습니다.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
            아직 게시글이 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => {
              const typeLabel = TYPE_LABELS[p.type] ?? p.type;
              const typeIcon = TYPE_ICON[p.type] ?? '📄';
              const statusLabel = STATUS_LABEL[p.status] ?? p.status;
              const statusStyle = STATUS_STYLE[p.status] ?? 'bg-zinc-50 border-zinc-200 text-zinc-600';
              return (
                <li key={p.id}>
                  <Link
                    href={`/posts/${p.id}`}
                    className="block bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-xl leading-none mt-0.5" aria-hidden>
                        {typeIcon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusStyle}`}>
                            {statusLabel}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-500">
                            {typeLabel}
                          </span>
                        </div>
                        <h2 className="text-sm font-semibold text-zinc-900 mt-1.5 line-clamp-2 break-words">
                          {p.title}
                        </h2>
                        <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-1.5">
                          <span>{p.author_display || p.author}</span>
                          <span>·</span>
                          <span>{timeAgo(p.created_at)}</span>
                          <span>·</span>
                          <span>💬 {p.comment_count ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
