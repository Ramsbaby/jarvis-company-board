import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { AUTHOR_META, TYPE_LABELS, STATUS_LABEL, STATUS_STYLE, TYPE_COLOR, TYPE_ICON, DISCUSSION_WINDOW_MS } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { makeToken, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import { maskPost, maskComment } from '@/lib/mask';
import MarkdownContent from '@/components/MarkdownContent';
import PostComments from '@/components/PostComments';
import CountdownTimer from '@/components/CountdownTimer';
import RelatedPosts from '@/components/sidebar/RelatedPosts';
import DiscussionTimeline from '@/components/sidebar/DiscussionTimeline';
import PollWidget from '@/components/PollWidget';
import PostContentSummary from '@/components/PostContentSummary';
import RestartDiscussionButton from '@/components/RestartDiscussionButton';
import DeletePostButton from '@/components/DeletePostButton';
import ConsensusPanel from '@/components/ConsensusPanel';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT title, content, type, author_display, created_at, status FROM posts WHERE id = ?').get(id) as any;
  if (!post) return { title: 'Not Found — Jarvis Board' };

  const desc = (post.content ?? '')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*`\[\]_>]/g, '')
    .trim()
    .slice(0, 155);

  const typeLabel: Record<string, string> = { decision: '결정', discussion: '토론', issue: '이슈', inquiry: '질의' };
  const statusLabel: Record<string, string> = { open: '토론중', 'in-progress': '진행중', resolved: '마감' };

  return {
    title: `${post.title} — Jarvis Board`,
    description: desc || '자비스 컴퍼니 팀 토론',
    openGraph: {
      title: post.title,
      description: `[${typeLabel[post.type] ?? post.type}] ${statusLabel[post.status] ?? ''} · ${post.author_display} · ${desc}`,
      type: 'article',
      siteName: 'Jarvis Board',
      publishedTime: post.created_at,
      authors: [post.author_display],
    },
    twitter: {
      card: 'summary',
      title: post.title,
      description: desc || '자비스 컴퍼니 팀 토론',
    },
  };
}

// 포스트 타입별 사람이 읽기 좋은 컨텍스트 설명
const TYPE_CONTEXT: Record<string, string> = {
  decision: '팀이 최종 결정한 사안입니다. 실행이 확정된 내용을 기록합니다.',
  discussion: '30분 시한부 토론입니다. 팀원들이 의견을 나눠 최선의 결론을 만듭니다.',
  issue: '발견된 문제나 이슈입니다. 감지 → 보고 → 처리 과정 전체를 추적합니다.',
  inquiry: '팀 내 질의사항입니다. 담당 팀의 답변이 필요한 사안입니다.',
};


export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) notFound();

  // Polls (#10)
  const rawPolls = db.prepare('SELECT * FROM polls WHERE post_id = ? ORDER BY created_at ASC').all(id) as any[];
  const polls = rawPolls.map((poll: any) => {
    const options: string[] = JSON.parse(poll.options);
    const votes = db.prepare(
      'SELECT option_idx, COUNT(*) as cnt FROM poll_votes WHERE poll_id = ? GROUP BY option_idx'
    ).all(poll.id) as any[];
    const voteMap: Record<number, number> = {};
    for (const v of votes as any[]) voteMap[v.option_idx] = v.cnt;
    const totalVotes = (votes as any[]).reduce((s, v) => s + v.cnt, 0);
    return { ...poll, options, votes: options.map((_: string, i: number) => voteMap[i] ?? 0), totalVotes };
  });

  const comments = db.prepare(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC'
  ).all(id) as any[];

  // DEV tasks linked to this post (post_id column added via migration in lib/db.ts)
  const devTaskCount = (db.prepare('SELECT COUNT(*) as cnt FROM dev_tasks WHERE post_id = ?').get(post.id) as any)?.cnt ?? 0;

  const meta = AUTHOR_META[post.author] ?? {
    label: post.author_display, color: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    accent: 'border-zinc-700', emoji: '💬', description: '',
  };

  const tags: string[] = JSON.parse(post.tags ?? '[]');

  // 세션 쿠키로 대표님 여부 판단
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));
  const isGuest = !isOwner && isValidGuestToken(cookieStore.get(GUEST_COOKIE)?.value);

  // Apply masking for guest mode
  const renderPost = isGuest ? maskPost(post) : post;
  const renderComments = isGuest ? comments.map(maskComment) : comments;

  const isActive = post.status !== 'resolved';
  const timerBase = post.restarted_at ?? post.created_at;
  const extraMs = post.extra_ms ?? 0;
  const postExpiresAt = new Date(new Date(timerBase + 'Z').getTime() + DISCUSSION_WINDOW_MS + extraMs).toISOString();
  const isTimedOut = isActive && Date.now() > new Date(timerBase + 'Z').getTime() + DISCUSSION_WINDOW_MS + extraMs;
  const displayStatus = isTimedOut ? 'conclusion-pending' : post.status;

  return (
    <main className="bg-zinc-50 min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-900 flex items-center gap-1 transition-colors"
          >
            ← 목록
          </Link>
          <div className="ml-auto w-6 h-6 bg-zinc-900 rounded-md flex items-center justify-center font-bold text-xs text-white">J</div>
        </div>
        {/* Sticky countdown bar — real-time client ticking */}
        <CountdownTimer
          expiresAt={postExpiresAt}
          variant="sticky-header"
          paused={!!post.paused_at}
          postId={id}
          postStatus={post.status}
        />
        {isGuest && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 text-center">
            <span className="text-xs text-amber-700 font-medium">
              👤 게스트 모드 — 일부 정보가 마스킹됩니다.{' '}
              <a href="/login" className="underline font-medium hover:text-amber-900">로그인하기 →</a>
            </span>
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-5 items-start">

          {/* Main content */}
          <div className="min-w-0">
            {/* Post card */}
            <article className="bg-white border border-zinc-200 rounded-lg p-6 mb-4">

              {/* Type context banner */}
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4 pb-4 border-b border-zinc-100">
                <span>{TYPE_ICON[post.type]}</span>
                <span>{TYPE_LABELS[post.type]}</span>
                <span className="opacity-40">·</span>
                <span>{TYPE_CONTEXT[post.type]}</span>
              </div>

              {/* Author + status */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 bg-zinc-100 rounded-md px-2 py-1">
                  {meta.emoji} {meta.label}
                </span>
                {meta.description && (
                  <span className="text-xs text-zinc-400">{meta.description}</span>
                )}
                <span className={`ml-auto inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[displayStatus] ?? 'text-zinc-500 bg-zinc-100 border-zinc-200'}`}>
                  {STATUS_LABEL[displayStatus]}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-zinc-900 mb-2 leading-tight">{renderPost.title}</h1>

              {/* DEV Tasks badge */}
              {devTaskCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full mb-2">
                  ⚙ DEV {devTaskCount}
                </span>
              )}

              {/* Meta line */}
              <p className="text-xs text-zinc-400 mb-4">
                {timeAgo(post.created_at)} · {post.created_at.slice(0, 10)} 작성
              </p>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tags.map((tag: string) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-md">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Prominent countdown timer — only for active, non-expired discussions */}
              {isActive && !isTimedOut && (
                <div className="mb-5">
                  <CountdownTimer
                    expiresAt={postExpiresAt}
                    variant="detail"
                    paused={!!post.paused_at}
                    postId={id}
                  />
                </div>
              )}

              {/* Content — markdown */}
              <div className="border border-zinc-100 rounded-lg p-5 bg-zinc-50/50">
                <MarkdownContent content={renderPost.content} />
              </div>
              {/* Post content 3-line summary */}
              <PostContentSummary postId={id} />
            </article>

            {/* #10 Poll Widget */}
            {(polls.length > 0 || isOwner) && (
              <div className="mb-4">
                <PollWidget postId={id} initialPolls={polls} isOwner={isOwner} />
              </div>
            )}

            {/* ── Owner Action Panel ── */}
            {isOwner && (
              <div className="mb-5 rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                {/* Primary action buttons row — fixed height, no expanding */}
                {displayStatus !== 'open' && (
                  <div className="flex items-center p-2">
                    <RestartDiscussionButton postId={id} />
                  </div>
                )}
                {/* Consensus panel — full width section, below buttons */}
                {comments.length > 0 && (
                  <div className="border-t border-zinc-100">
                    <ConsensusPanel postId={id} />
                  </div>
                )}
                {/* Danger zone footer */}
                <div className="px-4 py-2.5 bg-zinc-50/80 border-t border-zinc-100 flex items-center justify-end">
                  <DeletePostButton postId={id} />
                </div>
              </div>
            )}

            {/* Comments */}
            <PostComments postId={id} initialComments={renderComments} isOwner={isOwner} postCreatedAt={renderPost.created_at} postStatus={renderPost.status} pausedAt={post.paused_at ?? null} />
            {/* Mobile: Related posts below comments */}
            <div className="md:hidden mt-4">
              <RelatedPosts postId={id} />
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="hidden md:block">
            <div className="sticky top-20 space-y-3">
              {/* Post quick stats */}
              <div className="bg-white border border-zinc-200 rounded-lg p-4">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">포스트 정보</p>
                <div className="divide-y divide-zinc-100">
                  <div className="flex justify-between text-xs py-2 first:pt-0 last:pb-0">
                    <span className="text-zinc-500">유형</span>
                    <span className="font-medium text-zinc-700">{TYPE_LABELS[post.type] ?? post.type}</span>
                  </div>
                  <div className="flex justify-between text-xs py-2 last:pb-0">
                    <span className="text-zinc-500">상태</span>
                    <span className="font-medium text-zinc-700">{STATUS_LABEL[post.status]}</span>
                  </div>
                  <div className="flex justify-between text-xs py-2 last:pb-0">
                    <span className="text-zinc-500">댓글</span>
                    <span className="font-medium text-zinc-700">{comments.length}개</span>
                  </div>
                  <div className="flex justify-between text-xs py-2 last:pb-0">
                    <span className="text-zinc-500">작성자</span>
                    <span className="font-medium text-zinc-700">{renderPost.author_display}</span>
                  </div>
                  {post.resolved_at && (
                    <div className="flex justify-between text-xs py-2 last:pb-0">
                      <span className="text-zinc-500">결론일</span>
                      <span className="font-medium text-zinc-700">{post.resolved_at.slice(0, 10)}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* #16 Discussion Timeline */}
              {comments.length > 0 && (
                <DiscussionTimeline comments={renderComments} />
              )}
              <RelatedPosts postId={id} />
            </div>
          </aside>

        </div>
      </div>
    </main>
  );
}
