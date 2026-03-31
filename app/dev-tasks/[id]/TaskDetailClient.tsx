'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useEvent } from '@/contexts/EventContext';
import MarkdownContent from '@/components/MarkdownContent';
import type { DevTask } from '@/lib/types';

interface SourcePost {
  id: string;
  title: string;
  type: string;
  status: string;
  author_display: string;
  comment_count: number;
}

interface LogEntry { time: string; message: string; }

interface AttemptEntry {
  attempt: number;
  timestamp: string;
  previous_status: string;
  rejection_note: string | null;
  result_summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  log_count: number;
}

interface ImpactAnalysis {
  improvement_score?: number;
  user_visible?: string;
  risk_reduced?: string;
  impact_analyzed_at?: string;
  cached?: boolean;
}

// ── Config maps ─────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { dot: string; badge: string; label: string; ring: string; stripe: string }> = {
  urgent: { dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',         label: '긴급', ring: 'ring-red-200',    stripe: 'bg-red-400' },
  high:   { dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 border-orange-200', label: '높음', ring: 'ring-orange-200', stripe: 'bg-orange-400' },
  medium: { dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 border-blue-200',       label: '중간', ring: 'ring-blue-100',   stripe: 'bg-blue-400' },
  low:    { dot: 'bg-zinc-300',   badge: 'bg-zinc-50 text-zinc-500 border-zinc-200',       label: '낮음', ring: 'ring-zinc-100',   stripe: 'bg-zinc-300' },
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가',
};

const DIFFICULTY_DESC: Record<string, string> = {
  easy:   '단순 수정 — 파일 1-2개, 로직 변경 없음',
  medium: '중간 수준 — 파일 2-5개, 부분 로직 수정',
  hard:   '복잡한 작업 — 여러 모듈 수정, 구조 변경',
  expert: '고난도 — 아키텍처 변경 또는 도메인 전문지식 필요',
};

const IMPACT_AREA_CHIPS: Record<string, string> = {
  security: '🔒 보안',
  performance: '⚡ 성능',
  ux: '✨ UX',
  infra: '🛠 인프라',
  data: '📊 데이터',
  cost: '💰 비용',
  reliability: '🛡 안정성',
};

const TYPE_LABEL: Record<string, string> = {
  decision: '결정', discussion: '논의', issue: '이슈', inquiry: '문의',
};

const SOURCE_STATUS_LABEL: Record<string, string> = {
  open: '토론중', 'in-progress': '진행중', resolved: '마감',
};

// Status pill config
const STATUS_PILL: Record<string, { label: string; className: string }> = {
  awaiting_approval:  { label: '🔍 검토 대기',   className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved:           { label: '✅ 승인됨',          className: 'bg-teal-50 text-teal-700 border-teal-200' },
  'in-progress':      { label: '⚙️ Jarvis 작업 중', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  done:               { label: '🎉 완료',            className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected:           { label: '✕ 반려',             className: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
  failed:             { label: '⚠ 실패',             className: 'bg-red-50 text-red-600 border-red-200' },
};

// ── Utility functions ────────────────────────────────────────────────────────

function fmt(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}

function elapsed(from?: string, to?: string): string | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}초`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`;
}

function secsToNextCron(): number {
  const now = new Date();
  const totalSec = now.getMinutes() * 60 + now.getSeconds();
  const period = 5 * 60;
  return period - (totalSec % period);
}


function toGitHubUrl(filePath: string): string | null {
  // Normalize path: remove home-dir prefixes
  let p = filePath
    .replace(/^~\/\.jarvis\//, '')
    .replace(/^\/Users\/ramsbaby\/\.jarvis\//, '');
  if (p !== filePath) {
    return `https://github.com/Ramsbaby/jarvis/blob/main/${p}`;
  }
  // jarvis-board paths
  p = filePath
    .replace(/^~\/jarvis-board\//, '')
    .replace(/^\/Users\/ramsbaby\/jarvis-board\//, '');
  if (p !== filePath) {
    return `https://github.com/Ramsbaby/jarvis-board/blob/main/${p}`;
  }
  return null;
}

function parseDependsOn(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((v: unknown) => typeof v === 'string' && v.length > 0) : [];
  } catch { return []; }
}

// "진행 중 (Xs 경과)" 형태의 헛비트 패턴 — 단계 정보 없으므로 건너뜀
const HEARTBEAT_RE = /진행\s*중\s*\(\d+s\s*경과\)/;

function detectPhase(logs: LogEntry[]): number {
  if (logs.length === 0) return 0;
  // 마지막부터 역순으로 탐색 — 헛비트는 건너뜀
  for (let i = logs.length - 1; i >= 0; i--) {
    const msg = logs[i].message.toLowerCase();
    if (HEARTBEAT_RE.test(msg)) continue; // 헛비트 무시
    if (/완료|done|success|finish/.test(msg)) return 3;
    if (/테스트|test|검증|verify|build/.test(msg)) return 2;
    if (/수정|writing|edit|create|update/.test(msg)) return 1;
    if (/분석|reading|checking|read|check/.test(msg)) return 0;
    break; // 패턴 없는 일반 로그 → 0단계 유지
  }
  return 0;
}

// 제목 내 `코드` → styled <code> 태그, 경로는 파일명만 표시
// 미완성 백틱(60자 잘림)도 처리 — 닫힌 척 하고 끝에 … 표시
function renderTitle(title: string): React.ReactNode {
  const isTruncated = /`[^`]*$/.test(title);
  const normalized = isTruncated ? title + '`' : title;
  const parts = normalized.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          const code = part.slice(1, -1);
          const short = code.split('/').pop() || code;
          const isLast = isTruncated && i === parts.length - 2;
          return (
            <code
              key={i}
              title={code}
              className="mx-0.5 px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono text-[0.75em] border border-zinc-200 not-italic font-normal"
            >
              {short}{isLast ? '…' : ''}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TimelineStep({
  icon, label, sublabel, time, elapsedLabel, done, active, pulse, rejected, failed,
}: {
  icon: string; label: string; sublabel?: string; time?: string;
  elapsedLabel?: string | null; done: boolean; active: boolean;
  pulse?: boolean; rejected?: boolean; failed?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center shrink-0 relative z-10">
        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-300 ${
          failed   ? 'bg-red-100 border-red-300 text-red-400' :
          rejected ? 'bg-zinc-100 border-zinc-200 text-zinc-300' :
          done     ? 'bg-emerald-500 border-emerald-500 text-white' :
          active   ? 'bg-indigo-500 border-indigo-500 text-white' :
                     'bg-white border-zinc-200 text-zinc-300'
        } ${pulse && active ? 'animate-pulse' : ''}`}>
          {done ? '✓' : failed ? '✕' : active ? icon : '·'}
        </div>
      </div>
      <div className="pb-6 min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-snug ${
          failed   ? 'text-red-500' :
          rejected ? 'text-zinc-400' :
          done || active ? 'text-zinc-900' : 'text-zinc-400'
        }`}>{label}</p>
        {sublabel && (
          <p className={`text-[11px] mt-0.5 ${
            failed ? 'text-red-400' : done || active ? 'text-zinc-500' : 'text-zinc-300'
          }`}>{sublabel}</p>
        )}
        {elapsedLabel && (
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium">{elapsedLabel}</span>
        )}
        {time && (
          <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">{fmt(time)} · {timeAgo(time)}</p>
        )}
        {active && !time && (
          <p className="text-[11px] text-indigo-500 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse inline-block" />
            진행 중...
          </p>
        )}
      </div>
    </div>
  );
}

function ImpactChips({ areas }: { areas: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {areas.map(area => {
        const label = IMPACT_AREA_CHIPS[area.toLowerCase()] ?? area;
        return (
          <span key={area} className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-medium">
            {label}
          </span>
        );
      })}
    </div>
  );
}

function StarRating({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={i <= score ? 'text-amber-400' : 'text-zinc-200'}>★</span>
      ))}
    </span>
  );
}

function FollowUpTaskForm({ taskId, taskTitle, sourceId, boardUrl }: {
  taskId: string; taskTitle: string; sourceId: string | null; boardUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const newId = `followup-${taskId.slice(0, 8)}-${Date.now()}`;
      const res = await fetch('/api/dev-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: newId,
          title: text.trim(),
          detail: text.trim(),
          source: boardUrl || `followup:${taskId}`,
          status: 'awaiting_approval',
          priority: 'medium',
        }),
      });
      if (!res.ok) throw new Error(`태스크 등록 실패 (${res.status})`);
      setSubmitted(true);
      setText('');
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '태스크 등록 중 오류가 발생했습니다.');
    } finally { setSubmitting(false); }
  }

  if (submitted) return (
    <p className="text-xs text-emerald-600 font-medium">✓ 후속 태스크가 검토 대기에 추가됐습니다</p>
  );

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="text-xs text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
    >
      + 후속 태스크 요청
    </button>
  );

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="추가로 해야 할 작업을 입력하세요..."
        className="w-full text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl p-3 resize-none outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
        rows={3}
        autoFocus
      />
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700">취소</button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {submitting ? '등록 중...' : '태스크 등록'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TaskDetailClient({
  initialTask, isOwner, isGuest, sourcePost,
}: {
  initialTask: DevTask;
  isOwner: boolean;
  isGuest: boolean;
  sourcePost?: SourcePost | null;
}) {
  const router = useRouter();
  const [task, setTask] = useState<DevTask>(initialTask);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [cronSecs, setCronSecs] = useState(secsToNextCron);
  const [logExpanded, setLogExpanded] = useState(false);
  const [showRetryForm, setShowRetryForm] = useState(false);
  const [retryNote, setRetryNote] = useState('');
  const [runningElapsed, setRunningElapsed] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [impactAnalysis, setImpactAnalysis] = useState<ImpactAnalysis | null>(() => {
    if (!initialTask.impact_analyzed_at) return null;
    return {
      improvement_score: initialTask.improvement_score ?? undefined,
      user_visible: initialTask.user_visible ?? undefined,
      risk_reduced: initialTask.risk_reduced ?? undefined,
      impact_analyzed_at: initialTask.impact_analyzed_at,
      cached: true,
    };
  });
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [siblingTasks, setSiblingTasks] = useState<DevTask[]>([]);
  const [siblingsExpanded, setSiblingsExpanded] = useState(true);

  // Inline editing state
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState('');
  const [savedFlash, setSavedFlash] = useState<'minutes' | 'difficulty' | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const { subscribe, connected } = useEvent();

  const isLive     = task.status === 'in-progress';
  const isDone     = task.status === 'done';
  const isRejected = task.status === 'rejected';
  const isAwaiting = task.status === 'awaiting_approval';
  const isApproved = task.status === 'approved';
  const isPending  = false; // pending 상태 제거됨 — awaiting_approval로 통합
  const isFailed   = task.status === 'failed';

  // SSE real-time updates
  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'dev_task_updated' && ev.data?.task?.id === task.id) {
        setTask(ev.data.task as unknown as DevTask);
        setLastUpdated(new Date());
      }
    });
  }, [subscribe, task.id]);

  // Fallback polling when in-progress (5s) or approved (10s)
  useEffect(() => {
    if (!isLive && !isApproved) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/dev-tasks/${task.id}`).catch(() => null);
      if (res?.ok) {
        const updated = await res.json();
        if (updated.status !== task.status || updated.execution_log !== task.execution_log) {
          setTask(updated);
          setLastUpdated(new Date());
        }
      }
    }, isLive ? 5000 : 10000);
    return () => clearInterval(interval);
  }, [task.id, task.status, task.execution_log, isLive, isApproved]);

  // Cron countdown (5-min boundary)
  useEffect(() => {
    if (!isApproved) return;
    const t = setInterval(() => {
      setCronSecs(secsToNextCron());
    }, 1000);
    return () => clearInterval(t);
  }, [isApproved]);

  // Live elapsed timer when running
  useEffect(() => {
    if (!isLive || !task.started_at) return;
    function update() {
      setRunningElapsed(Math.floor((Date.now() - new Date(task.started_at!).getTime()) / 1000));
    }
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [isLive, task.started_at]);

  // Scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task.execution_log]);

  // Fetch sibling tasks when group_id exists
  useEffect(() => {
    if (!task.group_id) return;
    fetch(`/api/dev-tasks?group_id=${encodeURIComponent(task.group_id)}`)
      .then(res => res.ok ? res.json() : [])
      .then((tasks: DevTask[]) => setSiblingTasks(tasks))
      .catch(() => setSiblingTasks([]));
  }, [task.group_id]);

  // ── Action handlers ────────────────────────────────────────────────────────

  async function handleApprove() {
    setActionLoading('approved');
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'approved' }),
      });
      if (res.ok) {
        setTask(prev => ({ ...prev, status: 'approved', approved_at: new Date().toISOString() }));
        router.refresh();
      } else if (res.status === 401) {
        setActionError('세션이 만료되었습니다. 다시 로그인해주세요.');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        setActionError(`오류가 발생했습니다 (${res.status}). 페이지를 새로고침해주세요.`);
      }
    } catch {
      setActionError('네트워크 오류. 연결을 확인해주세요.');
    } finally { setActionLoading(null); }
  }

  async function handleReject() {
    setActionLoading('rejected');
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'rejected', rejection_note: rejectNote || undefined }),
      });
      if (res.ok) {
        setTask(prev => ({
          ...prev, status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejection_note: rejectNote || null,
        }));
        setShowRejectForm(false);
        router.refresh();
      } else if (res.status === 401) {
        setActionError('세션이 만료되었습니다. 다시 로그인해주세요.');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        setActionError(`오류가 발생했습니다 (${res.status}).`);
      }
    } catch {
      setActionError('네트워크 오류. 연결을 확인해주세요.');
    } finally { setActionLoading(null); }
  }

  async function handleRetry() {
    setActionLoading('retry');
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'awaiting_approval' }),
      });
      if (res.ok) {
        setTask(prev => ({
          ...prev, status: 'awaiting_approval',
          rejected_at: null, rejection_note: null,
          approved_at: null, started_at: null,
          completed_at: null, result_summary: null,
          changed_files: '[]', execution_log: '[]',
        }));
        router.refresh();
      } else if (res.status === 401) {
        setActionError('세션이 만료되었습니다. 다시 로그인해주세요.');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        setActionError(`재시도 요청 실패 (${res.status})`);
      }
    } catch {
      setActionError('네트워크 오류.');
    } finally { setActionLoading(null); }
  }

  async function handleRetryWithNote() {
    if (!retryNote.trim()) { setShowRetryForm(false); return; }
    setActionLoading('retry-note');
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'awaiting_approval', detail: retryNote.trim() }),
      });
      if (res.ok) {
        setTask(prev => ({
          ...prev, status: 'awaiting_approval',
          detail: retryNote.trim(),
          rejected_at: null, rejection_note: null,
          approved_at: null, started_at: null,
          completed_at: null, result_summary: null,
          changed_files: '[]', execution_log: '[]',
        }));
        setShowRetryForm(false);
        setRetryNote('');
      } else if (res.status === 401) {
        setActionError('세션이 만료되었습니다.');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        setActionError(`재시도 요청 실패 (${res.status})`);
      }
    } catch {
      setActionError('네트워크 오류.');
    } finally { setActionLoading(null); }
  }

  async function handleCancelToReview() {
    setActionLoading('cancel');
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'awaiting_approval' }),
      });
      if (res.ok) {
        setTask(prev => ({
          ...prev, status: 'awaiting_approval',
          approved_at: null, started_at: null,
          completed_at: null, result_summary: null,
          changed_files: '[]', execution_log: '[]',
        }));
        router.refresh();
      } else if (res.status === 401) {
        setActionError('세션이 만료되었습니다. 다시 로그인해주세요.');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        setActionError(`요청 실패 (${res.status})`);
      }
    } catch {
      setActionError('네트워크 오류.');
    } finally { setActionLoading(null); }
  }

  async function handleDelete() {
    if (!confirm('이 태스크를 삭제할까요?')) return;
    setActionLoading('delete');
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        router.push('/dev-tasks');
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? `삭제 실패 (${res.status})`);
      }
    } catch {
      setActionError('네트워크 오류.');
    } finally { setActionLoading(null); }
  }

  async function handleRequestReview() {
    setActionLoading('request_review');
    setActionError(null);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'awaiting_approval' }),
      });
      if (res.ok) {
        setTask(prev => ({ ...prev, status: 'awaiting_approval' }));
        router.refresh();
      } else if (res.status === 401) {
        setActionError('세션이 만료되었습니다. 다시 로그인해주세요.');
      } else {
        setActionError(`검토 요청 실패 (${res.status})`);
      }
    } catch {
      setActionError('네트워크 오류.');
    } finally { setActionLoading(null); }
  }

  async function handleAnalyzeImpact() {
    setLoadingImpact(true);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}/analyze-impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setImpactAnalysis(data);
        // Sync persisted fields into local task state
        setTask(prev => ({
          ...prev,
          actual_impact: data.actual_impact ?? prev.actual_impact,
          impact_areas: data.impact_areas ? JSON.stringify(data.impact_areas) : prev.impact_areas,
          improvement_score: data.improvement_score ?? prev.improvement_score,
          user_visible: data.user_visible != null ? String(data.user_visible) : prev.user_visible,
          risk_reduced: data.risk_reduced ?? prev.risk_reduced,
          impact_analyzed_at: data.impact_analyzed_at ?? prev.impact_analyzed_at,
        }));
      }
    } catch {
      // silently fail — analysis is optional
    } finally {
      setLoadingImpact(false);
    }
  }

  async function handleSaveMinutes() {
    const val = parseInt(minutesDraft, 10);
    if (isNaN(val) || val < 1 || val > 480) { setEditingMinutes(false); return; }
    setEditingMinutes(false);
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ estimated_minutes: val }),
      });
      if (res.ok) {
        setTask(prev => ({ ...prev, estimated_minutes: val }));
        setSavedFlash('minutes');
        setTimeout(() => setSavedFlash(null), 1500);
      }
    } catch { /* silently ignore */ }
  }

  async function handleCycleDifficulty() {
    const order = ['easy', 'medium', 'hard'] as const;
    const current = task.difficulty;
    const idx = order.indexOf(current as typeof order[number]);
    const next = order[(idx + 1) % order.length];
    setTask(prev => ({ ...prev, difficulty: next }));
    try {
      const res = await fetch(`/api/dev-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ difficulty: next }),
      });
      if (res.ok) {
        setSavedFlash('difficulty');
        setTimeout(() => setSavedFlash(null), 1500);
      } else {
        // revert on failure
        setTask(prev => ({ ...prev, difficulty: current }));
      }
    } catch {
      setTask(prev => ({ ...prev, difficulty: current }));
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const cfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const logs: LogEntry[] = (() => { try { return JSON.parse(task.execution_log || '[]'); } catch { return []; } })();
  const changedFiles: string[] = (() => { try { return JSON.parse(task.changed_files || '[]'); } catch { return []; } })();
  const impactAreas: string[] = (() => { try { return JSON.parse(task.impact_areas || '[]'); } catch { return []; } })();
  const attemptHistory: AttemptEntry[] = (() => { try { return JSON.parse(task.attempt_history || '[]'); } catch { return []; } })();

  const dependsOnIds = parseDependsOn(task.depends_on);
  const isGhostTask = isDone && changedFiles.length === 0;

  const waitTime  = elapsed(task.created_at, (task.approved_at ?? task.rejected_at) ?? undefined);
  const workTime  = elapsed(task.started_at ?? undefined, task.completed_at ?? undefined);
  const totalTime = elapsed(task.created_at, (task.completed_at ?? task.rejected_at) ?? undefined);
  const sourcePostId = task.source?.startsWith('board:') ? task.source.replace('board:', '') : null;

  const cronMin = Math.floor(cronSecs / 60);
  const cronSecDisplay = cronSecs % 60;
  const cronProgress = ((5 * 60 - cronSecs) / (5 * 60)) * 100;

  const statusPill = STATUS_PILL[task.status] ?? STATUS_PILL.awaiting_approval;

  const stripeClass = isDone     ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
                      isLive     ? 'bg-gradient-to-r from-indigo-400 to-violet-400' :
                      isRejected ? 'bg-zinc-200' :
                      isFailed   ? 'bg-gradient-to-r from-red-300 to-rose-300' :
                      isAwaiting ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
                      isApproved ? 'bg-gradient-to-r from-teal-400 to-emerald-400' :
                                   'bg-zinc-100';

  // Phase detection — done일 때만 3(마무리), in-progress 중 서브스텝 "완료" 로그는 최대 2(검증)
  const currentPhase = isDone ? 3 : Math.min(detectPhase(logs), 2);
  const phaseNames = ['코드 분석', '코드 수정', '검증', '마무리'];
  const phaseIcons = ['📖', '✏️', '🔍', '✅'];

  // Last activity time from logs
  const lastLogTime = logs.length > 0 ? new Date(logs[logs.length - 1].time) : null;
  const lastActivitySecs = lastLogTime ? Math.floor((Date.now() - lastLogTime.getTime()) / 1000) : null;
  const isStale = lastActivitySecs !== null && lastActivitySecs > 60 && isLive;

  // Step group extraction — splits logs at ✅ boundaries to build progress strip
  const completedSteps = (() => {
    const steps: { label: string; startTime: string; endTime: string; durationSecs: number; stepNum: number }[] = [];
    let groupEntries: LogEntry[] = [];
    let groupStart: string | null = null;
    let n = 0;

    const getLabel = (entries: LogEntry[], fallback: number): string => {
      for (let i = entries.length - 1; i >= 0; i--) {
        const m = entries[i].message;
        if (HEARTBEAT_RE.test(m)) continue;
        if (/^⚙️|^✅|^⏳/.test(m)) continue;
        // Strip leading emoji/punctuation, take first 32 chars
        const clean = m.replace(/^[\s\S]{0,3}?\s/, '').trim();
        if (clean.length > 2) return clean.slice(0, 32);
      }
      return `단계 ${fallback}`;
    };

    for (const entry of logs) {
      if (/^⚙️/.test(entry.message)) {
        groupStart = entry.time;
        groupEntries = [entry];
      } else if (/^✅/.test(entry.message) && groupStart) {
        groupEntries.push(entry);
        n++;
        const startMs = new Date(groupStart).getTime();
        const endMs = new Date(entry.time).getTime();
        const dur = (!isNaN(startMs) && !isNaN(endMs)) ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0;
        steps.push({ label: getLabel(groupEntries, n), startTime: groupStart, endTime: entry.time, durationSecs: dur, stepNum: n });
        groupStart = entry.time;
        groupEntries = [];
      } else {
        groupEntries.push(entry);
      }
    }
    return steps;
  })();

  // Completion durations
  const completionDuration = task.started_at && task.completed_at
    ? Math.round((new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) / 60000)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-50 min-h-screen">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-zinc-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            뒤로
          </button>

          <p className="flex-1 min-w-0 text-sm font-semibold text-zinc-700 truncate">{task.title}</p>

          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end shrink-0">
            {/* SSE dot */}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}
              title={connected ? 'SSE 실시간 연결됨' : 'SSE 재연결 중...'}
            />

            {/* Status pill — in-progress + no logs = "대기 중" (실제 실행 아님) */}
            <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${
              isLive && logs.length === 0
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : statusPill.className
            } ${isLive && logs.length > 0 ? 'animate-pulse' : ''}`}>
              {isLive && logs.length === 0 ? '⏳ 실행 대기' : statusPill.label}
            </span>

            {isLive && logs.length > 0 && runningElapsed > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                {formatElapsed(runningElapsed)}
              </span>
            )}
            {isLive && logs.length === 0 && (
              <span className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                실행 대기 중
              </span>
            )}

            {isGuest && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 font-medium">
                열람 전용
              </span>
            )}

            {lastUpdated && (
              <span className="text-[10px] text-zinc-400 tabular-nums hidden sm:block">
                {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 업데이트
              </span>
            )}

            <div className="w-6 h-6 bg-zinc-900 rounded-md flex items-center justify-center font-bold text-xs text-white">J</div>
          </div>
        </div>
      </header>

      {/* Guest banner */}
      {isGuest && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-center">
          <p className="text-xs text-amber-700">게스트 모드 — 태스크 내용을 열람할 수 있지만 승인·반려 등 관리 기능은 사용할 수 없습니다.</p>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── Hero card ── */}
        <div className={`bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm ${cfg.ring ? `ring-1 ${cfg.ring}` : ''}`}>
          {/* Priority color stripe */}
          <div className={`h-1.5 w-full ${stripeClass}`} />

          <div className="p-5 md:p-6">
            {/* Title + badges row */}
            <div className="flex items-start gap-3 mb-4">
              <span className={`mt-2 w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
              <div className="flex-1 min-w-0">
                {/* 출처 게시물 제목 */}
                {task.post_title && (
                  <p className="text-xs text-indigo-500 font-semibold mb-1.5 flex items-center gap-1">
                    <span>🔗</span>
                    <span>{task.post_title}</span>
                  </p>
                )}
                <h1 className="text-xl font-bold text-zinc-900 leading-snug">{renderTitle(task.title)}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  {/* Priority */}
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border font-semibold ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  {/* Difficulty */}
                  {task.difficulty && (
                    <span
                      className={`group relative text-[11px] px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-700 font-medium ${isOwner ? 'cursor-pointer hover:bg-violet-100' : ''}`}
                      onClick={isOwner ? handleCycleDifficulty : undefined}
                      title={isOwner ? '클릭하여 난이도 변경' : undefined}
                    >
                      난이도: {DIFFICULTY_LABEL[task.difficulty] ?? task.difficulty}
                      {isOwner && <span className="ml-1 opacity-0 group-hover:opacity-60 text-[10px]">✏</span>}
                      {savedFlash === 'difficulty' && (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-emerald-600 font-semibold whitespace-nowrap bg-white border border-emerald-200 px-1.5 py-0.5 rounded shadow-sm">
                          저장됨
                        </span>
                      )}
                    </span>
                  )}
                  {/* Assignee */}
                  {task.assignee && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-500 font-medium">
                      👤 {task.assignee}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Expected impact box */}
            {task.expected_impact && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-violet-50 border border-violet-100">
                <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-1">💡 기대 효과</p>
                <p className="text-sm text-violet-800 leading-relaxed">{task.expected_impact}</p>
              </div>
            )}

            {/* Detail content */}
            {task.detail && (
              <div className={`text-sm text-zinc-700 leading-relaxed rounded-xl p-4 mb-3 ${
                isAwaiting ? 'bg-amber-50/60 border border-amber-100' : 'bg-zinc-50 border border-zinc-100'
              }`}>
                <MarkdownContent content={task.detail} />
              </div>
            )}

            {/* Impact area chips */}
            {impactAreas.length > 0 && (
              <div className="mb-3">
                <ImpactChips areas={impactAreas} />
              </div>
            )}

            {/* Source post card */}
            {sourcePostId ? (
              <Link
                href={`/posts/${sourcePostId}`}
                className="flex items-start gap-3 px-4 py-3 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50 transition-colors group mt-2"
              >
                <span className="text-base mt-0.5 shrink-0">🔗</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">출처 게시물</p>
                  {sourcePost ? (
                    <>
                      <p className="text-sm font-semibold text-zinc-800 group-hover:text-indigo-700 leading-snug line-clamp-2 transition-colors">
                        {sourcePost.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                          {TYPE_LABEL[sourcePost.type] ?? sourcePost.type}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          sourcePost.status === 'open' ? 'bg-emerald-50 text-emerald-600' :
                          sourcePost.status === 'in-progress' ? 'bg-amber-50 text-amber-600' :
                          'bg-zinc-100 text-zinc-400'
                        }`}>
                          {SOURCE_STATUS_LABEL[sourcePost.status] ?? sourcePost.status}
                        </span>
                        <span className="text-[10px] text-zinc-400">{sourcePost.author_display}</span>
                        <span className="text-[10px] text-zinc-400">💬 {sourcePost.comment_count}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-indigo-600 group-hover:underline">토론 게시물 보기</p>
                  )}
                </div>
                <svg className="w-4 h-4 text-indigo-300 shrink-0 mt-1 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : task.source ? (
              <p className="text-[11px] text-zinc-400 mt-2 px-1">출처: <span className="text-zinc-600">
                {task.source.startsWith('cron:') ? '자동 감지 (크론)' :
                 task.source.startsWith('manual:') ? '수동 등록' :
                 task.source.startsWith('board:') ? '이사회 토론' :
                 task.source}
              </span></p>
            ) : null}

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400 mt-3 pt-3 border-t border-zinc-100">
              <span>요청됨 {fmt(task.created_at)}</span>
              {task.approved_at  && <span className="text-teal-600">✓ 승인 {fmt(task.approved_at)}</span>}
              {task.started_at   && <span className="text-indigo-500">⚙ 시작 {fmt(task.started_at)}</span>}
              {task.completed_at && <span className="text-emerald-600">🎉 완료 {fmt(task.completed_at)}</span>}
              {task.rejected_at  && <span className="text-zinc-500">✕ 반려 {fmt(task.rejected_at)}</span>}
              {totalTime && <span className="ml-auto font-medium text-zinc-500">총 {totalTime} 소요</span>}
            </div>
          </div>
        </div>

        {/* ── Ghost task warning ── */}
        {isGhostTask && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 leading-relaxed">
              <span className="font-semibold">유령 태스크:</span> 완료 처리되었으나 변경된 파일이 없습니다. 실제 작업이 수행되지 않았을 수 있습니다.
            </p>
          </div>
        )}

        {/* ── Depends on (선행 태스크) ── */}
        {dependsOnIds.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">선행 태스크 ({dependsOnIds.length})</p>
            <div className="flex flex-wrap gap-2">
              {dependsOnIds.map(depId => (
                <Link
                  key={depId}
                  href={`/dev-tasks/${depId}`}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors font-medium"
                >
                  <span className="text-indigo-400">→</span>
                  <span className="font-mono">{depId.length > 16 ? depId.slice(0, 16) + '…' : depId}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Sibling tasks (같은 그룹) ── */}
        {task.group_id && siblingTasks.length > 1 && (
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setSiblingsExpanded(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-100"
            >
              {siblingsExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">같은 그룹 태스크</span>
              <span className="ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">{siblingTasks.length}</span>
            </button>
            {siblingsExpanded && (
              <div className="p-2 space-y-1">
                {siblingTasks.map(sibling => {
                  const isCurrent = sibling.id === task.id;
                  const pill = STATUS_PILL[sibling.status] ?? STATUS_PILL.awaiting_approval;
                  return isCurrent ? (
                    <div
                      key={sibling.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      <p className="flex-1 min-w-0 text-xs font-semibold text-indigo-800 leading-snug truncate">
                        {sibling.title}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 border border-indigo-200 font-semibold shrink-0 whitespace-nowrap">
                        현재
                      </span>
                    </div>
                  ) : (
                    <Link
                      key={sibling.id}
                      href={`/dev-tasks/${sibling.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:bg-zinc-50 hover:border-zinc-200 transition-all group"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-200 group-hover:bg-zinc-400 shrink-0 transition-colors" />
                      <p className="flex-1 min-w-0 text-xs font-medium text-zinc-700 leading-snug truncate group-hover:text-zinc-900">
                        {sibling.title}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${pill.className}`}>
                        {pill.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Pending card (미제출) ── */}
        {isPending && isOwner && (
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-zinc-50 px-5 py-4 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-lg shrink-0">📋</div>
                <div className="flex-1">
                  <h2 className="text-sm font-bold text-zinc-700">검토 요청 전</h2>
                  <p className="text-[11px] text-zinc-500 mt-0.5">검토를 요청하면 대표 승인 후 Jarvis가 코드 작업을 시작합니다</p>
                </div>
                <span className="text-[11px] text-zinc-400 font-medium shrink-0">{timeAgo(task.created_at)} 등록됨</span>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                <span className="text-zinc-400 text-sm shrink-0 mt-0.5">💭</span>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  이 태스크는 아직 검토 큐에 올라가지 않았습니다. 준비가 됐다면 검토 요청을 눌러주세요.
                </p>
              </div>
              {actionError && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                  ⚠️ {actionError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={!!actionLoading}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white text-zinc-400 border border-zinc-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 disabled:opacity-40 transition-colors"
                >
                  {actionLoading === 'delete' ? (
                    <><span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" /> 삭제 중...</>
                  ) : '🗑 삭제'}
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleRequestReview}
                  disabled={!!actionLoading}
                  className="inline-flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-xl bg-zinc-800 text-white hover:bg-zinc-900 disabled:opacity-40 transition-colors font-semibold"
                >
                  {actionLoading === 'request_review' ? (
                    <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중...</>
                  ) : '📋 검토 요청'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Approval card (awaiting_approval) ── */}
        {isAwaiting && (
          isOwner ? (
            <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 border-b border-amber-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-lg shrink-0">🔍</div>
                  <div className="flex-1">
                    <h2 className="text-sm font-bold text-amber-800">대표 검토 필요</h2>
                    <p className="text-[11px] text-amber-600 mt-0.5">승인하면 Jarvis가 즉시 코드 작업을 시작합니다</p>
                  </div>
                  <span className="text-[11px] text-amber-500 font-medium shrink-0">{timeAgo(task.created_at)} 요청됨</span>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Decision info grid — 항상 2칸 표시 */}
                <div className="grid grid-cols-2 gap-3">
                  {/* 예상 소요 — 없으면 "미정" */}
                  <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3">
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">예상 소요</p>
                    {editingMinutes ? (
                      <input
                        type="number"
                        min={1}
                        max={480}
                        value={minutesDraft}
                        onChange={e => setMinutesDraft(e.target.value)}
                        onBlur={handleSaveMinutes}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveMinutes(); if (e.key === 'Escape') setEditingMinutes(false); }}
                        className="text-xs w-full font-bold text-zinc-800 bg-white border border-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-300"
                        autoFocus
                      />
                    ) : (
                      <div
                        className={`group relative flex items-center gap-1 ${isOwner ? 'cursor-pointer hover:bg-zinc-100 rounded -mx-1 px-1' : ''}`}
                        onClick={isOwner ? () => { setMinutesDraft(String(task.estimated_minutes ?? '')); setEditingMinutes(true); } : undefined}
                        title={isOwner ? '클릭하여 수정' : undefined}
                      >
                        {task.estimated_minutes && task.estimated_minutes > 0 ? (
                          <p className="text-sm font-bold text-zinc-800">약 {task.estimated_minutes}분</p>
                        ) : (
                          <p className="text-sm font-bold text-zinc-400">{isOwner ? '미정 ✏' : '미정'}</p>
                        )}
                        {savedFlash === 'minutes' && (
                          <span className="absolute -top-5 left-0 text-[10px] text-emerald-600 font-semibold whitespace-nowrap bg-white border border-emerald-200 px-1.5 py-0.5 rounded shadow-sm">
                            저장됨
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 난이도 — 없으면 "분석 전" */}
                  <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">난이도</p>
                      <span className="text-[9px] px-1 py-px rounded bg-zinc-100 text-zinc-400 border border-zinc-200">AI 추정</span>
                    </div>
                    <div
                      className={`group relative ${isOwner ? 'cursor-pointer hover:bg-zinc-100 rounded -mx-1 px-1' : ''}`}
                      onClick={isOwner ? handleCycleDifficulty : undefined}
                      title={isOwner ? '클릭하여 순환 변경 (쉬움→보통→어려움→전문가)' : undefined}
                    >
                      <p className="text-sm font-bold text-zinc-800">
                        {task.difficulty ? DIFFICULTY_LABEL[task.difficulty] ?? task.difficulty : '분석 전'}
                        {isOwner && <span className="ml-1 opacity-0 group-hover:opacity-50 text-[11px] text-zinc-400">✏</span>}
                      </p>
                      {task.difficulty && DIFFICULTY_DESC[task.difficulty] && (
                        <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{DIFFICULTY_DESC[task.difficulty]}</p>
                      )}
                      {savedFlash === 'difficulty' && (
                        <span className="absolute -top-5 left-0 text-[10px] text-emerald-600 font-semibold whitespace-nowrap bg-white border border-emerald-200 px-1.5 py-0.5 rounded shadow-sm">
                          저장됨
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Impact areas */}
                {impactAreas.length > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">영향 범위</p>
                    <ImpactChips areas={impactAreas} />
                  </div>
                )}

                {/* Warning notice */}
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-amber-500 shrink-0 mt-0.5">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">이 작업은 실제 코드를 수정합니다.</p>
                    <p className="text-xs text-amber-600 mt-0.5">변경 내용을 꼼꼼히 확인한 뒤 결정해 주세요.</p>
                  </div>
                </div>

                {actionError && (
                  <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                    ⚠️ {actionError}
                  </div>
                )}

                {/* Action buttons — 우측 정렬, 컴팩트 */}
                {!showRejectForm ? (
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowRejectForm(true)}
                      disabled={!!actionLoading}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-zinc-50 text-zinc-500 border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-40 transition-all whitespace-nowrap"
                    >
                      ✕ 반려
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                    >
                      {actionLoading === 'approved' ? (
                        <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중...</>
                      ) : '✓ 승인하고 작업 시작'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">
                        반려 사유 <span className="text-zinc-400 font-normal">(선택)</span>
                      </label>
                      <textarea
                        value={rejectNote}
                        onChange={e => setRejectNote(e.target.value)}
                        placeholder="어떤 부분이 문제인지 작성하면 Jarvis가 참고합니다..."
                        className="w-full text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl p-3 resize-none outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 transition-all"
                        rows={3}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowRejectForm(false); setRejectNote(''); }}
                        className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={!!actionLoading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-all"
                      >
                        {actionLoading === 'rejected' ? (
                          <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중...</>
                        ) : '✕ 반려 확정'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-amber-100 rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-xl shrink-0">🔒</div>
                <div>
                  <p className="text-sm font-semibold text-zinc-700">대표님 검토 대기 중</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isGuest ? '게스트 모드 — 대표님 로그인 후 승인/반려 가능합니다.' : '대표님의 검토를 기다리고 있습니다.'}
                  </p>
                </div>
              </div>
              {/* Pipeline preview */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: '🔍', label: '대표 검토 중', sub: '지금', active: true, done: false },
                  { icon: '✅', label: '승인', sub: '승인 후 진행', active: false, done: false },
                  { icon: '⚙️', label: 'Jarvis 코드 작업', sub: '승인 후 자동 실행', active: false, done: false },
                ].map((step, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2.5 border text-center ${
                    step.active ? 'bg-amber-50 border-amber-200' : 'bg-zinc-50 border-zinc-100'
                  }`}>
                    <p className="text-base mb-1">{step.icon}</p>
                    <p className={`text-[11px] font-semibold ${step.active ? 'text-amber-700' : 'text-zinc-400'}`}>{step.label}</p>
                    <p className={`text-[10px] mt-0.5 ${step.active ? 'text-amber-600' : 'text-zinc-300'}`}>{step.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {/* ── Approved — cron countdown card ── */}
        {isApproved && (
          <div className="bg-white border border-teal-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 border border-teal-200 flex items-center justify-center text-lg shrink-0">✅</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-teal-800">승인 완료 — 실행 대기 중</p>
                  <p className="text-xs text-teal-600 mt-0.5">5분 내 큐에 등록되어 즉시 실행됩니다</p>
                </div>
                {/* Poller countdown */}
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-zinc-400 font-medium">큐 등록까지</p>
                  <p className="text-2xl font-black tabular-nums text-teal-700 leading-none">
                    {cronMin}:{String(cronSecDisplay).padStart(2, '0')}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full transition-none"
                  style={{ width: `${cronProgress}%` }}
                />
              </div>

              {/* Pipeline steps */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: '✅', label: '승인 완료', sub: '방금', done: true, active: false },
                  { icon: '📥', label: '큐 등록 중', sub: `약 ${cronMin}분 내`, done: false, active: true },
                  { icon: '⚙️', label: 'Jarvis 코드 작업', sub: '큐 등록 후 자동 실행', done: false, active: false },
                ].map((step, i) => (
                  <div key={i} className={`rounded-xl px-3 py-2.5 border text-center ${
                    step.done   ? 'bg-teal-50 border-teal-200' :
                    step.active ? 'bg-amber-50 border-amber-200 animate-pulse' :
                                  'bg-zinc-50 border-zinc-100'
                  }`}>
                    <p className="text-base mb-1">{step.icon}</p>
                    <p className={`text-[11px] font-semibold ${step.done ? 'text-teal-700' : step.active ? 'text-amber-700' : 'text-zinc-400'}`}>{step.label}</p>
                    <p className={`text-[10px] mt-0.5 ${step.done ? 'text-teal-500' : step.active ? 'text-amber-600' : 'text-zinc-300'}`}>{step.sub}</p>
                  </div>
                ))}
              </div>

              {/* Cancel approval */}
              {isOwner && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleCancelToReview}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                  >
                    {actionLoading === 'cancel' ? (
                      <><span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" /> 처리 중...</>
                    ) : '↩ 승인 취소하고 재검토'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── In-progress card ── */}
        {isLive && (
          <div className="bg-white border border-indigo-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4 border-b border-indigo-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-lg shrink-0 ${logs.length > 0 ? 'animate-pulse' : ''}`}>
                  {logs.length > 0 ? '⚙️' : '📥'}
                </div>
                <div className="flex-1">
                  {logs.length > 0 ? (
                    <>
                      <p className="text-sm font-bold text-indigo-800">Jarvis 작업 중</p>
                      <p className="text-xs text-indigo-600 mt-0.5 tabular-nums">
                        {runningElapsed > 0 ? `${formatElapsed(runningElapsed)} 경과` : '방금 시작됨'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-indigo-800">개발 큐 등록됨 — 실행 대기 중</p>
                      <p className="text-xs text-indigo-600 mt-0.5">Jarvis가 곧 코드 작업을 시작합니다</p>
                    </>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {logs.length > 0 && task.estimated_minutes ? (
                    <>
                      <p className="text-[10px] text-zinc-400">예상 완료</p>
                      <p className="text-xs font-semibold text-indigo-700">약 {task.estimated_minutes}분 후</p>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Queued (no logs yet) — show simple waiting state */}
            {logs.length === 0 && (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: '✅', label: '승인', done: true, active: false },
                    { icon: '📥', label: '큐 등록', done: true, active: false },
                    { icon: '⚙️', label: 'Jarvis 코드 작업', done: false, active: true },
                  ].map((step, i) => (
                    <div key={i} className={`rounded-xl px-3 py-2.5 border text-center ${
                      step.done   ? 'bg-teal-50 border-teal-200' :
                      step.active ? 'bg-indigo-50 border-indigo-200' :
                                    'bg-zinc-50 border-zinc-100'
                    }`}>
                      <p className="text-base mb-1">{step.icon}</p>
                      <p className={`text-[11px] font-semibold ${step.done ? 'text-teal-700' : step.active ? 'text-indigo-700' : 'text-zinc-400'}`}>{step.label}</p>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                  <p className="text-xs text-indigo-700">
                    <span className="font-semibold">로그가 보이지 않나요?</span>{' '}
                    실행 로그는 Jarvis가 실제 코드 작업을 시작할 때 채워집니다. 잠시 후 자동으로 업데이트됩니다.
                  </p>
                </div>
              </div>
            )}

            {logs.length > 0 && (
            <div className="p-5 space-y-4">
              {/* 4-phase stepper */}
              <div>
                <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-3">지금 Jarvis가 하는 일</p>
                <div className="flex items-center gap-1">
                  {phaseNames.map((name, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all duration-300 ${
                        i < currentPhase  ? 'bg-emerald-500 border-emerald-500 text-white' :
                        i === currentPhase ? 'bg-indigo-500 border-indigo-500 text-white animate-pulse' :
                                             'bg-white border-zinc-200 text-zinc-300'
                      }`}>
                        {i < currentPhase ? '✓' : phaseIcons[i]}
                      </div>
                      <p className={`text-[10px] text-center leading-tight ${
                        i < currentPhase  ? 'text-emerald-600 font-semibold' :
                        i === currentPhase ? 'text-indigo-700 font-bold' :
                                             'text-zinc-300'
                      }`}>{name}</p>
                      {/* Connector line */}
                      {i < phaseNames.length - 1 && (
                        <div className="absolute" /> // spacer handled by flex gap
                      )}
                    </div>
                  ))}
                </div>
                {/* Connecting lines between steps */}
                <div className="flex items-center mt-1 px-4">
                  {phaseNames.map((_, i) => i < phaseNames.length - 1 && (
                    <div key={i} className={`flex-1 h-0.5 mx-1 rounded-full transition-all duration-300 ${
                      i < currentPhase ? 'bg-emerald-400' : 'bg-zinc-100'
                    }`} />
                  ))}
                </div>
              </div>

              {/* Why it takes time */}
              <div className="px-4 py-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <p className="text-xs font-semibold text-indigo-700 mb-1">왜 시간이 걸리나요?</p>
                <ul className="text-xs text-indigo-600 space-y-1 list-disc list-inside">
                  <li>코드를 이해하고 안전하게 수정하는 데 시간이 필요합니다</li>
                  <li>수정 후 자동 테스트·검증을 실행합니다</li>
                  {task.estimated_minutes
                    ? <li>예상 완료: 약 {task.estimated_minutes}분 후</li>
                    : <li>잠시 후 완료될 예정입니다</li>}
                </ul>
              </div>

              {/* Last activity + stale warning */}
              {lastActivitySecs !== null && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs ${
                  isStale
                    ? 'bg-amber-50 border border-amber-200 text-amber-700'
                    : 'bg-zinc-50 border border-zinc-100 text-zinc-500'
                }`}>
                  <span>{isStale ? '⚠️' : '🕐'}</span>
                  <span>
                    {isStale
                      ? `2분 이상 응답 없음 — 잠시 대기해주세요`
                      : `마지막 활동: ${lastActivitySecs < 60 ? `${lastActivitySecs}초 전` : `${Math.floor(lastActivitySecs / 60)}분 전`}`}
                  </span>
                </div>
              )}

              {/* Owner: abort and return to review */}
              {isOwner && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleCancelToReview}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors"
                  >
                    {actionLoading === 'cancel' ? (
                      <><span className="w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" /> 처리 중...</>
                    ) : '⏹ 작업 중단하고 재검토'}
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* ── Failed card ── */}
        {isFailed && (
          <div className="bg-white border border-red-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-gradient-to-r from-red-50 to-rose-50 px-5 py-4 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-lg shrink-0">⚠️</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-800">Jarvis 작업 실패</p>
                  <p className="text-xs text-red-600 mt-0.5">코드 작업이 완료되지 못했습니다. 재시도하거나 내용을 수정해 다시 검토 요청하세요.</p>
                </div>
                {task.started_at && <span className="text-[11px] text-red-400 font-medium shrink-0">{timeAgo(task.started_at)} 시작됨</span>}
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {logs.length > 0 && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wider mb-1">마지막 로그</p>
                  <p className="text-xs text-red-700 leading-relaxed font-mono">
                    {logs[logs.length - 1].message.slice(0, 150)}{logs[logs.length - 1].message.length > 150 ? '…' : ''}
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                <span className="text-zinc-400 text-sm shrink-0 mt-0.5">💭</span>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  일시적인 오류일 수 있습니다. 재시도하면 대기 상태로 초기화되어 다시 검토 요청할 수 있습니다.
                </p>
              </div>
              {actionError && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                  ⚠️ {actionError}
                </div>
              )}
              {isOwner && !showRetryForm && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={handleRetry}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 disabled:opacity-40 transition-all"
                  >
                    {actionLoading === 'retry' ? (
                      <><span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /> 처리 중...</>
                    ) : '↺ 그대로 재시도'}
                  </button>
                  <button
                    onClick={() => setShowRetryForm(true)}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100 disabled:opacity-40 transition-all"
                  >
                    ✏ 수정 후 재요청
                  </button>
                </div>
              )}

              {isOwner && showRetryForm && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">
                      추가 지시사항 <span className="text-zinc-400 font-normal">(선택)</span>
                    </label>
                    <textarea
                      value={retryNote}
                      onChange={e => setRetryNote(e.target.value)}
                      placeholder="어떤 부분을 수정해서 다시 시도할지 작성해주세요..."
                      className="w-full text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl p-3 resize-none outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      rows={3}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowRetryForm(false); setRetryNote(''); }}
                      className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleRetryWithNote}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-all"
                    >
                      {actionLoading === 'retry-note' ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중...</>
                      ) : '↺ 재요청 확정'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Timeline ── */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-5">진행 타임라인</h2>
          {isPending && (
            <p className="text-xs text-zinc-400 mb-4 px-1">검토 요청 전 단계입니다. 아래 버튼으로 검토를 요청하면 타임라인이 시작됩니다.</p>
          )}
          <div className="relative pl-4">
            <div className="absolute left-[32px] top-5 bottom-5 w-0.5 bg-zinc-100" />

            {/* Step 1: 검토 요청 */}
            <TimelineStep
              icon="📋"
              label={isAwaiting ? '검토 요청됨 — 대표 검토 대기 중' : '검토 요청'}
              sublabel={isPending
                ? '아직 검토를 요청하지 않았습니다'
                : isAwaiting
                ? '승인하면 Jarvis가 즉시 코드 작업을 시작합니다'
                : isRejected
                ? '검토 요청 후 반려됨'
                : '검토 요청 완료'}
              time={!isPending ? task.created_at : undefined}
              done={!isPending && !isAwaiting}
              active={isAwaiting} pulse={isAwaiting}
            />

            {/* Step 2: 대표 승인 */}
            <TimelineStep
              icon="✓"
              label={isRejected ? '반려 — 작업 중단' : isApproved ? '승인됨 — 실행 대기 중' : '대표 승인'}
              sublabel={isRejected
                ? (task.rejection_note ? `사유: ${task.rejection_note.slice(0, 60)}` : '반려 사유 없음')
                : isApproved
                ? '5분 내 자동으로 개발 큐에 등록됩니다'
                : isDone || isLive || isFailed
                ? '승인 완료'
                : '승인 후 Jarvis 코드 작업이 시작됩니다'}
              time={(task.approved_at ?? task.rejected_at) ?? undefined}
              elapsedLabel={waitTime && (isDone || isLive || isFailed) ? `검토 소요 ${waitTime}` : null}
              done={!isRejected && !!task.approved_at && !isApproved}
              active={isApproved} rejected={isRejected}
            />

            {/* Step 3: Jarvis 작업 */}
            <TimelineStep
              icon="⚙"
              label={isLive
                ? 'Jarvis 작업 중 (현재 단계)'
                : isFailed
                ? 'Jarvis 작업 실패'
                : 'Jarvis 코드 작업'}
              sublabel={isLive
                ? `코드 분석 → 수정 → 검증 진행 중${runningElapsed > 0 ? ` (${formatElapsed(runningElapsed)} 경과)` : ''}`
                : isDone
                ? `${changedFiles.length > 0 ? `파일 ${changedFiles.length}개 수정됨` : '코드 수정 완료'}`
                : isFailed
                ? '작업 중 오류 발생 — 재시도 가능'
                : '승인 후 Jarvis가 자동으로 코드를 수정합니다'}
              time={task.started_at ?? undefined}
              done={isDone} active={isLive} pulse={isLive} failed={isFailed} rejected={isRejected}
            />

            {/* Step 4: 완료 */}
            <TimelineStep
              icon="🎉"
              label={isDone ? '완료' : isRejected ? '완료되지 않음' : isFailed ? '미완료' : '완료'}
              sublabel={isDone
                ? `수정된 파일 ${changedFiles.length > 0 ? `${changedFiles.length}개` : '확인 필요'} — 결과 기록 저장됨`
                : isRejected
                ? '반려로 인해 작업이 진행되지 않았습니다'
                : isFailed
                ? '작업 실패로 미완료 — 재시도하면 다시 시작됩니다'
                : '코드 작업 완료 시 자동으로 기록됩니다'}
              time={task.completed_at ?? undefined}
              elapsedLabel={workTime ? `작업 소요 ${workTime}` : null}
              done={isDone} active={false} failed={isFailed} rejected={isRejected}
            />
          </div>
        </div>

        {/* ── Attempt history ── */}
        {attemptHistory.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
            <button
              onClick={() => setHistoryExpanded(v => !v)}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-600 transition-colors w-full text-left"
            >
              <span className={`transition-transform duration-200 ${historyExpanded ? 'rotate-90' : ''}`}>▶</span>
              이전 시도 기록 ({attemptHistory.length}회)
            </button>
            {historyExpanded && (
              <div className="mt-3 space-y-2">
                {attemptHistory.map((entry) => (
                  <div key={entry.attempt} className="text-xs border border-zinc-100 rounded-lg p-3 bg-zinc-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-zinc-600">#{entry.attempt}회 시도</span>
                      <span className="text-zinc-400 tabular-nums">{fmt(entry.timestamp)}</span>
                    </div>
                    <div className="text-zinc-500 space-y-0.5">
                      <p>이전 상태: <span className="font-medium text-zinc-700">{entry.previous_status}</span> · 로그 {entry.log_count}건</p>
                      {entry.rejection_note && <p className="text-red-500">반려 사유: {entry.rejection_note}</p>}
                      {entry.result_summary && <p className="text-emerald-600">결과: {entry.result_summary.slice(0, 80)}{entry.result_summary.length > 80 ? '…' : ''}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Execution log ── */}
        {(logs.length > 0 || isLive) && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-sm">
            {/* Log header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700/80">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">실행 로그</span>
                {isLive && (
                  <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                )}
                {completedSteps.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 font-medium">
                    {completedSteps.length}단계 완료
                  </span>
                )}
                {isLive && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 font-medium">
                    {phaseIcons[currentPhase]} {phaseNames[currentPhase]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {lastActivitySecs !== null && (
                  <span className={`text-[10px] tabular-nums ${isStale ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {lastActivitySecs < 60 ? `${lastActivitySecs}s 전 활동` : `${Math.floor(lastActivitySecs / 60)}m 전 활동`}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 tabular-nums">{logs.length}개</span>
                {logs.length > 5 && (
                  <button
                    onClick={() => setLogExpanded(v => !v)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 underline transition-colors"
                  >
                    {logExpanded ? '접기' : `전체 보기 (${logs.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* Step progress strip — shows each completed ✅ step with label + duration */}
            {completedSteps.length > 0 && (
              <div className="px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-950/40">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {completedSteps.map((step, i) => {
                    const dur = step.durationSecs < 60
                      ? `${step.durationSecs}s`
                      : `${Math.floor(step.durationSecs / 60)}m ${String(step.durationSecs % 60).padStart(2, '0')}s`;
                    return (
                      <div key={i} className="flex items-center gap-1 shrink-0">
                        <div
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-800/40"
                          title={`단계 ${step.stepNum}: ${step.label} (${dur})`}
                        >
                          <span className="w-4 h-4 rounded-full bg-emerald-800/50 border border-emerald-700/50 flex items-center justify-center text-[9px] font-bold text-emerald-400 shrink-0">
                            {step.stepNum}
                          </span>
                          <span className="text-[10px] text-emerald-300 max-w-[88px] truncate leading-none">{step.label}</span>
                          <span className="text-[9px] text-emerald-700 leading-none tabular-nums">{dur}</span>
                        </div>
                        {(i < completedSteps.length - 1 || isLive) && (
                          <span className="text-zinc-700 text-xs shrink-0 mx-0.5">›</span>
                        )}
                      </div>
                    );
                  })}
                  {isLive && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700/40 bg-zinc-800/20 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse shrink-0" />
                      <span className="text-[10px] text-zinc-500">진행 중</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Log entries — tail -f style */}
            <div className="p-4 font-mono text-xs max-h-[480px] overflow-y-auto space-y-0.5">
              {logs.length === 0 ? (
                <p className="text-zinc-600 italic">로그 대기 중...</p>
              ) : (() => {
                  const rawLogs = logExpanded ? logs : logs.slice(-8);
                  const collapsedLogs: Array<LogEntry & { _isHeartbeat?: boolean; _collapsedCount?: number; _stepNum?: number }> = [];
                  let pendingHeartbeat: (LogEntry & { _isHeartbeat?: boolean; _collapsedCount?: number }) | null = null;
                  let heartbeatCount = 0;
                  // Track which step number ✅ entries in the visible window correspond to
                  let visibleStepIdx = logExpanded ? 0 : logs.slice(0, logs.length - 8).filter(e => /^✅/.test(e.message)).length;

                  for (const entry of rawLogs) {
                    if (HEARTBEAT_RE.test(entry.message)) {
                      pendingHeartbeat = { ...entry, _isHeartbeat: true };
                      heartbeatCount++;
                    } else {
                      if (pendingHeartbeat) {
                        collapsedLogs.push({ ...pendingHeartbeat, _collapsedCount: heartbeatCount });
                        pendingHeartbeat = null;
                        heartbeatCount = 0;
                      }
                      const enriched: LogEntry & { _stepNum?: number } = { ...entry };
                      if (/^✅/.test(entry.message)) {
                        enriched._stepNum = ++visibleStepIdx;
                      }
                      collapsedLogs.push(enriched);
                    }
                  }
                  if (pendingHeartbeat) collapsedLogs.push({ ...pendingHeartbeat, _collapsedCount: heartbeatCount });

                  return collapsedLogs.map((entry, i) => {
                    const msg = entry.message.replace(/\s*\([^)]*\d{2}:\d{2}:\d{2}[^)]*\)\s*$/, '').trim();
                    const isHeartbeat = !!entry._isHeartbeat;
                    const isErr      = /error|fail|failed/i.test(msg);
                    const isWarn     = /warn|warning/i.test(msg);
                    const isStart    = /^⚙️/.test(msg);
                    const isCheckmark = /^✅/.test(msg);
                    const isFinalDone = isCheckmark && isDone;
                    const isSubDone   = isCheckmark && !isDone;
                    const isProgress  = /^⏳/.test(msg) || isHeartbeat;
                    const isToolCall = /^(📖|📝|✏️|💻|🔍|📁|🤖|🔗|🌐|🔧)\s/.test(msg);
                    const isText     = /^💬/.test(msg);

                    const color = isErr       ? 'text-red-400' :
                                  isWarn      ? 'text-amber-400' :
                                  isFinalDone ? 'text-emerald-400' :
                                  isSubDone   ? 'text-emerald-500' :
                                  isStart     ? 'text-sky-400' :
                                  isProgress  ? 'text-zinc-500' :
                                  isToolCall  ? 'text-cyan-300' :
                                  isText      ? 'text-violet-300' :
                                                'text-zinc-300';

                    const isEvent = isStart || isFinalDone;
                    const stepNum = entry._stepNum;
                    const matchingStep = stepNum ? completedSteps.find(s => s.stepNum === stepNum) : null;
                    const durStr = matchingStep
                      ? (matchingStep.durationSecs < 60
                          ? `${matchingStep.durationSecs}s`
                          : `${Math.floor(matchingStep.durationSecs / 60)}m ${String(matchingStep.durationSecs % 60).padStart(2, '0')}s`)
                      : null;

                    return (
                      <div
                        key={i}
                        className={[
                          'flex gap-3 leading-relaxed',
                          isToolCall ? 'bg-zinc-800/50 rounded px-2 py-1 -mx-2' : '',
                          isEvent    ? 'border-t border-zinc-800 pt-1.5 mt-1'   : '',
                          isSubDone  ? 'border-t border-zinc-800/50 pt-1.5 mt-1' : '',
                          isProgress ? 'opacity-50' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <span className="text-zinc-600 shrink-0 tabular-nums w-[52px]">
                          {new Date(entry.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </span>
                        <span className={`${color} break-all flex-1 min-w-0`}>
                          {isSubDone ? (
                            <span className="flex items-center gap-2 flex-wrap">
                              <span>✅ 단계 {stepNum} 완료</span>
                              {matchingStep && !matchingStep.label.startsWith('단계 ') && (
                                <span className="text-[10px] text-emerald-800/90 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-900/50 max-w-[160px] truncate">
                                  {matchingStep.label}
                                </span>
                              )}
                              {durStr && (
                                <span className="text-[10px] text-zinc-600 tabular-nums">{durStr}</span>
                              )}
                            </span>
                          ) : (
                            <>
                              {msg}
                              {isHeartbeat && entry._collapsedCount && entry._collapsedCount > 1
                                ? <span className="text-zinc-700 ml-1.5 text-[10px]">×{entry._collapsedCount}</span>
                                : null}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  });
                })()
              }
              {isLive && (
                <div className="flex gap-3 mt-2 border-t border-zinc-800 pt-2">
                  <span className="text-zinc-700 w-[52px] shrink-0">···</span>
                  <span className="text-indigo-400 animate-pulse">실행 중</span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* ── Done — Result card ── */}
        {isDone && (
          <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Green completion banner */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4 border-b border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-xl shrink-0">🎉</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-800">Jarvis 작업 완료</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {task.started_at && task.completed_at ? `${elapsed(task.started_at, task.completed_at)} 소요` : fmt(task.completed_at ?? undefined)}
                  </p>
                </div>
                {/* Link back to source post */}
                {sourcePostId && (
                  <Link href={`/posts/${sourcePostId}`} className="text-xs text-emerald-600 hover:text-emerald-800 underline shrink-0">
                    출처 토론 보기 →
                  </Link>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Result summary */}
              {task.result_summary && (
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">실행 결과</p>
                  <div className="text-sm text-zinc-700 leading-relaxed bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                    <MarkdownContent content={task.result_summary} />
                  </div>
                </div>
              )}

              {/* Quality Review */}
              {task.review && (() => {
                const rv = (() => { try { return JSON.parse(task.review); } catch { return null; } })();
                if (!rv) return null;
                const scoreBg = rv.score >= 4 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : rv.score >= 3 ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-red-100 text-red-800 border-red-200';
                const riskBg = rv.risk === 'high' ? 'bg-red-500' : rv.risk === 'medium' ? 'bg-amber-500' : rv.risk === 'low' ? 'bg-blue-500' : 'bg-zinc-300';
                return (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider">품질 리뷰</p>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${scoreBg}`}>
                          {rv.score}/5
                        </span>
                        <span className={`w-2 h-2 rounded-full ${riskBg}`} title={`Risk: ${rv.risk}`} />
                      </div>
                    </div>
                    {rv.summary && <p className="text-sm text-zinc-700">{rv.summary}</p>}
                    {rv.positives?.length > 0 && (
                      <div className="space-y-1">
                        {rv.positives.map((p: string, i: number) => (
                          <p key={i} className="text-xs text-emerald-700 flex items-start gap-1">
                            <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />{p}
                          </p>
                        ))}
                      </div>
                    )}
                    {rv.issues?.length > 0 && (
                      <div className="space-y-1">
                        {rv.issues.map((issue: string, i: number) => (
                          <p key={i} className="text-xs text-red-700 flex items-start gap-1">
                            <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />{issue}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Changed files */}
              {changedFiles.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">수정된 파일 ({changedFiles.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {changedFiles.map((f, i) => {
                      const ghUrl = toGitHubUrl(f);
                      return (
                        <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-600 font-mono">
                          {f.split('/').pop() || f}
                          {ghUrl && (
                            <a
                              href={ghUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-400 hover:text-indigo-500 transition-colors"
                              title={`GitHub에서 보기: ${f}`}
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actual impact */}
              {task.actual_impact && (
                <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">실제 효과</p>
                  <p className="text-sm text-emerald-800">{task.actual_impact}</p>
                </div>
              )}

              {/* Impact area chips */}
              {impactAreas.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">영향 범위</p>
                  <ImpactChips areas={impactAreas} />
                </div>
              )}

              {/* AI impact analysis */}
              <div className="pt-1 border-t border-zinc-100">
                {!impactAnalysis ? (
                  <button
                    onClick={handleAnalyzeImpact}
                    disabled={loadingImpact}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-50 transition-all"
                  >
                    {loadingImpact ? (
                      <><span className="w-3.5 h-3.5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" /> 분석 중...</>
                    ) : (
                      <>✨ AI 임팩트 분석{task.actual_impact ? ' (다시 분석)' : ''}</>
                    )}
                  </button>
                ) : (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                          {impactAnalysis?.cached ? '이전 분석 결과' : 'AI 임팩트 분석 결과'}
                        </p>
                        {impactAnalysis?.impact_analyzed_at && (
                          <p className="text-[10px] text-indigo-400 mt-0.5">
                            {fmt(impactAnalysis.impact_analyzed_at)} 분석
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleAnalyzeImpact}
                        disabled={loadingImpact}
                        className="text-[10px] text-indigo-400 hover:text-indigo-600 underline transition-colors"
                      >
                        다시 분석
                      </button>
                    </div>
                    {impactAnalysis.improvement_score !== undefined && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-zinc-500">개선도</p>
                        <StarRating score={impactAnalysis.improvement_score} />
                        <p className="text-xs font-semibold text-zinc-700">{impactAnalysis.improvement_score}/5</p>
                      </div>
                    )}
                    {impactAnalysis.user_visible && (
                      <div>
                        <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">사용자 체감 변화</p>
                        <p className="text-sm text-zinc-700 leading-relaxed">{impactAnalysis.user_visible}</p>
                      </div>
                    )}
                    {impactAnalysis.risk_reduced && (
                      <div>
                        <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">리스크 감소</p>
                        <p className="text-sm text-zinc-700 leading-relaxed">{impactAnalysis.risk_reduced}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Owner: create follow-up task */}
              {isOwner && (
                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">후속 작업</p>
                  <FollowUpTaskForm taskId={task.id} taskTitle={task.title} sourceId={sourcePostId} boardUrl={task.source} />
                </div>
              )}

              {/* Owner: retry completed task */}
              {isOwner && (
                <div className="pt-2 border-t border-zinc-100 flex justify-end">
                  <button
                    onClick={handleRetry}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                  >
                    {actionLoading === 'retry' ? (
                      <><span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" /> 처리 중...</>
                    ) : '↺ 이 작업 재시도'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Rejected card ── */}
        {isRejected && (
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 bg-zinc-50 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-lg shrink-0">✕</div>
                <div>
                  <p className="text-sm font-bold text-zinc-700">이 작업은 반려되었습니다</p>
                  {task.rejected_at && (
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {fmt(task.rejected_at)} 반려됨{waitTime ? ` · 대기 ${waitTime}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {task.rejection_note ? (
                <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">반려 사유</p>
                  <p className="text-sm text-zinc-600 leading-relaxed">{task.rejection_note}</p>
                </div>
              ) : (
                <p className="text-sm text-zinc-400">반려 사유가 기재되지 않았습니다.</p>
              )}

              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                <span className="text-zinc-400 text-sm shrink-0 mt-0.5">💭</span>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  이 작업은 Jarvis 작업 큐에서 제외되었습니다. 내용을 수정해 다시 요청하면 더 잘 반영될 수 있습니다.
                </p>
              </div>

              {actionError && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                  ⚠️ {actionError}
                </div>
              )}

              {isOwner && !showRetryForm && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
                  >
                    ← 뒤로 가기
                  </button>
                  <button
                    onClick={handleRetry}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 disabled:opacity-40 transition-all"
                  >
                    {actionLoading === 'retry' ? (
                      <><span className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /> 처리 중...</>
                    ) : '↺ 그대로 재시도'}
                  </button>
                  <button
                    onClick={() => setShowRetryForm(true)}
                    disabled={!!actionLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100 disabled:opacity-40 transition-all"
                  >
                    ✏ 수정 후 재요청
                  </button>
                </div>
              )}

              {!isOwner && (
                <button
                  onClick={() => router.back()}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
                >
                  ← 뒤로 가기
                </button>
              )}

              {isOwner && showRetryForm && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">
                      추가 지시사항 <span className="text-zinc-400 font-normal">(선택)</span>
                    </label>
                    <textarea
                      value={retryNote}
                      onChange={e => setRetryNote(e.target.value)}
                      placeholder="어떤 부분을 수정해서 다시 시도할지 작성해주세요..."
                      className="w-full text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl p-3 resize-none outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      rows={3}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowRetryForm(false); setRetryNote(''); }}
                      className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleRetryWithNote}
                      disabled={!!actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-all"
                    >
                      {actionLoading === 'retry-note' ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 처리 중...</>
                      ) : '↺ 재요청 확정'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
