import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { AUTHOR_META, TYPE_LABELS, STATUS_LABEL, STATUS_STYLE, TYPE_COLOR, TYPE_ICON, getDiscussionWindow } from '@/lib/constants';
import type { Post, Comment, Poll, PollVoteCount, CountRow } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { makeToken, GUEST_COOKIE, isValidGuestToken } from '@/lib/auth';
import { maskPost, maskComment } from '@/lib/mask';
import { GUEST_POLICY } from '@/lib/guest-policy';
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
import PeerVotePanel from '@/components/sidebar/PeerVotePanel';
import ForceCloseButton from '@/components/ForceCloseButton';
import ExtendDiscussionButton from '@/components/ExtendDiscussionButton';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT title, content, type, author_display, created_at, status FROM posts WHERE id = ?').get(id) as Pick<Post, 'title' | 'content' | 'type' | 'author_display' | 'created_at' | 'status'> | undefined;
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
  strategy: '사업 방향성 또는 전략적 의사결정입니다. 충분한 논의 후 확정합니다.',
  tech:     '기술·개발·아키텍처에 관한 토론입니다. 기술 팀이 최선안을 도출합니다.',
  ops:      '운영·프로세스·리소스 관련 논의입니다. 실행 방식을 개선합니다.',
  risk:     '리스크·문제·인시던트 보고입니다. 신속 대응이 필요한 사안입니다.',
  review:   '성과 검토·지표 분석·회고입니다. 팀의 실적과 방향을 점검합니다.',
  // 레거시
  decision: '팀이 최종 결정한 사안입니다. 실행이 확정된 내용을 기록합니다.',
  discussion: '시한부 토론입니다. 팀원들이 의견을 나눠 최선의 결론을 만듭니다.',
  issue: '발견된 문제나 이슈입니다. 감지 → 보고 → 처리 과정 전체를 추적합니다.',
  inquiry: '팀 내 질의사항입니다. 담당 팀의 답변이 필요한 사안입니다.',
};


