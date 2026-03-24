'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { DevTask } from '@/lib/types';

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
    badgeLabel: '🔍 검토 요청됨',
  },
  approved: {
    outerBorder: 'border-teal-200 shadow-sm shadow-teal-50',
    stripe: 'bg-gradient-to-r from-teal-400 to-emerald-400',
    innerBg: 'bg-teal-50/40',
    badgeCls: 'bg-teal-50 border-teal-200 text-teal-700',
    badgeLabel: '✅ 승인됨',
  },
  'in-progress': {
    outerBorder: 'border-indigo-200 shadow-sm',
    stripe: 'bg-gradient-to-r from-indigo-400 to-violet-400',
    innerBg: 'bg-indigo-50/40',
    badgeCls: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    badgeLabel: '⚙ Jarvis 작업 중',
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
  failed: {
    outerBorder: 'border-red-200',
    stripe: 'bg-gradient-to-r from-red-300 to-rose-300',
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
  failed:            'bg-red-400 text-white',
};

const STATUS_TABS = [
  { key: 'all',               label: '전체' },
  { key: 'awaiting_approval', label: '검토 요청됨' },
  { key: 'approved',          label: '승인됨' },
  { key: 'in-progress',       label: 'Jarvis 작업 중' },
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

function parseDependsOn(raw?: string): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Sort tasks by dependency order: tasks with no deps first, then topologically */
function sortByDependency(tasks: DevTask[]): DevTask[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const sorted: DevTask[] = [];
  const visited = new Set<string>();

  function visit(task: DevTask) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    const deps = parseDependsOn(task.depends_on);
    for (const depId of deps) {
      const dep = taskMap.get(depId);
      if (dep) visit(dep);
    }
    sorted.push(task);
  }

  for (const task of tasks) visit(task);
  return sorted;
}

interface TaskGroup {
  groupId: string;
  label: string;
  tasks: DevTask[];
}

/** Group tasks: returns { groups: TaskGroup[], ungrouped: DevTask[] } */
function groupTasks(tasks: DevTask[]): { groups: TaskGroup[]; ungrouped: DevTask[] } {
  const groupMap = new Map<string, DevTask[]>();
  const ungrouped: DevTask[] = [];

  for (const task of tasks) {
    if (task.group_id) {
      const list = groupMap.get(task.group_id) || [];
      list.push(task);
      groupMap.set(task.group_id, list);
    } else {
      ungrouped.push(task);
    }
  }

  const groups: TaskGroup[] = [];
  for (const [groupId, groupTasks] of groupMap) {
    const sorted = sortByDependency(groupTasks);
    const label = sorted[0]?.post_title || sorted[0]?.title || groupId;
    groups.push({ groupId, label, tasks: sorted });
  }

  // Sort groups: groups with in-progress tasks first, then by earliest created_at
  groups.sort((a, b) => {
    const aActive = a.tasks.some(t => ['in-progress', 'awaiting_approval', 'approved'].includes(t.status));
    const bActive = b.tasks.some(t => ['in-progress', 'awaiting_approval', 'approved'].includes(t.status));
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    const aTime = Math.min(...a.tasks.map(t => new Date(t.created_at).getTime()));
    const bTime = Math.min(...b.tasks.map(t => new Date(t.created_at).getTime()));
    return bTime - aTime;
  });

  return { groups, ungrouped };
}

export default function DevTasksClient({ initialTasks }: { initialTasks: DevTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<DevTask[]>(initialTasks);
  const [tab, setTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { subscribe } = useEvent();

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
      if (ev.type === 'dev_task_deleted' && ev.data?.id) {
        const deletedId = ev.data.id;
        setTasks(prev => prev.filter(t => t.id !== deletedId));
      }
    });
  }, [subscribe]);

  async function handleDelete(taskId: string) {
    if (!confirm('이 태스크를 삭제할까요?')) return;
    setActionLoading(taskId);
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${taskId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? `삭제 실패 (${res.status})`);
      }
    } catch {
      setActionError('네트워크 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAction(taskId: string, status: 'approved' | 'rejected' | 'awaiting_approval') {
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

  // Bulk actions
  async function handleBulkAction(status: 'approved' | 'rejected') {
    if (selectedIds.size === 0) return;
    const label = status === 'approved' ? '승인' : '반려';
    if (!confirm(`선택한 ${selectedIds.size}개 태스크를 ${label}할까요?`)) return;
    setBulkLoading(true);
    setActionError(null);
    let ok = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/dev-tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status, rejection_note: status === 'rejected' ? '일괄 반려' : undefined }),
        });
        if (res.ok) {
          const updated = await res.json();
          setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
          ok++;
        }
      } catch { /* continue */ }
    }
    setSelectedIds(new Set());
    setBulkLoading(false);
    if (ok < selectedIds.size) setActionError(`${selectedIds.size - ok}건 처리 실패`);
    router.refresh();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    const allSelected = ids.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ids));
    }
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  const grouped = {
    all:               tasks,
    awaiting_approval: tasks.filter(t => t.status === 'awaiting_approval'),
    approved:          tasks.filter(t => t.status === 'approved'),
    'in-progress':     tasks.filter(t => t.status === 'in-progress'),
    done:              tasks.filter(t => t.status === 'done'),
    rejected:          tasks.filter(t => t.status === 'rejected'),
    failed:            tasks.filter(t => t.status === 'failed'),
  } as Record<string, DevTask[]>;

  const tabFiltered = grouped[tab] ?? tasks;
  const filtered = searchQuery.trim()
    ? tabFiltered.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || (t.detail ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
    : tabFiltered;

  // Group filtered tasks for rendering
  const { groups: taskGroups, ungrouped: ungroupedTasks } = useMemo(() => groupTasks(filtered), [filtered]);

  // Auto-expand groups that have active tasks, collapse completed groups
  useEffect(() => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      for (const g of taskGroups) {
        const allDone = g.tasks.every(t => t.status === 'done' || t.status === 'rejected');
        if (!allDone && !next.has(g.groupId)) {
          next.add(g.groupId);
        }
      }
      return next;
    });
  // Only run on initial mount and when groups change structurally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskGroups.map(g => g.groupId).join(',')]);

  function renderTaskCard(task: DevTask) {
    const cfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
    const st = STATUS_STYLE[task.status] ?? STATUS_STYLE.awaiting_approval;
    const isWaiting = task.status === 'awaiting_approval';
    const isLoading = actionLoading === task.id;
    const diffCfg = task.difficulty ? DIFFICULTY_CONFIG[task.difficulty] : null;
    const impactAreas = parseImpactAreas(task.impact_areas);

    // 유령 태스크 감지: done인데 changed_files가 비어있음
    const changedFiles = (() => { try { return JSON.parse(task.changed_files || '[]'); } catch { return []; } })();
    const isGhostDone = task.status === 'done' && changedFiles.length === 0;
    const canSelect = ['awaiting_approval', 'rejected', 'failed'].includes(task.status);

    return (
      <div
        key={task.id}
        className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${st.outerBorder} ${selectedIds.has(task.id) ? 'ring-2 ring-indigo-400' : ''}`}
      >
        {/* Status stripe */}
        {st.stripe && <div className={`h-1 w-full ${st.stripe}`} />}

        <div className={`flex items-start gap-2 p-4 ${st.innerBg}`}>
          {/* Checkbox for bulk selection */}
          {canSelect && (
            <input
              type="checkbox"
              checked={selectedIds.has(task.id)}
              onChange={(e) => { e.stopPropagation(); toggleSelect(task.id); }}
              className="mt-1 w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-300 flex-shrink-0"
            />
          )}

          <Link
            href={`/dev-tasks/${task.id}`}
            className={`block flex-1 hover:shadow-inner transition-all group`}
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
                  {isGhostDone && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium bg-yellow-50 border-yellow-300 text-yellow-700">⚠ 변경 없음</span>
                  )}
                  {task.status === 'rejected' && task.rejection_note && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-zinc-50 border-zinc-200 text-zinc-500 truncate max-w-[180px]" title={task.rejection_note}>
                      💬 {task.rejection_note.slice(0, 30)}{task.rejection_note.length > 30 ? '…' : ''}
                    </span>
                  )}
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
        </div>{/* end flex wrapper (checkbox + link) */}

        {/* Delete — awaiting_approval 태스크 */}
        {task.status === 'awaiting_approval' && (
          <div className="flex justify-end items-center gap-1 px-4 pb-3 pt-2 border-t border-zinc-100">
            <button
              onClick={() => handleDelete(task.id)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-zinc-400 border border-zinc-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              🗑 삭제
            </button>
          </div>
        )}

        {/* Delete — rejected / failed 태스크 */}
        {(task.status === 'rejected' || task.status === 'failed') && (
          <div className="flex justify-end items-center gap-2 px-4 pb-3 pt-2 border-t border-zinc-100">
            <button
              onClick={() => handleDelete(task.id)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-zinc-400 border border-zinc-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isLoading ? <span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin inline-block" /> : '🗑 삭제'}
            </button>
          </div>
        )}

        {/* Approve/Reject — 우측 정렬, 버튼 크기 확대 */}
        {isWaiting && (
          <div className="flex justify-end items-center gap-2 px-4 pb-3 pt-2 border-t border-amber-100 bg-amber-50/40">
            <button
              onClick={() => handleAction(task.id, 'rejected')}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-white text-zinc-500 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              ✕ 반려
            </button>
            <button
              onClick={() => handleAction(task.id, 'approved')}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
            >
              {isLoading ? (
                <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중</>
              ) : '✓ 승인하고 작업 시작'}
            </button>
          </div>
        )}
      </div>
    );
  }

  const STATS = [
    { label: '검토 요청됨',      key: 'awaiting_approval', color: 'bg-amber-50 border-amber-200 text-amber-700',   dot: 'bg-amber-400',   pulse: true },
    { label: '승인됨',           key: 'approved',           color: 'bg-teal-50 border-teal-200 text-teal-700',     dot: 'bg-teal-400',    pulse: true  },
    { label: 'Jarvis 작업 중',   key: 'in-progress',        color: 'bg-indigo-50 border-indigo-200 text-indigo-700', dot: 'bg-indigo-400', pulse: true },
    { label: '완료',             key: 'done',               color: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-400', pulse: false },
    { label: '반려',             key: 'rejected',           color: 'bg-zinc-50 border-zinc-200 text-zinc-500',    dot: 'bg-zinc-300',    pulse: false },
    { label: '실패',             key: 'failed',             color: 'bg-red-50 border-red-200 text-red-600',       dot: 'bg-red-400',     pulse: false },
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

      {/* Search + Bulk actions toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="🔍 태스크 검색 (제목, 상세)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 pl-9 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">🔍</span>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
            <span className="text-xs font-medium text-indigo-700">{selectedIds.size}개 선택</span>
            <button
              onClick={() => handleBulkAction('approved')}
              disabled={bulkLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              ✓ 일괄 승인
            </button>
            <button
              onClick={() => handleBulkAction('rejected')}
              disabled={bulkLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              ✕ 일괄 반려
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700"
            >
              선택 해제
            </button>
          </div>
        )}
      </div>

      {/* Select all for current filter */}
      {filtered.length > 0 && (tab === 'awaiting_approval' || tab === 'rejected' || tab === 'failed') && (
        <div className="flex items-center gap-2 px-1">
          <input
            type="checkbox"
            checked={filtered.every(t => selectedIds.has(t.id))}
            onChange={() => toggleSelectAll(filtered.map(t => t.id))}
            className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-300"
          />
          <span className="text-xs text-zinc-500">전체 선택 ({filtered.length}개)</span>
        </div>
      )}

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-400 text-sm">이 상태의 태스크가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Grouped tasks */}
          {taskGroups.map(group => {
            const isExpanded = expandedGroups.has(group.groupId);
            const doneCount = group.tasks.filter(t => t.status === 'done').length;
            const total = group.tasks.length;
            const allDone = doneCount === total;
            const inProgressCount = group.tasks.filter(t => t.status === 'in-progress').length;
            const awaitingCount = group.tasks.filter(t => t.status === 'awaiting_approval').length;

            // Build a set of all task IDs in this group for dependency checking
            const groupTaskIds = new Set(group.tasks.map(t => t.id));

            return (
              <div key={group.groupId} className="rounded-xl border border-indigo-100 bg-indigo-50/30 overflow-hidden shadow-sm">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.groupId)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-indigo-50/60 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-indigo-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-800 truncate">
                      📦 {group.label}
                    </h3>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1 rounded-full bg-zinc-200 overflow-hidden">
                        {total > 0 && (
                          <div className="h-full flex">
                            {doneCount > 0 && (
                              <div className="bg-emerald-500 h-full" style={{ width: `${(doneCount / total) * 100}%` }} />
                            )}
                            {inProgressCount > 0 && (
                              <div className="bg-indigo-500 h-full" style={{ width: `${(inProgressCount / total) * 100}%` }} />
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                        {doneCount}/{total}
                      </span>
                    </div>
                  </div>
                  {/* Status badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {awaitingCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                        🔍 {awaitingCount}
                      </span>
                    )}
                    {inProgressCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium">
                        ⚙ {inProgressCount}
                      </span>
                    )}
                    {allDone && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                        🎉 완료
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded child tasks */}
                {isExpanded && (
                  <div className="ml-6 border-l-2 border-indigo-200 pl-4 pb-3 pr-3 space-y-2">
                    {group.tasks.map(task => {
                      const deps = parseDependsOn(task.depends_on);
                      const depsInGroup = deps.filter(d => groupTaskIds.has(d));
                      const allDepsDone = depsInGroup.length === 0 || depsInGroup.every(depId => {
                        const depTask = group.tasks.find(t => t.id === depId);
                        return depTask?.status === 'done';
                      });

                      return (
                        <div key={task.id}>
                          {/* Dependency indicator */}
                          {depsInGroup.length > 0 && (
                            <div className="flex items-center gap-1 mb-1 ml-1">
                              <span className={`w-3 h-3 flex items-center justify-center rounded-full ${allDepsDone ? 'bg-emerald-100' : 'bg-zinc-200'}`}>
                                {allDepsDone && <Check className="w-2 h-2 text-emerald-600" />}
                              </span>
                              <span className="text-[9px] text-zinc-500">
                                {allDepsDone ? '선행 완료' : `선행 ${depsInGroup.length}개 대기`}
                              </span>
                            </div>
                          )}
                          {renderTaskCard(task)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped tasks (no group_id) */}
          {ungroupedTasks.map(task => renderTaskCard(task))}
        </div>
      )}
    </div>
  );
}
