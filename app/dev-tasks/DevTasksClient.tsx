'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';

function TaskDetail({ task, isWaiting, onDetailUpdate }: {
  task: { id: string; title: string; detail: string };
  isWaiting: boolean;
  onDetailUpdate: (id: string, detail: string) => void;
}) {
  const [explaining, setExplaining] = useState(false);
  const [localDetail, setLocalDetail] = useState(task.detail);

  const hasDetail = localDetail && localDetail.trim() !== '' && localDetail.trim() !== task.title.trim();

  async function handleExplain(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setExplaining(true);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}/explain`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setLocalDetail(data.explanation);
        onDetailUpdate(task.id, data.explanation);
      }
    } finally {
      setExplaining(false);
    }
  }

  if (hasDetail) {
    return (
      <div className={`text-xs text-zinc-600 leading-relaxed rounded-lg px-3 py-2 mb-2 border line-clamp-3 ${
        isWaiting ? 'bg-white/70 border-amber-100' : 'bg-zinc-50 border-zinc-100'
      }`}>
        {localDetail}
      </div>
    );
  }

  return (
    <button
      onClick={handleExplain}
      disabled={explaining}
      className="mb-2 flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
    >
      {explaining
        ? <><span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /> 설명 생성 중...</>
        : '❓ 이게 뭔 작업이야?'}
    </button>
  );
}

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
  started_at?: string;
  completed_at?: string;
  expected_impact?: string;
  actual_impact?: string;
  impact_areas?: string;
  estimated_minutes?: number;
  difficulty?: string;
  post_title?: string;
}

const PRIORITY_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  urgent: { dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',         label: '긴급' },
  high:   { dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 border-orange-200', label: '높음' },
  medium: { dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 border-blue-200',       label: '중간' },
  low:    { dot: 'bg-zinc-300',   badge: 'bg-zinc-50 text-zinc-500 border-zinc-200',       label: '낮음' },
};

const DIFFICULTY_CONFIG: Record<string, { label: string; cls: string }> = {
  easy:   { label: '쉬움',   cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  medium: { label: '보통',   cls: 'bg-blue-50 text-blue-600 border-blue-100' },
  hard:   { label: '어려움', cls: 'bg-orange-50 text-orange-600 border-orange-100' },
  expert: { label: '전문가', cls: 'bg-red-50 text-red-600 border-red-100' },
};

const IMPACT_AREA_CONFIG: Record<string, { emoji: string; label: string }> = {
  security:    { emoji: '🔒', label: '보안' },
  performance: { emoji: '⚡', label: '성능' },
  ux:          { emoji: '✨', label: 'UX' },
  infra:       { emoji: '🛠', label: '인프라' },
  data:        { emoji: '📊', label: '데이터' },
  cost:        { emoji: '💰', label: '비용' },
  reliability: { emoji: '🛡', label: '안정성' },
};

// Card style per status: [outerBorder, stripe, innerBg, statusBadge, statusLabel]
type StatusStyle = {
  outerBorder: string;
  stripe: string | null;
  innerBg: string;
  badgeCls: string;
  badgeLabel: string;
};

const STATUS_STYLE: Record<string, StatusStyle> = {
  awaiting_approval: {
    outerBorder: 'border-amber-200 shadow-sm shadow-amber-50',
    stripe: 'bg-gradient-to-r from-amber-400 to-orange-400',
    innerBg: 'bg-amber-50/60',
    badgeCls: 'bg-amber-50 border-amber-200 text-amber-700',
    badgeLabel: '🔍 검토 대기',
  },
  approved: {
    outerBorder: 'border-teal-200 shadow-sm shadow-teal-50',
    stripe: 'bg-gradient-to-r from-teal-400 to-emerald-400',
    innerBg: 'bg-teal-50/40',
    badgeCls: 'bg-teal-50 border-teal-200 text-teal-700',
    badgeLabel: '⏳ 실행 대기',
  },
  'in-progress': {
    outerBorder: 'border-indigo-200 shadow-sm',
    stripe: 'bg-gradient-to-r from-indigo-400 to-violet-400',
    innerBg: 'bg-indigo-50/40',
    badgeCls: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    badgeLabel: '⚙ 작업 중',
  },
  done: {
    outerBorder: 'border-zinc-200',
    stripe: 'bg-emerald-400',
    innerBg: 'bg-white',
    badgeCls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    badgeLabel: '🎉 완료',
  },
  rejected: {
    outerBorder: 'border-zinc-200',
    stripe: 'bg-zinc-200',
    innerBg: 'bg-zinc-50 opacity-70',
    badgeCls: 'bg-zinc-100 border-zinc-200 text-zinc-400',
    badgeLabel: '✕ 반려',
  },
  pending: {
    outerBorder: 'border-zinc-200',
    stripe: null,
    innerBg: 'bg-white',
    badgeCls: 'bg-zinc-50 border-zinc-200 text-zinc-500',
    badgeLabel: '미제출',
  },
  failed: {
    outerBorder: 'border-red-200',
    stripe: 'bg-red-400',
    innerBg: 'bg-red-50/30',
    badgeCls: 'bg-red-50 border-red-200 text-red-600',
    badgeLabel: '⚠ 실패',
  },
};

const TAB_BADGE_CLS: Record<string, string> = {
  awaiting_approval: 'bg-amber-500 text-white',
  approved:          'bg-teal-500 text-white',
  'in-progress':     'bg-indigo-500 text-white',
  done:              'bg-emerald-500 text-white',
  rejected:          'bg-zinc-400 text-white',
  pending:           'bg-zinc-200 text-zinc-600',
  failed:            'bg-red-400 text-white',
};

const STATUS_TABS = [
  { key: 'all',               label: '전체' },
  { key: 'awaiting_approval', label: '검토 대기' },
  { key: 'approved',          label: '실행 대기' },
  { key: 'in-progress',       label: '작업 중' },
  { key: 'pending',           label: '미제출' },
  { key: 'done',              label: '완료' },
  { key: 'rejected',          label: '반려' },
  { key: 'failed',            label: '실패' },
] as const;

// 제목 내 `코드` → 인라인 코드 강조 (경로 전체 표시, 파일명 단축 없음)
// 미완성 백틱(잘린 제목)도 처리 — 닫힌 척 하고 끝에 … 표시
function renderTitle(title: string): React.ReactNode {
  const isTruncated = /`[^`]*$/.test(title);
  const normalized = isTruncated ? title + '`' : title;
  const parts = normalized.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          const code = part.slice(1, -1);
          const isLast = isTruncated && i === parts.length - 2;
          return (
            <code
              key={i}
              className="mx-0.5 px-1 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono text-[0.82em] border border-zinc-200 not-italic"
            >
              {code}{isLast ? '…' : ''}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}


function formatSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('board:')) return '이사회 토론';
  if (source.startsWith('manual:')) return '수동 등록';
  if (source.startsWith('cron:')) return '자동 감지';
  return source;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}분 전`;
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function parseImpactAreas(raw?: string): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default function DevTasksClient({ initialTasks }: { initialTasks: DevTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<DevTask[]>(initialTasks);
  const [tab, setTab] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { subscribe } = useEvent();

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'dev_task_updated' && ev.data?.task) {
        setTasks(prev => {
          const exists = prev.some(t => t.id === ev.data.task.id);
          if (exists) return prev.map(t => t.id === ev.data.task.id ? ev.data.task : t);
          return [ev.data.task, ...prev];
        });
      }
    });
  }, [subscribe]);

  async function handleAction(taskId: string, status: 'approved' | 'rejected') {
    setActionLoading(taskId);
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        setActionError('세션이 만료되었습니다. 다시 로그인해주세요.');
        return;
      }
      if (res.ok) {
        const updated = await res.json();
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updated } : t));
        router.refresh();
      } else {
        setActionError(`처리 실패 (${res.status})`);
      }
    } catch {
      setActionError('네트워크 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  }

  const grouped = {
    all:               tasks,
    awaiting_approval: tasks.filter(t => t.status === 'awaiting_approval'),
    approved:          tasks.filter(t => t.status === 'approved'),
    'in-progress':     tasks.filter(t => t.status === 'in-progress'),
    pending:           tasks.filter(t => t.status === 'pending'),
    done:              tasks.filter(t => t.status === 'done'),
    rejected:          tasks.filter(t => t.status === 'rejected'),
    failed:            tasks.filter(t => t.status === 'failed'),
  } as Record<string, DevTask[]>;

  const filtered = grouped[tab] ?? tasks;

  const STATS = [
    { label: '검토 대기', key: 'awaiting_approval', color: 'bg-amber-50 border-amber-200 text-amber-700',   dot: 'bg-amber-400',   pulse: true },
    { label: '실행 대기',  key: 'approved',           color: 'bg-teal-50 border-teal-200 text-teal-700',     dot: 'bg-teal-400',    pulse: true  },
    { label: '작업 중',   key: 'in-progress',        color: 'bg-indigo-50 border-indigo-200 text-indigo-700', dot: 'bg-indigo-400', pulse: true },
    { label: '완료',      key: 'done',               color: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-400', pulse: false },
    { label: '반려',      key: 'rejected',           color: 'bg-zinc-50 border-zinc-200 text-zinc-500',    dot: 'bg-zinc-300',    pulse: false },
    { label: '미제출',    key: 'pending',            color: 'bg-zinc-50 border-zinc-200 text-zinc-400',    dot: 'bg-zinc-200',    pulse: false },
    { label: '실패',      key: 'failed',             color: 'bg-red-50 border-red-200 text-red-600',       dot: 'bg-red-400',     pulse: false },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Error toast */}
      {actionError && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        {STATS.map(s => (
          <button
            key={s.key}
            onClick={() => setTab(s.key)}
            className={`rounded-lg border p-3 flex flex-col gap-1 text-left transition-opacity hover:opacity-80 ${s.color} ${tab === s.key ? 'ring-2 ring-offset-1 ring-current' : ''}`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
              <span className="text-[11px] font-medium">{s.label}</span>
            </div>
            <span className="text-2xl font-black tabular-nums">{grouped[s.key]?.length ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-zinc-200 pb-0 -mb-1">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors relative -mb-px ${
              tab === t.key
                ? 'text-indigo-600 border border-zinc-200 border-b-white bg-white'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {t.label}
            {(grouped[t.key]?.length ?? 0) > 0 && (
              <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full font-bold ${
                t.key === 'all' ? 'bg-zinc-100 text-zinc-500' : (TAB_BADGE_CLS[t.key] ?? 'bg-zinc-100 text-zinc-500')
              }`}>
                {t.key === 'all' ? tasks.length : (grouped[t.key]?.length ?? 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-400 text-sm">이 상태의 태스크가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => {
            const cfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
            const st = STATUS_STYLE[task.status] ?? STATUS_STYLE.pending;
            const isWaiting = task.status === 'awaiting_approval';
            const isLoading = actionLoading === task.id;
            const diffCfg = task.difficulty ? DIFFICULTY_CONFIG[task.difficulty] : null;
            const impactAreas = parseImpactAreas(task.impact_areas);

            return (
              <div
                key={task.id}
                className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${st.outerBorder}`}
              >
                {/* Status stripe */}
                {st.stripe && <div className={`h-1 w-full ${st.stripe}`} />}

                <Link
                  href={`/dev-tasks/${task.id}`}
                  className={`block p-4 hover:shadow-inner transition-all group ${st.innerBg}`}
                >
                  {/* Context bar: source → assignee → time (맥락 최우선) */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {task.post_title ? (
                      <span className="text-[10px] text-indigo-500 font-medium truncate max-w-[220px]" title={task.post_title}>
                        🔗 {task.post_title}
                      </span>
                    ) : task.source?.startsWith('board:') ? (
                      <span className="text-[10px] text-indigo-400 font-medium">🔗 이사회 토론</span>
                    ) : task.source?.startsWith('manual:') ? (
                      <span className="text-[10px] text-zinc-400">✏️ 수동 등록</span>
                    ) : task.source?.startsWith('cron:') ? (
                      <span className="text-[10px] text-zinc-400">🤖 자동 감지</span>
                    ) : null}
                    {task.assignee && (
                      <>
                        <span className="text-zinc-200 text-[10px]">·</span>
                        <span className="text-[10px] text-zinc-600 font-medium bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">
                          {task.assignee}팀
                        </span>
                      </>
                    )}
                    <span className="text-zinc-200 text-[10px] ml-auto hidden sm:inline">·</span>
                    <span className="text-[10px] text-zinc-400 ml-auto sm:ml-0">{timeAgo(task.created_at)}</span>
                  </div>

                  {/* Header row */}
                  <div className="flex items-start gap-3 mb-2.5">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      {/* 태스크 제목 — 코드 포함 시 인라인 코드 표시 */}
                      <h3 className="text-sm font-semibold text-zinc-900 leading-snug group-hover:text-indigo-700">
                        {renderTitle(task.title)}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${cfg.badge}`}>{cfg.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${st.badgeCls}`}>{st.badgeLabel}</span>
                        {diffCfg && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${diffCfg.cls}`}>{diffCfg.label}</span>
                        )}
                        {task.estimated_minutes != null && task.estimated_minutes > 0 && (
                          <span className="text-[10px] text-zinc-400">⏱ {task.estimated_minutes}분</span>
                        )}
                        {impactAreas.map(area => {
                          const ac = IMPACT_AREA_CONFIG[area];
                          return (
                            <span key={area} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
                              {ac ? `${ac.emoji} ${ac.label}` : area}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <svg
                      className="w-4 h-4 text-zinc-300 group-hover:text-indigo-400 transition-colors shrink-0 mt-0.5"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Detail — 있으면 표시, 없으면 "쉬운 설명" 버튼 */}
                  <TaskDetail task={task} isWaiting={isWaiting} onDetailUpdate={(id, detail) => {
                    setTasks(prev => prev.map(t => t.id === id ? { ...t, detail } : t));
                  }} />

                  {/* Impact lines */}
                  {task.expected_impact && task.status !== 'done' && (
                    <p className="text-[11px] text-zinc-500 italic mb-1.5">
                      💡 {task.expected_impact.length > 80 ? task.expected_impact.slice(0, 80) + '…' : task.expected_impact}
                    </p>
                  )}
                  {task.actual_impact && task.status === 'done' && (
                    <p className="text-[11px] text-emerald-600 italic mb-1.5">
                      ✨ {task.actual_impact.length > 80 ? task.actual_impact.slice(0, 80) + '…' : task.actual_impact}
                    </p>
                  )}

                  {/* Timestamps */}
                  {task.approved_at && (
                    <p className="text-[10px] text-emerald-500 mt-1">✓ {new Date(task.approved_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 승인됨</p>
                  )}
                  {task.started_at && (
                    <p className="text-[10px] text-indigo-500 mt-0.5">▶ {new Date(task.started_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 시작됨</p>
                  )}
                  {task.completed_at && (
                    <p className="text-[10px] text-emerald-600 mt-0.5">✓ {new Date(task.completed_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 완료됨</p>
                  )}
                  {task.rejected_at && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">✕ {new Date(task.rejected_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 반려됨</p>
                  )}
                </Link>

                {/* Approve/Reject — 우측 정렬, 컴팩트 */}
                {isWaiting && (
                  <div className="flex justify-end items-center gap-2 px-4 pb-3 pt-2 border-t border-amber-100 bg-amber-50/40">
                    <button
                      onClick={() => handleAction(task.id, 'rejected')}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-zinc-500 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      ✕ 반려
                    </button>
                    <button
                      onClick={() => handleAction(task.id, 'approved')}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
                    >
                      {isLoading ? (
                        <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중</>
                      ) : '✓ 승인 & 즉시 실행'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
