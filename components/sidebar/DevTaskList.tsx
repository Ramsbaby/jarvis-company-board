'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useEvent } from '@/contexts/EventContext';
import type { DevTask } from '@/lib/types';

interface LogEntry { time: string; message: string; }

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-blue-400', low: 'bg-zinc-300',
};
const PRIORITY_LABEL: Record<string, string> = {
  urgent: '긴급', high: '높음', medium: '중간', low: '낮음',
};
const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high:   'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low:    'bg-zinc-50 text-zinc-500 border-zinc-200',
};
const IMPACT_AREA_CONFIG: Record<string, { emoji: string }> = {
  security: { emoji: '🔒' }, performance: { emoji: '⚡' }, ux: { emoji: '✨' },
  infra: { emoji: '🛠' }, data: { emoji: '📊' }, cost: { emoji: '💰' }, reliability: { emoji: '🛡' },
};

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso + (iso.includes('Z') ? '' : 'Z')).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}분`;
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

function parseImpactAreas(raw?: string): string[] {
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

function calcRemaining(startedAt: string, estimatedMinutes: number): number {
  const elapsed = (Date.now() - new Date(startedAt + (startedAt.includes('Z') ? '' : 'Z')).getTime()) / 60000;
  return Math.round(estimatedMinutes - elapsed);
}

function ImpactChips({ raw }: { raw?: string }) {
  const areas = parseImpactAreas(raw);
  if (areas.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {areas.map(area => {
        const cfg = IMPACT_AREA_CONFIG[area];
        return (
          <span key={area} className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-150">
            {cfg?.emoji} {area}
          </span>
        );
      })}
    </div>
  );
}

type FilterKey = 'awaiting_approval' | 'in-progress' | 'done' | 'rejected';

export default function DevTaskList({ isOwner = false }: { isOwner?: boolean }) {
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ id: string; status: string } | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('awaiting_approval');
  const { subscribe, connected } = useEvent();

  useEffect(() => {
    fetch('/api/dev-tasks', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setTasks(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'dev_task_updated' && ev.data?.task) {
        const task = ev.data.task as unknown as DevTask;
        setTasks(prev => {
          const exists = prev.some(t => t.id === task.id);
          if (exists) return prev.map(t => t.id === task.id ? task : t);
          return [task, ...prev];
        });
      }
    });
  }, [subscribe]);

  async function handleAction(taskId: string, status: 'approved' | 'rejected') {
    setActionLoading(taskId + status);
    try {
      const res = await fetch(`/api/dev-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updated } : t));
        setActionSuccess({ id: taskId, status });
        setTimeout(() => { setActionSuccess(null); setExpandedId(null); }, 1800);
      }
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  }

  const awaiting   = tasks.filter(t => t.status === 'awaiting_approval');
  const inProgress = tasks.filter(t => t.status === 'in-progress');
  const approved   = tasks.filter(t => t.status === 'approved');
  const done       = tasks.filter(t => t.status === 'done');
  const rejected   = tasks.filter(t => t.status === 'rejected');
  const total      = tasks.length;

  // Auto-switch filter to a tab that has items if current tab is empty (on data load)
  useEffect(() => {
    if (loading) return;
    if (activeFilter === 'awaiting_approval' && awaiting.length === 0) {
      if (inProgress.length + approved.length > 0) setActiveFilter('in-progress');
      else if (done.length > 0) setActiveFilter('done');
    }
  }, [loading]); // eslint-disable-line

  const filterTabs: { key: FilterKey; label: string; count: number; active: string; inactive: string }[] = [
    {
      key: 'awaiting_approval', label: '검토대기', count: awaiting.length,
      active: 'bg-amber-500 text-white shadow-sm',
      inactive: awaiting.length > 0 ? 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100' : 'bg-zinc-100 text-zinc-400 cursor-default',
    },
    {
      key: 'in-progress', label: '작업중', count: inProgress.length + approved.length,
      active: 'bg-indigo-500 text-white shadow-sm',
      inactive: (inProgress.length + approved.length) > 0 ? 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100' : 'bg-zinc-100 text-zinc-400 cursor-default',
    },
    {
      key: 'done', label: '완료', count: done.length,
      active: 'bg-emerald-500 text-white shadow-sm',
      inactive: done.length > 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100' : 'bg-zinc-100 text-zinc-400 cursor-default',
    },
    {
      key: 'rejected', label: '반려', count: rejected.length,
      active: 'bg-zinc-500 text-white shadow-sm',
      inactive: rejected.length > 0 ? 'bg-zinc-100 text-zinc-500 border border-zinc-300 hover:bg-zinc-200' : 'bg-zinc-100 text-zinc-400 cursor-default',
    },
  ];

  // Items to render for current filter
  const filteredTasks = (() => {
    if (activeFilter === 'awaiting_approval') return awaiting;
    if (activeFilter === 'in-progress') return [...inProgress, ...approved];
    if (activeFilter === 'done') return done;
    if (activeFilter === 'rejected') return rejected;
    return [];
  })();

  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      {/* ── HEADER ── */}
      <div className="px-4 pt-3.5 pb-3 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-2.5">
          <Link href="/dev-tasks" className="text-xs font-semibold text-zinc-600 hover:text-indigo-600 transition-colors flex items-center gap-1.5">
            <span className="text-[11px] opacity-70">⚙</span>
            DEV 태스크
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-300 animate-pulse'}`} title={connected ? 'SSE 연결됨' : '연결 중...'} />
          </Link>
          <Link href="/dev-tasks" className="text-[10px] text-zinc-400 hover:text-indigo-500 transition-colors">
            전체 {total}건 →
          </Link>
        </div>

        {/* Filter tabs (clickable) */}
        <div className="grid grid-cols-4 gap-1.5">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { if (tab.count > 0) { setActiveFilter(tab.key); setExpandedId(null); } }}
              className={`rounded-md px-1.5 py-1.5 text-center transition-all ${
                activeFilter === tab.key ? tab.active : tab.inactive
              }`}
            >
              <div className="text-sm font-black tabular-nums leading-none">{tab.count}</div>
              <div className="text-[9px] font-medium mt-0.5 opacity-90 leading-none">{tab.label}</div>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-zinc-100 rounded animate-pulse w-full" />
              <div className="h-2 bg-zinc-100 rounded animate-pulse w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-6 text-center text-xs text-zinc-400">데이터를 불러오지 못했습니다</div>
      ) : total === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="w-9 h-9 mx-auto mb-2.5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-lg">✅</div>
          <p className="text-xs font-medium text-zinc-600">모든 작업 완료</p>
          <p className="text-[10px] text-zinc-400 mt-1">새 개발 태스크가 없습니다</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-zinc-400">
          이 상태의 태스크가 없습니다
        </div>
      ) : (
        /* Scrollable task list — max height prevents sidebar from growing infinitely */
        <div className="max-h-40 overflow-y-auto divide-y divide-zinc-50">
          {activeFilter === 'awaiting_approval' && filteredTasks.map(task => {
            const isExp = expandedId === task.id;
            const isLoading = actionLoading?.startsWith(task.id);
            return (
              <div key={task.id} className="bg-amber-50/20">
                <button
                  className="w-full text-left px-4 py-2.5 hover:bg-amber-50/60 transition-colors"
                  onClick={() => setExpandedId(isExp ? null : task.id)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? 'bg-zinc-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-zinc-800 leading-snug line-clamp-2">{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[9px] px-1 py-0.5 rounded border font-semibold ${PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.low}`}>
                          {PRIORITY_LABEL[task.priority] ?? task.priority}
                        </span>
                        {task.assignee && <span className="text-[10px] text-zinc-400">{task.assignee}</span>}
                        <span className="text-[10px] text-zinc-300 ml-auto">{timeAgoShort(task.created_at)}전</span>
                      </div>
                      {task.expected_impact && (
                        <p className="text-[10px] text-amber-600 italic mt-1 line-clamp-1">
                          💡 {task.expected_impact.length > 40 ? task.expected_impact.slice(0, 40) + '...' : task.expected_impact}
                        </p>
                      )}
                    </div>
                    <svg className={`w-3 h-3 text-zinc-300 shrink-0 mt-1.5 transition-transform ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {isExp && (
                  <div className="px-4 pb-3 space-y-2">
                    {actionSuccess?.id === task.id && (
                      <div className={`flex items-center gap-2 py-2 px-3 rounded-lg text-xs font-bold ${
                        actionSuccess.status === 'approved'
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                          : 'bg-zinc-50 border border-zinc-200 text-zinc-600'
                      }`}>
                        <span>{actionSuccess.status === 'approved' ? '✓' : '✕'}</span>
                        {actionSuccess.status === 'approved' ? '승인 완료 — 개발 시작' : '반려 완료'}
                      </div>
                    )}
                    {task.detail && (
                      <p className="text-[11px] text-zinc-500 leading-relaxed bg-white rounded-lg p-2.5 border border-amber-100 line-clamp-3">
                        {task.detail}
                      </p>
                    )}
                    {isOwner ? (
                      <div className="flex gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleAction(task.id, 'approved')}
                          disabled={!!isLoading || actionSuccess?.id === task.id}
                          className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === task.id + 'approved'
                            ? <span className="flex items-center justify-center gap-1"><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />처리 중</span>
                            : '✓ 승인'}
                        </button>
                        <button
                          onClick={() => handleAction(task.id, 'rejected')}
                          disabled={!!isLoading || actionSuccess?.id === task.id}
                          className="py-1.5 px-3 text-xs font-bold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === task.id + 'rejected'
                            ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin inline-block" />
                            : '✕'}
                        </button>
                        <Link
                          href={`/dev-tasks/${task.id}`}
                          className="py-1.5 px-2.5 text-xs rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors"
                        >→</Link>
                      </div>
                    ) : (
                      <Link href={`/dev-tasks/${task.id}`} className="block w-full text-center py-1.5 text-xs text-zinc-400 hover:text-indigo-500 transition-colors">
                        상세 보기 →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {activeFilter === 'in-progress' && filteredTasks.map(task => {
            const isExp = expandedId === task.id;
            let logEntries: LogEntry[] = [];
            try { logEntries = JSON.parse(task.execution_log || '[]') as LogEntry[]; } catch {}
            const lastLog = logEntries[logEntries.length - 1];
            const showRemaining = !!(task.estimated_minutes && task.started_at);
            const remaining = showRemaining ? calcRemaining(task.started_at!, task.estimated_minutes!) : 0;
            const isApprovedWaiting = task.status === 'approved';

            return (
              <div key={task.id} className={isApprovedWaiting ? 'bg-emerald-50/20' : 'bg-indigo-50/20'}>
                <button
                  className={`w-full text-left px-4 py-2.5 transition-colors ${isApprovedWaiting ? 'hover:bg-emerald-50/50' : 'hover:bg-indigo-50/40'}`}
                  onClick={() => setExpandedId(isExp ? null : task.id)}
                >
                  <div className="flex items-start gap-2.5">
                    {isApprovedWaiting
                      ? <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      : <div className="mt-1 w-3 h-3 shrink-0 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-zinc-800 leading-snug line-clamp-2">{task.title}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-zinc-100 text-zinc-500">
                          {isApprovedWaiting ? '⏳ 대기중' : '⚙ 실행중'}
                        </span>
                        {task.started_at && (
                          <span className="text-[10px] text-indigo-400 ml-auto">{timeAgoShort(task.started_at)}전 시작</span>
                        )}
                      </div>
                      {lastLog && (
                        <p className="text-[10px] text-indigo-500 mt-1 line-clamp-1 italic">▶ {lastLog.message}</p>
                      )}
                      {showRemaining && (
                        <p className={`text-[10px] mt-0.5 font-medium ${remaining >= 0 ? 'text-indigo-400' : 'text-orange-500'}`}>
                          ⏱ {remaining >= 0 ? `약 ${remaining}분 남음` : `${Math.abs(remaining)}분 초과 중`}
                        </p>
                      )}
                    </div>
                    <svg className={`w-3 h-3 text-zinc-300 shrink-0 mt-1.5 transition-transform ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {isExp && (
                  <div className="px-4 pb-3 space-y-2">
                    {task.detail && (
                      <p className="text-[11px] text-zinc-500 bg-white rounded-lg p-2.5 border border-indigo-100 line-clamp-3">{task.detail}</p>
                    )}
                    {logEntries.length > 0 && (
                      <div className="bg-zinc-900 rounded-lg p-2.5 space-y-1 max-h-24 overflow-y-auto">
                        {logEntries.slice(-4).map((entry, i) => (
                          <p key={i} className="text-[10px] text-emerald-400 font-mono leading-snug">
                            <span className="text-zinc-500 mr-1.5">{entry.time?.slice(11, 16)}</span>
                            {entry.message}
                          </p>
                        ))}
                      </div>
                    )}
                    <Link href={`/dev-tasks/${task.id}`} className="block text-center text-[11px] text-indigo-500 hover:underline">
                      상세 보기 →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}

          {activeFilter === 'done' && filteredTasks.map(task => (
            <Link key={task.id} href={`/dev-tasks/${task.id}`} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-zinc-50 transition-colors group">
              <span className="mt-1.5 text-xs shrink-0">🎉</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-zinc-700 line-clamp-1 group-hover:text-indigo-600 transition-colors">{task.title}</p>
                {task.actual_impact && (
                  <p className="text-[10px] text-emerald-600 italic mt-0.5 line-clamp-1">✨ {task.actual_impact.slice(0, 45)}{task.actual_impact.length > 45 ? '...' : ''}</p>
                )}
                {task.completed_at && (
                  <p className="text-[10px] text-zinc-300 mt-0.5">{timeAgoShort(task.completed_at)}전 완료</p>
                )}
              </div>
            </Link>
          ))}

          {activeFilter === 'rejected' && filteredTasks.map(task => (
            <Link key={task.id} href={`/dev-tasks/${task.id}`} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-zinc-50 transition-colors group">
              <span className="mt-1.5 text-xs shrink-0 text-zinc-400">✕</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-500 line-clamp-1 group-hover:text-zinc-700 transition-colors">{task.title}</p>
                {task.rejected_at && (
                  <p className="text-[10px] text-zinc-300 mt-0.5">{timeAgoShort(task.rejected_at)}전 반려</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Footer: link to full list */}
      {!loading && !error && total > 0 && (
        <div className="border-t border-zinc-100 px-4 py-2">
          <Link href="/dev-tasks" className="text-[10px] text-zinc-400 hover:text-indigo-500 transition-colors flex items-center justify-center gap-1">
            전체 태스크 보기 →
          </Link>
        </div>
      )}
    </div>
  );
}