export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;
  if (!post) notFound();

  // Polls (#10)
  const rawPolls = db.prepare('SELECT * FROM polls WHERE post_id = ? ORDER BY created_at ASC').all(id) as Poll[];
  const polls = rawPolls.map((poll) => {
    const options: string[] = JSON.parse(poll.options);
    const votes = db.prepare(
      'SELECT option_idx, COUNT(*) as cnt FROM poll_votes WHERE poll_id = ? GROUP BY option_idx'
    ).all(poll.id) as PollVoteCount[];
    const voteMap: Record<number, number> = {};
    for (const v of votes) voteMap[v.option_idx] = v.cnt;
    const totalVotes = votes.reduce((s, v) => s + v.cnt, 0);
    return { ...poll, options, votes: options.map((_, i) => voteMap[i] ?? 0), totalVotes };
  });

  const comments = db.prepare(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC'
  ).all(id) as Comment[];

  // DEV tasks linked to this post (post_id column added via migration in lib/db.ts)
  const devTaskCount = (db.prepare('SELECT COUNT(*) as cnt FROM dev_tasks WHERE post_id = ?').get(post.id) as CountRow | undefined)?.cnt ?? 0;

  // 관련 태스크 목록 (post_id 또는 source로 조회)
  interface DevTaskRow { id: string; title: string; status: string; priority: string; completed_at: string | null; changed_files: string | null }
  const devTasks = db.prepare(
    `SELECT id, title, status, priority, completed_at, changed_files FROM dev_tasks
     WHERE post_id = ? OR source = ?
     ORDER BY created_at DESC LIMIT 10`
  ).all(post.id, `board:${post.id}`) as DevTaskRow[];

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
  const allRenderComments = isGuest ? comments.map(maskComment) : comments;
  const hiddenCommentCount = isGuest ? Math.max(0, allRenderComments.length - GUEST_POLICY.MAX_COMMENTS) : 0;
  const renderComments = isGuest ? allRenderComments.slice(0, GUEST_POLICY.MAX_COMMENTS) : allRenderComments;

  const isActive = post.status !== 'resolved';
  const timerBase = post.restarted_at ?? post.created_at;
  const extraMs = post.extra_ms ?? 0;
  const discussionWindowMs = getDiscussionWindow(post.type);
  const postExpiresAt = new Date(new Date(timerBase + 'Z').getTime() + discussionWindowMs + extraMs).toISOString();
  // eslint-disable-next-line react-hooks/purity
  const isTimedOut = isActive && Date.now() > new Date(timerBase + 'Z').getTime() + discussionWindowMs + extraMs;
  const displayStatus = isTimedOut ? 'conclusion-pending' : post.status;
  const isResolved = post.status === 'resolved';
  const regularComments = comments.filter((c) => !c.is_resolution);
  const autoConsensus = isResolved && isOwner && !post.consensus_at && regularComments.length > 0;

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
          postType={post.type}
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
            {/* ── Resolved: Awards Ceremony (시상식) — TOP of main content ── */}
            {isResolved && comments.length > 0 && (
              <PeerVotePanel postId={id} comments={comments} variant="ceremony" />
            )}
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
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-2 leading-tight">{renderPost.title}</h1>

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
                    postType={post.type}
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

            {/* ── Owner Executive Summary — 마감 토론 한눈에 보기 ── */}
            {isOwner && isResolved && (
              <div className="mb-5 rounded-xl overflow-hidden border border-indigo-100 shadow-sm shadow-indigo-50/50 bg-white">
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 flex items-center gap-2">
                  <span className="text-white text-base">📋</span>
                  <span className="text-white font-bold text-sm">대표 요약 — 한눈에 보기</span>
                  {post.resolved_at && (
                    <span className="ml-auto text-indigo-200 text-xs">
                      {new Date(post.resolved_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 마감
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-zinc-100">
                  <div className="p-4 text-center">
                    <p className="text-2xl font-black text-zinc-800">{comments.filter((c) => !c.is_resolution && !c.is_visitor).length}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">AI 의견</p>
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-2xl font-black text-zinc-800">{comments.filter((c) => c.is_visitor).length}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">팀원 의견</p>
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-2xl font-black text-zinc-800">{comments.filter((c) => c.is_resolution).length > 0 ? '✓' : '—'}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">결론 채택</p>
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-2xl font-black text-zinc-800">{post.consensus_at ? '✓' : '⏳'}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">합의 분석</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Owner Action Panel ── */}
            {isOwner && (
              <div className="mb-5 rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                {/* Toolbar: primary actions — all left-aligned, same height */}
                <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 bg-zinc-50/60">
                  {isActive && <ForceCloseButton postId={id} />}
                  {isActive && <ExtendDiscussionButton postId={id} />}
                  {displayStatus !== 'open' && <RestartDiscussionButton postId={id} />}
                </div>
                {/* Consensus panel — autoTrigger for resolved posts with no analysis */}
                {comments.length > 0 && (
                  <div className="border-t border-zinc-100 px-1 py-1">
                    <ConsensusPanel key={post.restarted_at ?? post.created_at} postId={id} autoTrigger={autoConsensus} />
                  </div>
                )}
                {/* Danger zone */}
                <div className="px-3 py-2 border-t border-zinc-100 flex items-center justify-end">
                  <DeletePostButton postId={id} />
                </div>
              </div>
            )}

            {/* Comments */}
            <PostComments postId={id} initialComments={renderComments} isOwner={isOwner} postCreatedAt={renderPost.created_at} postStatus={renderPost.status} pausedAt={post.paused_at ?? null} restartedAt={post.restarted_at ?? null} postType={post.type} extraMs={post.extra_ms ?? 0} hideResolutionCard={isOwner && !!post.consensus_summary} hiddenCommentCount={hiddenCommentCount} />
            {/* Mobile: Peer votes + Related posts below comments */}
            <div className="md:hidden mt-4 space-y-3">
              {post.status !== 'resolved' && comments.length > 0 && (
                <PeerVotePanel postId={id} comments={comments} />
              )}
              <RelatedPosts postId={id} isGuest={isGuest} />
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
                    <span className="font-medium text-zinc-700">{regularComments.length}개</span>
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
                <DiscussionTimeline comments={renderComments} postId={id} />
              )}
              {/* 인사고과 결과 — 마감된 토론은 메인에 시상식으로 표시, 활성 토론에서만 사이드바 유지 */}
              {post.status !== 'resolved' && comments.length > 0 && (
                <PeerVotePanel postId={id} comments={comments} />
              )}
              {/* 이 토론에서 생성된 개발 태스크 */}
              {devTasks.length > 0 && (
                <div className="rounded-xl border border-zinc-200 overflow-hidden">
                  <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                    <h3 className="text-sm font-semibold text-zinc-700">⚙ 개발 태스크 ({devTasks.length})</h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">이 토론에서 도출된 실행 항목</p>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {devTasks.map((t: DevTaskRow) => {
                      const statusCfg: Record<string, { dot: string; label: string }> = {
                        awaiting_approval: { dot: 'bg-amber-400', label: '검토중' },
                        approved: { dot: 'bg-teal-400', label: '승인됨' },
                        'in-progress': { dot: 'bg-indigo-400', label: '작업중' },
                        done: { dot: 'bg-emerald-400', label: '완료' },
                        rejected: { dot: 'bg-zinc-300', label: '반려' },
                        failed: { dot: 'bg-red-400', label: '실패' },
                      };
                      const sc = statusCfg[t.status] ?? { dot: 'bg-zinc-300', label: t.status };
                      const changedCount = (() => { try { return JSON.parse(t.changed_files || '[]').length; } catch { return 0; } })();
                      return (
                        <Link key={t.id} href={`/dev-tasks/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition-colors">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                          <span className="text-xs text-zinc-700 flex-1 truncate">{t.title}</span>
                          <span className="text-[10px] text-zinc-400 shrink-0">{sc.label}</span>
                          {t.status === 'done' && changedCount > 0 && (
                            <span className="text-[10px] text-emerald-600 shrink-0">📁 {changedCount}</span>
                          )}
                          {t.status === 'done' && changedCount === 0 && (
                            <span className="text-[10px] text-yellow-600 shrink-0">⚠ 변경없음</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              <RelatedPosts postId={id} isGuest={isGuest} />
            </div>
          </aside>

        </div>
      </div>
    </main>
  );
}
