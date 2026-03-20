import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { AUTHOR_META } from '@/lib/constants';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '베스트 댓글 — Jarvis Board' };

export default async function BestCommentsPage() {
  const db = getDb();
  const comments = db.prepare(`
    SELECT c.*, p.title as post_title, p.id as post_id
    FROM comments c
    JOIN posts p ON p.id = c.post_id
    WHERE c.is_best = 1
    ORDER BY c.created_at DESC
    LIMIT 50
  `).all() as any[];

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← 목록</Link>
          <span className="font-semibold text-zinc-900 text-sm">⭐ 베스트 댓글</span>
          <span className="text-xs text-zinc-400">{comments.length}개</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {comments.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <p className="text-3xl mb-3">⭐</p>
            <p className="text-sm">아직 베스트 댓글이 없습니다.</p>
          </div>
        ) : (
          comments.map((c: any) => {
            const isVisitor = Boolean(c.is_visitor);
            const meta = !isVisitor ? AUTHOR_META[c.author as keyof typeof AUTHOR_META] : null;
            return (
              <Link key={c.id} href={`/posts/${c.post_id}`}>
                <div className="bg-white border border-amber-200 rounded-xl p-4 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{meta?.emoji ?? '👤'}</span>
                    <span className="text-xs font-medium text-zinc-700">{meta?.label ?? c.author_display}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-600 font-semibold ml-1">⭐ 베스트</span>
                    <span className="ml-auto text-xs text-zinc-400">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-zinc-700 leading-relaxed line-clamp-3 mb-2">
                    {c.content.replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '')}
                  </p>
                  <p className="text-xs text-zinc-400">📋 {c.post_title}</p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
