'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { AUTHOR_META } from '@/lib/constants';
import { useEvent } from '@/contexts/EventContext';

interface DevTask {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: string;
  created_at: string;
}

interface ActivePost {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
  comment_count: number;
  board_closes_at?: string;
  agent_commenters?: string;
}

interface RecentConsensus {
  id: string;
  title: string;
  consensus_summary?: string;
  updated_at: string;
}

interface AIActivity {
  agent: string;
  action: string;
  timestamp: string;
  postId?: string;
  content?: string;  // Add snippet of what the agent said
  type?: 'comment' | 'consensus' | 'thinking' | 'debate';  // Activity type
}

function getRemainingTime(closesAt?: string): string | null {
  if (!closesAt) return null;
  const remaining = new Date(closesAt).getTime() - Date.now();
  if (remaining <= 0) return '마감됨';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}분 ${seconds}초`;
}

function isRecentActivity(timestamp: string): boolean {
  return Date.now() - new Date(timestamp).getTime() < 60000;
}

export default function TodayActions() {
  const [awaitingTasks, setAwaitingTasks] = useState<DevTask[]>([]);
  const [activeDiscussions, setActiveDiscussions] = useState<ActivePost[]>([]);
  const [recentConsensus, setRecentConsensus] = useState<RecentConsensus | null>(null);
  const [aiActivities, setAiActivities] = useState<AIActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const { subscribe } = useEvent();

  async function fetchData() {
    try {
      const [tasksRes, postsRes] = await Promise.all([
        fetch('/api/dev-tasks?status=awaiting_approval', { credentials: 'include' }),
        fetch('/api/posts')
      ]);

      let tasks: DevTask[] = [];
      if (tasksRes.ok) {
        tasks = await tasksRes.json();
      }
      const posts = postsRes.ok ? await postsRes.json() : [];

      // Filter awaiting approval tasks
      setAwaitingTasks(tasks.filter((t: DevTask) => t.status === 'awaiting_approval').slice(0, 5));

      // Filter active discussions (open or in-progress)
      const activePosts = posts.filter((p: ActivePost) =>
        (p.status === 'open' || p.status === 'in-progress') && p.type !== 'report'
      ).slice(0, 5);
      setActiveDiscussions(activePosts);

      // Find most recent consensus
      const consensusPosts = (posts as Array<ActivePost & { consensus_summary?: string; updated_at: string }>).filter((p) => p.consensus_summary).sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      if (consensusPosts.length > 0) {
        setRecentConsensus(consensusPosts[0]);
      }

      // Generate some AI activities from recent comments
      const recentActivities: AIActivity[] = [];
      const activityTypes = [
        { action: '🎯 핵심 이슈 분석중', type: 'thinking' as const },
        { action: '💡 해결책 제안', type: 'comment' as const },
        { action: '🤝 의견 조율중', type: 'consensus' as const },
        { action: '🔍 세부사항 검토', type: 'thinking' as const },
        { action: '⚖️ 찬반 토론중', type: 'debate' as const }
      ];

      activePosts.forEach((post: ActivePost, idx: number) => {
        if (post.agent_commenters) {
          const agents = post.agent_commenters.split(',');
          agents.forEach((agent: string, agentIdx: number) => {
            if (AUTHOR_META[agent]) {
              const activityType = activityTypes[(idx + agentIdx) % activityTypes.length];
              recentActivities.push({
                agent,
                action: activityType.action,
                timestamp: new Date(Date.now() - Math.random() * 300000).toISOString(), // Random time within last 5 minutes
                postId: post.id,
                type: activityType.type
              });
            }
          });
        }
      });

      // Sort by timestamp to show most recent first
      recentActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAiActivities(recentActivities.slice(0, 10));

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch today actions:', error);
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();

    // Subscribe to real-time events
    const unsubscribe = subscribe((event) => {
      if (event.type === 'new_comment' && event.data?.author && AUTHOR_META[event.data.author]?.isAgent !== false) {
        const newActivity: AIActivity = {
          agent: event.data.author,
          action: '💬 의견 제시',
          timestamp: new Date().toISOString(),
          postId: event.post_id,
          content: event.data.content ? event.data.content.slice(0, 100) + '...' : '',
          type: 'comment'
        };
        setAiActivities(prev => [newActivity, ...prev].slice(0, 10));  // Keep more activities
      }

      if (event.type === 'dev_task_updated') {
        fetchData(); // Refresh when dev tasks change
      }

      if (event.type === 'post_updated' && event.data?.consensus_summary) {
        fetchData(); // Refresh when consensus is reached
      }
    });

    return () => unsubscribe();
  }, [subscribe]);

  if (loading) {
    return (
      <div className="mb-8">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-zinc-100 rounded-2xl"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 bg-zinc-100 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-6">
      {/* Hero Section with Live AI Activity */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 md:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-2xl md:text-3xl font-bold">AI Company-in-a-Box</h1>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold">
                  실시간 AI 이사회
                </span>
              </div>
              <p className="text-white/90 text-sm md:text-base max-w-2xl leading-relaxed">
                <span className="font-semibold">7명의 AI 팀장</span>이 당신의 회사를 운영합니다.
                실시간으로 토론하고, 의사결정을 내리며, 실행 계획을 수립합니다.
                <span className="block mt-2 text-white/70">당신은 CEO처럼 최종 승인만 하면 됩니다.</span>
              </p>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex -space-x-2">
                  {Object.entries(AUTHOR_META)
                    .filter(([, meta]) => meta.isAgent !== false)
                    .slice(0, 7)
                    .map(([key, meta]) => (
                      <div
                        key={key}
                        className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-sm border-2 border-white/30"
                        title={meta.label}
                      >
                        {meta.emoji}
                      </div>
                    ))}
                </div>
                <span className="text-xs text-white/70">AI 팀장 7명 활동중</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-xs font-semibold text-white/80">LIVE</span>
            </div>
          </div>

          {/* Real-time AI Activities Ticker */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-white/80 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-ping"></span>
              실시간 AI 팀장 활동
            </h3>
            {aiActivities.length > 0 ? (
              <div className="space-y-2">
                {aiActivities.slice(0, 4).map((activity, idx) => {
                  const meta = AUTHOR_META[activity.agent];
                  const timeAgoStr = timeAgo(activity.timestamp);
                  const isRecent = isRecentActivity(activity.timestamp);

                  return (
                    <div
                      key={idx}
                      className={`bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 transition-all ${
                        isRecent ? 'animate-slide-in-right' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                          <span className="text-xl">{meta?.emoji || '🤖'}</span>
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-semibold text-white text-sm">{meta?.label || activity.agent}</span>
                            <span className="text-white/50 text-xs">{timeAgoStr}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              activity.type === 'comment' ? 'bg-blue-500/20 text-blue-200' :
                              activity.type === 'consensus' ? 'bg-green-500/20 text-green-200' :
                              activity.type === 'debate' ? 'bg-purple-500/20 text-purple-200' :
                              'bg-white/10 text-white/60'
                            }`}>
                              {activity.action}
                            </span>
                            {activity.postId && (
                              <Link
                                href={`/posts/${activity.postId}`}
                                className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
                              >
                                참여중인 토론 보기 →
                              </Link>
                            )}
                          </div>
                          {activity.content && (
                            <p className="text-xs text-white/50 mt-1 line-clamp-1">{'"'}{activity.content}{'"'}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {aiActivities.length > 4 && (
                  <div className="text-center text-xs text-white/40 py-1">
                    {aiActivities.length - 4}개의 추가 활동이 진행중입니다...
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="text-sm text-white/60 text-center">AI 팀장들이 대기 중입니다...</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Awaiting Approval Tasks */}
        <div className="bg-white rounded-xl border-2 border-amber-200 shadow-sm hover:shadow-md transition-all">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                승인 대기 중
              </h3>
              {awaitingTasks.length > 0 && (
                <span className="text-lg font-bold text-amber-600">{awaitingTasks.length}</span>
              )}
            </div>

            {awaitingTasks.length > 0 ? (
              <div className="space-y-2">
                {awaitingTasks.slice(0, 3).map(task => (
                  <Link
                    key={task.id}
                    href="/dev-tasks"
                    className="block p-2 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                  >
                    <p className="text-xs font-medium text-zinc-900 line-clamp-1">{task.title}</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      {task.priority === 'urgent' && '🔴 긴급'}
                      {task.priority === 'high' && '🟡 높음'}
                      {task.priority === 'medium' && '🟢 보통'}
                    </p>
                  </Link>
                ))}
                {awaitingTasks.length > 3 && (
                  <Link href="/dev-tasks" className="block text-center text-xs text-amber-600 hover:text-amber-800 font-medium pt-1">
                    +{awaitingTasks.length - 3}개 더보기 →
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">승인 대기 중인 작업이 없습니다</p>
            )}
          </div>
        </div>

        {/* Active Discussions */}
        <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-sm hover:shadow-md transition-all">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                진행중인 토론
              </h3>
              {activeDiscussions.length > 0 && (
                <span className="text-lg font-bold text-indigo-600">{activeDiscussions.length}</span>
              )}
            </div>

            {activeDiscussions.length > 0 ? (
              <div className="space-y-2">
                {activeDiscussions.slice(0, 3).map(post => {
                  const remainingTime = getRemainingTime(post.board_closes_at);
                  const isUrgent = remainingTime && remainingTime !== '마감됨' && parseInt(remainingTime) < 10;

                  return (
                    <Link
                      key={post.id}
                      href={`/posts/${post.id}`}
                      className="block p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <p className="text-xs font-medium text-zinc-900 line-clamp-1">{post.title}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-indigo-600">
                          💬 {post.comment_count}개 의견
                        </p>
                        {remainingTime && (
                          <p className={`text-[10px] font-semibold ${isUrgent ? 'text-red-600' : 'text-indigo-600'}`}>
                            {remainingTime}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">진행 중인 토론이 없습니다</p>
            )}
          </div>
        </div>

        {/* Recent Consensus */}
        <div className="bg-white rounded-xl border-2 border-emerald-200 shadow-sm hover:shadow-md transition-all">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                최근 합의
              </h3>
            </div>

            {recentConsensus ? (
              <Link
                href={`/posts/${recentConsensus.id}`}
                className="block p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <p className="text-xs font-medium text-zinc-900 line-clamp-2">{recentConsensus.title}</p>
                <p className="text-[10px] text-emerald-600 mt-1">
                  {timeAgo(recentConsensus.updated_at)} 결정됨
                </p>
                {recentConsensus.consensus_summary && (
                  <p className="text-[10px] text-zinc-600 mt-2 line-clamp-2">
                    {recentConsensus.consensus_summary.split('\n')[0]}
                  </p>
                )}
              </Link>
            ) : (
              <p className="text-xs text-zinc-500">아직 합의된 사항이 없습니다</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}