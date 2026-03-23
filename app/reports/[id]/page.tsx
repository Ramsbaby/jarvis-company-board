import { getDb } from '@/lib/db';
import type { Post, Comment } from '@/lib/types';
import { cookies } from 'next/headers';
import { makeToken, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import MarkdownContent from '@/components/MarkdownContent';
import MobileBottomNav from '@/components/MobileBottomNav';
import PostComments from '@/components/PostComments';

export const dynamic = 'force-dynamic';

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function getSubtype(tags: string[]): string {
  if (tags.includes('daily')) return '일일';
  if (tags.includes('weekly')) return '주간';
  if (tags.includes('monthly')) return '월간';
  return '보고서';
}

const SUBTYPE_COLOR: Record<string, string> = {
  '일일': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  '주간': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '월간': 'bg-amber-100 text-amber-700 border-amber-200',
  '보고서': 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  if (!isOwner) {
    redirect('/login');
  }

  const report = db.prepare(`SELECT * FROM posts WHERE id = ? AND type = 'report'`).get(id) as Post | undefined;
  if (!report) notFound();

  const tags = parseTags(report.tags);
  const subtype = getSubtype(tags);
  const subtypeColor = SUBTYPE_COLOR[subtype] ?? SUBTYPE_COLOR['보고서'];

  const comments = db.prepare(`
    SELECT c.*,
      COALESCE(c.ai_summary, '') as ai_summary
    FROM comments c
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(id) as Comment[];

  const dateStr = new Date(report.created_at + 'Z').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <div className="bg-zinc-50 min-h-screen pb-20 md:pb-0">
      <MobileBottomNav isOwner={isOwner} />
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/reports" className="text-zinc-400 hover:text-zinc-700 text-sm transition-colors">← 보고서</Link>
          <span className="text-zinc-300">|</span>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${subtypeColor}`}>
            {subtype}보고서
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Report card */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-zinc-100">
            <h1 className="text-lg font-bold text-zinc-900">{report.title}</h1>
            <p className="text-xs text-zinc-400 mt-1">{dateStr} · 🤖 Jarvis AI 자동 생성</p>
          </div>
          <div className="px-6 py-5">
            <MarkdownContent content={report.content} />
          </div>
        </div>

        {/* Comments section - team members can comment */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-700">💬 팀 피드백</span>
            <span className="text-xs text-zinc-400">{comments.length}개</span>
          </div>
          {(isOwner || isGuest) ? (
            <PostComments
              postId={id}
              initialComments={comments}
              isOwner={isOwner}
              postCreatedAt={report.created_at}
              postStatus="resolved"
              pausedAt={null}
              hideResolutionCard={true}
            />
          ) : (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">
              댓글을 달려면 <Link href="/login" className="text-indigo-600 hover:underline">로그인</Link>하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
