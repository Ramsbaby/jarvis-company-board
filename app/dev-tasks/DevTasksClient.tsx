'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';
import type { DevTask } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

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
              key={`code-${i}-${code.slice(0, 16)}`}
              className="mx-0.5 px-1 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono text-[0.82em] border border-zinc-200 not-italic"
            >
              {code}{isLast ? '…' : ''}
            </code>
          );
        }
        return <span key={`part-${i}-${part.slice(0, 16)}`}>{part}</span>;
      })}
    </>
  );
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

/* ─── 그룹 타입 ─── */
interface TaskGroup {
  key: string;
  /** 'batch' = dev-queue 배치(batch_id), 'post' = 게시글 논의(post_title) */
  kind: 'batch' | 'post';
  postTitle: string | null;
  postId: string | null;
  batchId: string | null;
  source: string | null;
  tasks: DevTask[];
}

/* ─── 상태 요약 배지 ─── */
const STATUS_SUMMARY_CONFIG: Record<string, { emoji: string; label: string; cls: string }> = {
  awaiting_approval: { emoji: '🟡', label: '검토', cls: 'text-amber-600' },
  approved:          { emoji: '🟢', label: '승인', cls: 'text-teal-600' },
  'in-progress':     { emoji: '🔵', label: '진행', cls: 'text-indigo-600' },
  done:              { emoji: '✅', label: '완료', cls: 'text-emerald-600' },
  rejected:          { emoji: '⛔', label: '반려', cls: 'text-zinc-400' },
  failed:            { emoji: '❌', label: '실패', cls: 'text-red-500' },
};

function GroupStatusSummary({ tasks }: { tasks: DevTask[] }) {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {Object.entries(counts).map(([status, count]) => {
        const cfg = STATUS_SUMMARY_CONFIG[status];
        if (!cfg) return null;
        return (
          <span key={status} className={`text-[11px] font-medium ${cfg.cls}`}>
            {cfg.emoji} {cfg.label} {count}
          </span>
        );
      })}
    </div>
  );
}

