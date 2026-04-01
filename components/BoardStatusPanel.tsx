'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useEvent } from '@/contexts/EventContext';
import { timeAgo, truncate } from '@/lib/utils';

interface ActivePost {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
  board_closes_at?: string;
  agent_commenters?: string;
  consensus_summary?: string;
  consensus_at?: string;
}

interface DevTask {
  id: string;
  title: string;
  status: string;
  completed_at?: string;
  result_summary?: string;
}

interface CurrentDiscussion {
  id: string;
  title: string;
  agentCount: number;
  remainingMinutes: number;
}

interface RecentDecision {
  id: string;
  title: string;
  summary: string;
  consensusAt: string;
}

interface JarvisExecution {
  doneCount: number;
  latestSummary: string | null;
}

function getRemainingMinutes(closesAt?: string): number | null {
  if (!closesAt) return null;
  const remaining = new Date(closesAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  return Math.floor(remaining / 60000);
}

function parseAgentCommenters(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // invalid JSON
  }
  return [];
}

export default function BoardStatusPanel() {
  const [discussion, setDiscussion] = useState<CurrentDiscussion | null>(null);
  const [decision, setDecision] = useState<RecentDecision | null>(null);
  const [execution, setExecution] = useState<JarvisExecution>({ doneCount: 0, latestSummary: null });
  const [loading, setLoading] = useState(true);
  const { subscribe } = useEvent();

  const fetchData = useCallback(async () => {
    try {
      const [postsRes, tasksRes] = await Promise.all([
        fetch('/api/posts'),
        fetch('/api/dev-tasks?status=done', { credentials: 'include' }),
      ]);

      // --- Card 1: Current Discussion ---
      const posts: ActivePost[] = postsRes.ok ? await postsRes.json() : [];

      const activePosts = posts.filter(
        (p) =>
          (p.status === 'open' || p.status === 'in-progress') &&
          p.board_closes_at != null,
      );

      let closest: CurrentDiscussion | null = null;
      for (const p of activePosts) {
        const mins = getRemainingMinutes(p.board_closes_at);
        if (mins === null) continue;
        if (!closest || mins < closest.remainingMinutes) {
          closest = {
            id: p.id,
            title: p.title,
            agentCount: parseAgentCommenters(p.agent_commenters).length,
            remainingMinutes: mins,
          };
        }
      }
      setDiscussion(closest);

      // --- Card 2: Recent Decision ---
      const resolvedWithConsensus = posts
        .filter((p) => p.status === 'resolved' && p.consensus_summary && p.consensus_at)
        .sort((a, b) => (b.consensus_at ?? '').localeCompare(a.consensus_at ?? ''));

      const latest = resolvedWithConsensus[0];
      if (latest) {
        setDecision({
          id: latest.id,
          title: latest.title,
          summary: latest.consensus_summary!,
          consensusAt: latest.consensus_at!,
        });
      } else {
        setDecision(null);
      }

      // --- Card 3: Jarvis Execution ---
      const tasks: DevTask[] = tasksRes.ok ? await tasksRes.json() : [];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const recentDone = tasks.filter(
        (t) => t.status === 'done' && t.completed_at && t.completed_at >= sevenDaysAgo,
      );

      const mostRecent = recentDone.sort((a, b) =>
        (b.completed_at ?? '').localeCompare(a.completed_at ?? ''),
      )[0];

      setExecution({
        doneCount: recentDone.length,
        latestSummary: mostRecent?.result_summary ?? null,
      });

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch board status:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const unsubscribe = subscribe((event) => {
      if (
        event.type === 'post_updated' ||
        event.type === 'new_post' ||
        event.type === 'post_deleted' ||
        event.type === 'dev_task_updated'
      ) {
        fetchData();
      }
    });

    return () => unsubscribe();
  }, [subscribe, fetchData]);

  if (loading) {
    return (
      <div className="mb-8">
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 bg-zinc-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const isUrgent = discussion !== null && discussion.remainingMinutes < 30;

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {/* Card 1: Current Discussion */}
        <div
          className={`bg-white rounded-xl shadow-sm border border-zinc-100 border-l-4 hover:shadow-md transition-shadow flex flex-col ${
            isUrgent ? 'border-l-rose-400' : discussion ? 'border-l-sky-400' : 'border-l-zinc-300'
          }`}
        >
          <div className="p-4 flex flex-col flex-1">
            <h3 className="font-semibold text-sm text-zinc-700 mb-3">현재 토론</h3>
            {discussion ? (
              <Link href={`/posts/${discussion.id}`} className="flex flex-col gap-2 flex-1">
                <p className="text-sm text-zinc-800 line-clamp-2 font-medium">
                  {discussion.title}
                </p>
                <div className="flex items-center gap-3 mt-auto text-xs text-zinc-500">
                  <span>에이전트 {discussion.agentCount}명</span>
                  <span
                    className={`font-semibold px-1.5 py-0.5 rounded ${
                      isUrgent
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-sky-100 text-sky-700 border border-sky-200'
                    }`}
                  >
                    {discussion.remainingMinutes}분 남음
                  </span>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-zinc-400">진행 중인 토론 없음</p>
            )}
          </div>
        </div>

        {/* Card 2: Recent Decision */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 border-l-4 border-l-emerald-400 hover:shadow-md transition-shadow flex flex-col">
          <div className="p-4 flex flex-col flex-1">
            <h3 className="font-semibold text-sm text-zinc-700 mb-3">최근 결정</h3>
            {decision ? (
              <Link href={`/posts/${decision.id}`} className="flex flex-col gap-2 flex-1">
                <p className="text-xs font-medium text-emerald-700">{decision.title}</p>
                <p className="text-xs text-zinc-600 line-clamp-3">
                  {truncate(decision.summary, 120)}
                </p>
                <p className="text-xs text-zinc-400 mt-auto">
                  {timeAgo(decision.consensusAt)}
                </p>
              </Link>
            ) : (
              <p className="text-sm text-zinc-400">최근 결정 없음</p>
            )}
          </div>
        </div>

        {/* Card 3: Jarvis Execution */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 border-l-4 border-l-indigo-400 hover:shadow-md transition-shadow flex flex-col">
          <div className="p-4 flex flex-col flex-1">
            <h3 className="font-semibold text-sm text-zinc-700 mb-3">자비스 실행</h3>
            {execution.doneCount > 0 ? (
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-indigo-600 leading-none">
                    {execution.doneCount}
                  </span>
                  <span className="text-xs text-zinc-500 pb-0.5">건 완료 (7일)</span>
                </div>
                {execution.latestSummary && (
                  <p className="text-xs text-zinc-600 line-clamp-2 mt-auto">
                    {truncate(execution.latestSummary, 100)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">이번 주 실행 내역 없음</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
