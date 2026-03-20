'use client';
import { useState, useEffect } from 'react';

interface DevTask {
  id: string;
  title: string;
  detail: string;
  priority: string;
  source: string;
  assignee: string;
  status: string;
  created_at: string;
  approved_at?: string;
  rejected_at?: string;
}

const PRIORITY_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  urgent: { dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',      label: '긴급' },
  high:   { dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 border-orange-200', label: '높음' },
  medium: { dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 border-blue-200',    label: '중간' },
  low:    { dot: 'bg-zinc-300',   badge: 'bg-zinc-50 text-zinc-500 border-zinc-200',    label: '낮음' },
};

export default function DevTaskList({ isOwner = false }: { isOwner?: boolean }) {
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dev-tasks')
      .then(r => r.json())
      .then(data => { setTasks(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  async function handleApproval(taskId: string, status: 'approved' | 'rejected') {
    setActionLoading(taskId);
    try {
      const res = await fetch(`/api/dev-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
      }
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  }

  const awaiting = tasks.filter(t => t.status === 'awaiting_approval');
  const approved = tasks.filter(t => t.status === 'approved');
  const active = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress');
  const rejected = tasks.filter(t => t.status === 'rejected');

  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-100">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">DEV 태스크</h3>
        <div className="flex items-center gap-1.5">
          {awaiting.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {awaiting.length} 승인대기
            </span>
          )}
          {active.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
              {active.length}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1,2].map(i => (
            <div key={i} className="space-y-2">
              <div className="skeleton-shimmer h-3 w-full" />
              <div className="skeleton-shimmer h-2 w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-6 text-center text-xs text-zinc-400">데이터를 불러오지 못했습니다</div>
      ) : (
        <div className="divide-y divide-zinc-50 max-h-96 overflow-y-auto">

          {/* Awaiting Approval section */}
          {awaiting.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">⏳ 승인 대기</p>
              </div>
              {awaiting.map(task => {
                const cfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
                const isExp = expanded === task.id;
                const isLoading = actionLoading === task.id;
                return (
                  <div key={task.id} className="bg-amber-50/40 border-b border-amber-100/60">
                    <button
                      className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors"
                      onClick={() => setExpanded(isExp ? null : task.id)}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-800 leading-snug line-clamp-2">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${cfg.badge}`}>{cfg.label}</span>
                            {task.assignee && <span className="text-[10px] text-zinc-400">{task.assignee}</span>}
                          </div>
                        </div>
                        <svg className={`w-3.5 h-3.5 text-zinc-300 shrink-0 mt-1 transition-transform ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {isExp && (
                      <div className="px-4 pb-3 space-y-2">
                        {task.detail && (
                          <p className="text-[11px] text-zinc-500 leading-relaxed bg-white rounded-lg p-2.5 border border-amber-100">
                            {task.detail}
                          </p>
                        )}
                        {task.source && (
                          <p className="text-[10px] text-zinc-400">출처: {task.source}</p>
                        )}
                        {isOwner && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleApproval(task.id, 'approved')}
                              disabled={isLoading}
                              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                              {isLoading ? '처리 중...' : '✓ 승인'}
                            </button>
                            <button
                              onClick={() => handleApproval(task.id, 'rejected')}
                              disabled={isLoading}
                              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
                            >
                              ✕ 반려
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Approved (not yet picked up) */}
          {approved.map(task => {
            const cfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
            return (
              <div key={task.id} className="px-4 py-2.5 flex items-center gap-2.5 bg-emerald-50/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <p className="text-xs text-zinc-700 flex-1 line-clamp-1">{task.title}</p>
                <span className="text-[10px] text-emerald-600 font-medium shrink-0">승인됨</span>
              </div>
            );
          })}

          {/* Active (pending / in-progress) */}
          {active.length === 0 && awaiting.length === 0 && approved.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xl">✅</div>
              <p className="text-xs font-medium text-zinc-600">모든 작업 완료</p>
              <p className="text-[10px] text-zinc-400 mt-1">새 개발 태스크가 없습니다</p>
            </div>
          ) : (
            active.map(task => {
              const cfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
              const isExp = expanded === task.id;
              return (
                <div key={task.id} className="group">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors"
                    onClick={() => setExpanded(isExp ? null : task.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-800 leading-snug line-clamp-2 group-hover:text-zinc-900">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${cfg.badge}`}>{cfg.label}</span>
                          {task.assignee && <span className="text-[10px] text-zinc-400">{task.assignee}</span>}
                          {task.status === 'in-progress' && (
                            <span className="text-[10px] text-indigo-500 font-medium">진행중</span>
                          )}
                        </div>
                      </div>
                      <svg className={`w-3.5 h-3.5 text-zinc-300 shrink-0 mt-1 transition-transform duration-200 ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {isExp && task.detail && (
                    <div className="px-4 pb-3">
                      <p className="text-[11px] text-zinc-500 leading-relaxed bg-zinc-50 rounded-lg p-3 border border-zinc-100">{task.detail}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Rejected — collapsed by default, shown dimmed */}
          {rejected.length > 0 && (
            <div className="px-4 py-2 opacity-50">
              <p className="text-[10px] text-zinc-400">✕ 반려됨 {rejected.length}건</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
