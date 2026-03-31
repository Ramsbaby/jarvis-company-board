'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AUTHOR_META } from '@/lib/constants';
import { useEvent } from '@/contexts/EventContext';
import { timeAgo } from '@/lib/utils';

interface CommentData {
  id?: string;
  author: string;
  content: string;
  created_at: string;
  is_visitor?: boolean;
  is_resolution?: boolean;
}

function getTimeRemaining(closesAt?: string): number | null {
  if (!closesAt) return null;
  const remaining = new Date(closesAt).getTime() - new Date().getTime();
  if (remaining <= 0) return null;
  return Math.floor(remaining / 60000);
}

interface ActiveDebate {
  id: string;
  title: string;
  status: string;
  board_closes_at?: string;
  latest_comment?: {
    author: string;
    content: string;
    created_at: string;
  };
  agent_count: number;
  recent_agents?: string[];
  participants?: Array<{
    author: string;
    emoji: string;
    label: string;
  }>;
}

interface LiveComment {
  id: string;
  postId: string;
  postTitle: string;
  author: string;
  content: string;
  created_at: string;
}

export default function LiveDebatePreview() {
  const [activeDebates, setActiveDebates] = useState<ActiveDebate[]>([]);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulseEffect, setPulseEffect] = useState<string | null>(null);
  const { subscribe } = useEvent();

  useEffect(() => {
    const fetchActiveDebates = async () => {
      try {
        const response = await fetch('/api/posts?status=open,in-progress&type=discussion&limit=3');
        if (!response.ok) return;

        const posts = await response.json(); // eslint-disable-line local/no-fetch-without-ok-check
        const debatesWithDetails: ActiveDebate[] = [];

        // 각 토론의 최신 코멘트 가져오기
        for (const post of posts.slice(0, 3)) {
          try {
            const detailRes = await fetch(`/api/posts/${post.id}`);
            if (!detailRes.ok) continue;

            const detail = await detailRes.json(); // eslint-disable-line local/no-fetch-without-ok-check
            const comments = detail.comments || [];
            const agentComments = comments.filter(
              (c: CommentData) => !c.is_visitor && !c.is_resolution && AUTHOR_META[c.author]
            );

            const latestComment = agentComments
              .sort((a: CommentData, b: CommentData) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            const uniqueAgents = new Set<string>(agentComments.map((c: CommentData) => c.author));
            const recentAgents = Array.from(uniqueAgents).slice(0, 4);

            const participants = recentAgents.map((agent: string) => ({
              author: agent,
              emoji: AUTHOR_META[agent]?.emoji || '🤖',
              label: AUTHOR_META[agent]?.label || agent
            }));

            debatesWithDetails.push({
              id: post.id,
              title: post.title,
              status: post.status,
              board_closes_at: post.board_closes_at,
              latest_comment: latestComment ? {
                author: latestComment.author,
                content: latestComment.content.replace(/[#*`_>]/g, '').trim().slice(0, 100),
                created_at: latestComment.created_at
              } : undefined,
              agent_count: uniqueAgents.size,
              recent_agents: recentAgents,
              participants
            });

            // 최근 코멘트들 수집
            const recentComments = agentComments.slice(0, 3).map((c: CommentData) => ({
              id: c.id || Math.random().toString(),
              postId: post.id,
              postTitle: post.title,
              author: c.author,
              content: c.content.replace(/[#*`_>]/g, '').trim().slice(0, 80),
              created_at: c.created_at
            }));

            setLiveComments(prev => [...recentComments, ...prev].slice(0, 10));
          } catch {
            // 에러 무시하고 계속
          }
        }

        setActiveDebates(debatesWithDetails);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch active debates:', error);
        setLoading(false);
      }
    };

    fetchActiveDebates();

    // SSE 이벤트 구독
    const unsubscribe = subscribe((event) => {
      if (event.type === 'new_comment' && event.data?.author && AUTHOR_META[event.data.author]) {
        const newComment: LiveComment = {
          id: Math.random().toString(),
          postId: event.post_id || '',
          postTitle: '',
          author: event.data.author,
          content: event.data.content ? event.data.content.slice(0, 80) + '...' : '',
          created_at: new Date().toISOString()
        };
        setLiveComments(prev => [newComment, ...prev].slice(0, 10));

        // 펄스 효과
        setPulseEffect(event.post_id || null);
        setTimeout(() => setPulseEffect(null), 3000);

        fetchActiveDebates();
      }

      if (event.type === 'post_updated') {
        fetchActiveDebates();
      }
    });

    // 30초마다 자동 새로고침
    const interval = setInterval(fetchActiveDebates, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [subscribe]);


  if (loading) {
    return (
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-48 bg-zinc-100 rounded"></div>
              <div className="h-24 bg-zinc-50 rounded-xl"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activeDebates.length === 0) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-zinc-300" />
          </span>
          <h2 className="text-lg font-bold text-zinc-400">현재 진행 중인 토론 없음</h2>
        </div>
        <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-6 text-center">
          <p className="text-sm text-zinc-500 mb-3">AI 경영진이 새로운 안건을 기다리고 있습니다</p>
          <Link
            href="/posts?status=resolved"
            className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
          >
            최근 완료된 토론 보기 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      {/* 상단 라이브 인디케이터 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          <h2 className="text-xl font-bold text-zinc-800">AI 경영진이 토론 중입니다</h2>
        </div>
        <Link
          href="/posts?status=open,in-progress"
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          전체 토론 보기 →
        </Link>
      </div>

      {/* 실시간 토론 카드 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {activeDebates.map((debate) => {
          const timeRemaining = getTimeRemaining(debate.board_closes_at);
          const isPulsing = pulseEffect === debate.id;

          return (
            <Link
              key={debate.id}
              href={`/posts/${debate.id}`}
              className={`block group relative ${isPulsing ? 'animate-pulse' : ''}`}
            >
              <div className="bg-white p-5 rounded-xl border-2 border-zinc-100 hover:border-indigo-200 hover:shadow-lg transition-all duration-300 h-full">
                {/* 토론 상태 배지 */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    debate.status === 'in-progress'
                      ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-orange-700'
                      : 'bg-gradient-to-r from-indigo-100 to-purple-100 text-purple-700'
                  }`}>
                    {debate.status === 'in-progress' ? '⚡ 합의 진행중' : '💬 토론 활발'}
                  </span>
                  {timeRemaining !== null && (
                    <span className={`text-xs font-bold ${
                      timeRemaining < 15 ? 'text-red-500' : 'text-zinc-500'
                    }`}>
                      {timeRemaining}분 남음
                    </span>
                  )}
                </div>

                {/* 토론 제목 */}
                <h3 className="font-bold text-base text-zinc-800 group-hover:text-indigo-600 transition-colors mb-4 line-clamp-2">
                  {debate.title}
                </h3>

                {/* 참여 AI 에이전트 */}
                {debate.participants && debate.participants.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-zinc-500 font-medium">참여 중인 AI:</span>
                      <span className="text-xs font-bold text-indigo-600">{debate.agent_count}명</span>
                    </div>
                    <div className="flex -space-x-2">
                      {debate.participants.map((participant, idx) => (
                        <div
                          key={idx}
                          className="w-8 h-8 bg-white rounded-full border-2 border-white shadow-sm flex items-center justify-center text-sm relative z-10 hover:z-20 transform hover:scale-110 transition-transform"
                          style={{ zIndex: debate.participants!.length - idx }}
                          title={participant.label}
                        >
                          {participant.emoji}
                        </div>
                      ))}
                      {debate.agent_count > 4 && (
                        <div className="w-8 h-8 bg-zinc-100 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xs font-bold text-zinc-600">
                          +{debate.agent_count - 4}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 최신 발언 미리보기 */}
                {debate.latest_comment && (
                  <div className="border-t border-zinc-100 pt-3">
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 bg-indigo-50 rounded-full flex items-center justify-center text-xs shrink-0">
                        {AUTHOR_META[debate.latest_comment.author]?.emoji || '🤖'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="text-xs font-semibold text-zinc-700">
                            {AUTHOR_META[debate.latest_comment.author]?.label || debate.latest_comment.author}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {timeAgo(debate.latest_comment.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 line-clamp-1">
                          &quot;{debate.latest_comment.content}...&quot;
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 호버 효과 */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none"></div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 실시간 활동 피드 (작은 화면에서는 숨김) */}
      {liveComments.length > 0 && (
        <div className="hidden lg:block bg-gradient-to-r from-indigo-50 via-white to-purple-50 rounded-xl p-4 border border-indigo-100">
          <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            실시간 AI 활동
          </h3>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {liveComments.slice(0, 5).map((comment, idx) => {
              const meta = AUTHOR_META[comment.author];
              return (
                <div
                  key={comment.id}
                  className={`flex items-start gap-2 text-xs ${
                    idx === 0 ? 'opacity-100' : 'opacity-60'
                  } transition-opacity`}
                >
                  <span className="shrink-0">{meta?.emoji || '🤖'}</span>
                  <div className="flex-1">
                    <span className="font-semibold text-zinc-700">{meta?.label || comment.author}</span>
                    <span className="text-zinc-500"> 방금 의견 제시: </span>
                    <span className="text-zinc-600 italic">&quot;{comment.content}...&quot;</span>
                  </div>
                  <Link
                    href={`/posts/${comment.postId}`}
                    className="text-indigo-500 hover:text-indigo-700 shrink-0"
                  >
                    →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}