/* ─── 개별 태스크 카드 ─── */
function TaskCard({
  task, isGrouped, actionLoading, onAction, onDelete, onDetailUpdate,
}: {
  task: DevTask;
  isGrouped: boolean;
  actionLoading: string | null;
  onAction: (taskId: string, status: 'approved' | 'rejected' | 'awaiting_approval') => void;
  onDelete: (taskId: string) => void;
  onDetailUpdate: (id: string, detail: string) => void;
}) {
  const cfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.low;
  const st = STATUS_STYLE[task.status] ?? STATUS_STYLE.awaiting_approval;
  const isWaiting = task.status === 'awaiting_approval';
  const isLoading = actionLoading === task.id;
  const diffCfg = task.difficulty ? DIFFICULTY_CONFIG[task.difficulty] : null;
  const impactAreas = parseImpactAreas(task.impact_areas);

  return (
    <div className={`rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${st.outerBorder}`}>
      {st.stripe && <div className={`h-1 w-full ${st.stripe}`} />}

      <Link
        href={`/dev-tasks/${task.id}`}
        className={`block p-4 hover:shadow-inner transition-all group ${st.innerBg}`}
      >
        {/* Context bar — 그룹 내에서는 post_title 숨김 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {!isGrouped && (
            <>
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
            </>
          )}
          {task.assignee && (
            <>
              {!isGrouped && <span className="text-zinc-200 text-[10px]">·</span>}
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

        {/* Detail */}
        <TaskDetail task={task} isWaiting={isWaiting} onDetailUpdate={onDetailUpdate} />

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

      {/* Delete — awaiting_approval */}
      {task.status === 'awaiting_approval' && (
        <div className="flex justify-end items-center gap-1 px-4 pb-3 pt-2 border-t border-zinc-100">
          <button
            onClick={() => onDelete(task.id)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-zinc-400 border border-zinc-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            🗑 삭제
          </button>
        </div>
      )}

      {/* Delete — rejected / failed */}
      {(task.status === 'rejected' || task.status === 'failed') && (
        <div className="flex justify-end items-center gap-2 px-4 pb-3 pt-2 border-t border-zinc-100">
          <button
            onClick={() => onDelete(task.id)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-zinc-400 border border-zinc-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {isLoading ? <span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin inline-block" /> : '🗑 삭제'}
          </button>
        </div>
      )}

      {/* Approve/Reject */}
      {isWaiting && (
        <div className="flex justify-end items-center gap-2 px-4 pb-3 pt-2 border-t border-amber-100 bg-amber-50/40">
          <button
            onClick={() => onAction(task.id, 'rejected')}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-zinc-500 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            ✕ 반려
          </button>
          <button
            onClick={() => onAction(task.id, 'approved')}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
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

/* ─── 그루핑된 태스크 그룹 ─── */
function TaskGroupCard({
  group, actionLoading, batchLoading, onAction, onBatchAction, onDelete, onDetailUpdate,
}: {
  group: TaskGroup;
  actionLoading: string | null;
  batchLoading: string | null;
  onAction: (taskId: string, status: 'approved' | 'rejected' | 'awaiting_approval') => void;
  onBatchAction: (taskIds: string[], status: 'approved' | 'rejected') => void;
  onDelete: (taskId: string) => void;
  onDetailUpdate: (id: string, detail: string) => void;
}) {
  const hasActiveTask = group.tasks.some(t =>
    t.status === 'awaiting_approval' || t.status === 'approved' || t.status === 'in-progress'
  );
  const [open, setOpen] = useState(hasActiveTask);
  const awaitingTasks = group.tasks.filter(t => t.status === 'awaiting_approval');
  const isBatchLoading = batchLoading === group.key;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white overflow-hidden shadow-sm">
      {/* Group header */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-indigo-50/40 transition-colors"
      >
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-indigo-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {group.kind === 'batch' ? (
              <>
                <span className="text-[10px] text-indigo-500 font-medium">
                  📦 {group.source ?? 'batch'}
                </span>
                {group.batchId && (
                  <>
                    <span className="text-[10px] text-zinc-300">·</span>
                    <span className="text-[10px] text-zinc-400 font-mono truncate">
                      {group.batchId}
                    </span>
                  </>
                )}
                <span className="text-[10px] text-zinc-300">·</span>
                <span className="text-[10px] text-zinc-500 font-medium">
                  {group.tasks.length}개 태스크
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] text-indigo-500 font-medium">🔗 논의</span>
                <span className="text-[10px] text-zinc-300">·</span>
                <span className="text-[10px] text-zinc-500 font-medium">
                  {group.tasks.length}개 태스크
                </span>
              </>
            )}
          </div>
          <h3 className="text-sm font-bold text-zinc-900 leading-snug truncate">
            {group.kind === 'batch'
              ? (group.tasks[0]?.title ?? group.batchId ?? '배치 태스크')
              : group.postTitle}
          </h3>
          <div className="mt-1.5">
            <GroupStatusSummary tasks={group.tasks} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="shrink-0 w-16 flex flex-col items-end gap-1">
          <span className="text-[10px] text-zinc-400 tabular-nums">
            {group.tasks.filter(t => t.status === 'done').length}/{group.tasks.length}
          </span>
          <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${(group.tasks.filter(t => t.status === 'done').length / group.tasks.length) * 100}%` }}
            />
          </div>
        </div>
      </button>

      {/* Batch actions for awaiting_approval tasks */}
      {open && awaitingTasks.length > 1 && (
        <div className="flex items-center justify-end gap-2 px-5 py-2 border-t border-indigo-50 bg-amber-50/30">
          <span className="text-[11px] text-amber-600 mr-auto">
            {awaitingTasks.length}개 태스크 대기 중
          </span>
          <button
            onClick={() => onBatchAction(awaitingTasks.map(t => t.id), 'rejected')}
            disabled={isBatchLoading}
            className="px-3 py-1 text-[11px] font-medium rounded-lg bg-white text-zinc-500 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors"
          >
            전체 반려
          </button>
          <button
            onClick={() => onBatchAction(awaitingTasks.map(t => t.id), 'approved')}
            disabled={isBatchLoading}
            className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isBatchLoading ? (
              <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중</>
            ) : '✓ 전체 승인'}
          </button>
        </div>
      )}

      {/* Task list inside group */}
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-2 border-t border-indigo-50">
          {group.tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isGrouped
              actionLoading={actionLoading}
              onAction={onAction}
              onDelete={onDelete}
              onDetailUpdate={onDetailUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DevTasksClient({ initialTasks }: { initialTasks: DevTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<DevTask[]>(initialTasks);
  const [tab, setTab] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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

  async function handleBatchAction(taskIds: string[], status: 'approved' | 'rejected') {
    const groupKey = taskIds.join(',');
    setBatchLoading(groupKey);
    setActionError(null);
    try {
      const results = await Promise.allSettled(
        taskIds.map(id =>
          fetch(`/api/dev-tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status }),
          }).then(async res => {
            if (!res.ok) throw new Error(`${res.status}`);
            return { id, data: await res.json() };
          })
        )
      );
      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<{ id: string; data: DevTask }> => r.status === 'fulfilled');
      if (succeeded.length > 0) {
        setTasks(prev => prev.map(t => {
          const match = succeeded.find(s => s.value.id === t.id);
          return match ? { ...t, ...match.value.data } : t;
        }));
        router.refresh();
      }
      const failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) {
        setActionError(`${failCount}개 태스크 처리 실패`);
      }
    } catch {
      setActionError('네트워크 오류가 발생했습니다.');
    } finally {
      setBatchLoading(null);
    }
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

  const filtered = grouped[tab] ?? tasks;

  /* ─── batch_id 우선, post_title fallback 그루핑 ─── */
  const taskGroups = useMemo(() => {
    const groupMap = new Map<string, TaskGroup>();
    const singles: DevTask[] = [];

    // post_title 카운트 (batch_id 없는 태스크만 대상)
    const titleCounts = new Map<string, number>();
    for (const t of filtered) {
      if (!t.batch_id && t.post_title) {
        titleCounts.set(t.post_title, (titleCounts.get(t.post_title) ?? 0) + 1);
      }
    }

    for (const t of filtered) {
      // 1순위: batch_id — dev-queue v2 배치는 1개여도 박스로 표시
      if (t.batch_id) {
        const key = `batch:${t.batch_id}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            kind: 'batch',
            postTitle: null,
            postId: null,
            batchId: t.batch_id,
            source: t.source ?? null,
            tasks: [],
          });
        }
        groupMap.get(key)!.tasks.push(t);
        continue;
      }

      // 2순위: post_title (2개 이상일 때만 그룹)
      if (t.post_title && (titleCounts.get(t.post_title) ?? 0) >= 2) {
        const key = `post:${t.post_title}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            kind: 'post',
            postTitle: t.post_title,
            postId: t.post_id ?? null,
            batchId: null,
            source: null,
            tasks: [],
          });
        }
        groupMap.get(key)!.tasks.push(t);
        continue;
      }

      singles.push(t);
    }

    return { groups: Array.from(groupMap.values()), singles };
  }, [filtered]);

  const STATS = [
    { label: '검토 요청됨',      key: 'awaiting_approval', color: 'bg-amber-50 border-amber-200 text-amber-700',   dot: 'bg-amber-400',   pulse: true },
    { label: '승인됨',           key: 'approved',           color: 'bg-teal-50 border-teal-200 text-teal-700',     dot: 'bg-teal-400',    pulse: true  },
    { label: 'Jarvis 작업 중',   key: 'in-progress',        color: 'bg-indigo-50 border-indigo-200 text-indigo-700', dot: 'bg-indigo-400', pulse: true },
    { label: '완료',             key: 'done',               color: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-400', pulse: false },
    { label: '반려',             key: 'rejected',           color: 'bg-zinc-50 border-zinc-200 text-zinc-500',    dot: 'bg-zinc-300',    pulse: false },
    { label: '실패',             key: 'failed',             color: 'bg-red-50 border-red-200 text-red-600',       dot: 'bg-red-400',     pulse: false },
  ];

  function handleDetailUpdate(id: string, detail: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, detail } : t));
  }

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

      {/* Task list — grouped */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-400 text-sm">이 상태의 태스크가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Grouped tasks */}
          {taskGroups.groups.map(group => (
            <TaskGroupCard
              key={group.key}
              group={group}
              actionLoading={actionLoading}
              batchLoading={batchLoading}
              onAction={handleAction}
              onBatchAction={(ids, status) => handleBatchAction(ids, status)}
              onDelete={handleDelete}
              onDetailUpdate={handleDetailUpdate}
            />
          ))}

          {/* Ungrouped (single) tasks */}
          {taskGroups.singles.length > 0 && taskGroups.groups.length > 0 && (
            <div className="pt-2">
              <p className="text-[11px] text-zinc-400 font-medium mb-2 px-1">개별 태스크</p>
            </div>
          )}
          <div className="space-y-3">
            {taskGroups.singles.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                isGrouped={false}
                actionLoading={actionLoading}
                onAction={handleAction}
                onDelete={handleDelete}
                onDetailUpdate={handleDetailUpdate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
