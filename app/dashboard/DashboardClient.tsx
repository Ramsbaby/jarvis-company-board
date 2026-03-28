'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useEvent } from '@/contexts/EventContext';
import { RefreshCw } from 'lucide-react';
import { Drawer, type DrawerSpec } from './Drawer';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardData {
  ts: string;
  system: {
    discord_bot?: string;
    memory_mb?: number;
    crash_count?: number;
    stale_claude_killed?: number;
    last_check?: string;
  };
  cron: {
    todaySuccess: number;
    todayFail: number;
    todayTotal: number;
    successRate: number;
    recentFailures: string[];
    trend: Array<{ date: string; ok: number; fail: number }>;
  };
  claude: {
    todayCalls: number;
    lastHourCalls: number;
    totalTracked: number;
    hourly: number[];
  };
  tasks: {
    total: number; awaiting: number; approved: number; active: number;
    done: number; failed: number; rejected: number; groups: number;
  };
  board: {
    totalPosts: number; openPosts: number; resolvedPosts: number;
    totalComments: number; recentDays: Array<{ date: string; posts: number; comments: number }>;
  };
  agents: {
    top5: Array<{ agent_id: string; score: number; events: number }>;
    tierChanges: Array<{ agent_id: string; from_tier: string; to_tier: string; reason: string | null; created_at: string }>;
  };
  e2e: { passed: number; total: number; rate: number; lastRun: string; failures: string[] };
  teams: Array<{ name: string; merit: number; penalty: number; status: string }>;
  autonomy: { autonomy_rate?: string; total_decisions?: number; executed?: number; by_team?: Record<string, { total?: number; executed?: number }> };
  errors: { total24h: number; totalAll: number; topErrors: Array<{ msg: string; count: number }> };
  healthSummary: {
    overall: 'green' | 'yellow' | 'red';
    botLevel: 'green' | 'yellow' | 'red';
    cronLevel: 'green' | 'yellow' | 'red';
    e2eLevel: 'green' | 'yellow' | 'red';
    errorLevel: 'green' | 'yellow' | 'red';
    issues: Array<{ severity: 'warning' | 'critical'; message: string }>;
  };
  attention: {
    awaitingApproval: Array<{ id: string; title: string; priority: string; created_at?: string; expected_impact?: string | null }>;
    needsOwnerInput: Array<{ id: string; title: string; type: string; created_at?: string; comment_count?: number }>;
    closingSoon: Array<{ id: string; title: string; type: string; remaining_minutes: number }>;
  };
  todaySummary: {
    newPosts: number; resolvedPosts: number; completedTasks: number; aiComments: number;
    weekChange: number; weekTrend: Array<{ date: string; posts: number; comments: number }>;
  };
  teamOverview: {
    mvp: { agent_id: string; score: number; events: number } | null;
    autonomyRate?: number;
    totalDecisions?: number;
    executed?: number;
    teams: Array<{ name: string; merit: number; penalty: number; status: string }>;
  };
  sysMetrics?: {
    synced_at?: string;
    disk?: { used_pct: number; free_gb: number; total_gb: number };
    health?: { discord_bot?: string; memory_mb?: number; crash_count?: number; last_check?: string };
    discord_stats?: {
      claudeCount?: number;
      totalHuman?: number;
      avgElapsed?: number;
      restartCount?: number;
      botErrors?: number;
      lastHealth?: { silenceSec?: number; memMB?: number; wsPing?: number; uptimeSec?: number };
      channelActivity?: Array<{ id: string; name: string; human: number; bot?: number; claudes: number }>;
    };
    rag_stats?: { dbSize?: string; stuck?: boolean; inboxCount?: number; chunks?: number };
    launch_agents?: Array<{ name: string; pid: string | null; exitCode: number | null; loaded: boolean }>;
    circuit_breakers?: Array<{ name?: string; state?: string; last_fail_ts?: number; failCount?: number }>;
    cron_stats?: {
      rate?: number;
      recentFailed?: Array<{ task: string; lastRun: string; failCount: number; lastStatus?: string }>;
      taskStatus?: Record<string, { lastRun: string; lastStatus: string; failCount: number }>;
    };
    decisions_today?: Array<{ ts?: string; decision?: string; team?: string; action?: string; status?: string; result?: string }>;
    dev_queue?: Array<{ id?: string; name: string; priority?: number; status: string; assignee?: string; createdAt?: string }>;
    scorecard?: { teams?: Record<string, { merit: number; penalty: number; status: string }> };
    dev_daemon?: { alive?: boolean; pid?: number; last_poll?: string; current_task?: string; status?: string };
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CH_NAME: Record<string, string> = {
  '1468386844621144065': 'jarvis',
  '1469905074661757049': 'jarvis-dev',
  '1471694919339868190': 'jarvis-blog',
  '1469190688083280065': 'jarvis-system',
  '1469190686145384513': 'jarvis-market',
  '1470559565258162312': 'jarvis-lite',
  '1474650972310605886': 'jarvis-news-webhook',
  '1475786634510467186': 'jarvis-ceo',
  '1469999923633328279': 'jarvis-family',
  '1470011814803935274': 'jarvis-preply-tutor',
  '1484008782853050483': 'workgroup-board',
  '1472965899790061680': 'jarvis-boram',
};

const LA_SHORT: Record<string, string> = {
  'ai.jarvis.discord-bot': '봇',
  'ai.jarvis.watchdog': '감시',
  'ai.jarvis.dashboard-tunnel': '터널',
  'ai.jarvis.dashboard': '대시보드',
  'ai.jarvis.rag-watcher': 'RAG',
  'ai.jarvis.webhook-listener': '훅',
  'ai.jarvis.event-watcher': '이벤트',
  'ai.jarvis.sync-system-metrics': '메트릭',
  'ai.jarvis.orchestrator': '오케스트라',
};

const TEAM_LABEL: Record<string, string> = {
  infra: '인프라', council: '이사회', record: '기록', career: '커리어',
  brand: '브랜드', academy: '아카데미', strategy: '전략',
};

const TEAM_COLOR: Record<string, string> = {
  infra: 'bg-blue-100 text-blue-700', council: 'bg-purple-100 text-purple-700',
  record: 'bg-zinc-100 text-zinc-600', career: 'bg-amber-100 text-amber-700',
  brand: 'bg-pink-100 text-pink-700', academy: 'bg-emerald-100 text-emerald-700',
  strategy: 'bg-indigo-100 text-indigo-700',
};

const PRIORITY_LABEL: Record<string, string> = { urgent: '긴급', high: '높음', medium: '중간', low: '낮음' };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high:   'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low:    'bg-zinc-100 text-zinc-500 border-zinc-200',
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-zinc-200 rounded-xl p-3 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
      {children}
    </span>
  );
}

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">{children}</h2>
      {action}
    </div>
  );
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z');
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function timeAgoShort(iso: string | undefined): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function silenceLabel(sec: number): string {
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return `${Math.floor(sec / 3600)}시간 전`;
}

// ── 섹션 1: 전체 상태 ──────────────────────────────────────────────────────────

function HealthPanel({ data, sm }: { data: DashboardData['healthSummary']; sm?: DashboardData['sysMetrics'] }) {
  const levelColor = (level: 'green' | 'yellow' | 'red') =>
    level === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    level === 'yellow' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-red-50 text-red-700 border-red-200';
  const levelDot = (level: 'green' | 'yellow' | 'red') =>
    level === 'green' ? 'bg-emerald-500' : level === 'yellow' ? 'bg-amber-500' : 'bg-red-500';

  const pills = [
    { label: '봇', level: data.botLevel },
    { label: '자동화', level: data.cronLevel },
    { label: '인프라', level: data.e2eLevel },
    { label: '오류', level: data.errorLevel },
  ];

  const overallBg = data.overall === 'green' ? 'bg-emerald-50 border-emerald-100'
    : data.overall === 'yellow' ? 'bg-amber-50 border-amber-100'
    : 'bg-red-50 border-red-100';

  // sysMetrics
  const diskPct = sm?.disk?.used_pct ?? 0;
  const diskFree = sm?.disk?.free_gb?.toFixed(0) ?? '?';
  const memMb = sm?.health?.memory_mb ?? sm?.discord_stats?.lastHealth?.memMB ?? 0;
  const silenceSec = sm?.discord_stats?.lastHealth?.silenceSec ?? 0;
  const ragStuck = sm?.rag_stats?.stuck ?? false;
  const ragSize = sm?.rag_stats?.dbSize ?? '';
  const launchAgents = sm?.launch_agents ?? [];
  const syncedAt = sm?.synced_at;

  // LA 상태: pid 있고 exitCode가 0 또는 -15(SIGTERM, bot용 정상) → 정상
  // exitCode 127 = bad (명령 못 찾음)
  const isLaOk = (a: { pid: string | null; exitCode: number | null; loaded: boolean }) =>
    a.loaded && (a.exitCode === 0 || a.exitCode === -15 || a.exitCode === null) && a.pid !== null;

  return (
    <div className={`rounded-xl border p-3 mb-4 ${overallBg}`}>
      {/* Row 1: 상태 알약 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">상태</span>
        {pills.map(p => (
          <span key={p.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${levelColor(p.level)}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${levelDot(p.level)}`} />
            {p.label} {p.level === 'green' ? '✓' : p.level === 'yellow' ? '!' : '✗'}
          </span>
        ))}
        {syncedAt && (
          <span className="ml-auto text-[10px] text-zinc-400">
            {formatTime(syncedAt)} 동기화
          </span>
        )}
      </div>

      {/* Row 2: 리소스 미니 */}
      {sm && (
        <div className="mt-2 pt-2 border-t border-black/5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span className="text-zinc-600">
            💾 디스크 <span className={diskPct >= 80 ? 'text-amber-600 font-semibold' : 'text-zinc-500'}>{diskPct}%</span>
            <span className="text-zinc-400"> ({diskFree}GB 여유)</span>
          </span>
          {memMb > 0 && <span className="text-zinc-600">🧠 메모리 <span className="text-zinc-500">{memMb}MB</span></span>}
          <span className="text-zinc-600">
            🤖 봇 마지막 활동{' '}
            <span className={silenceSec > 600 ? 'text-amber-600 font-semibold' : 'text-zinc-500'}>
              {silenceLabel(silenceSec)}
            </span>
          </span>
          <span className={`${ragStuck ? 'text-amber-600 font-semibold' : 'text-zinc-600'}`}>
            📚 RAG {ragStuck ? '⚠ 점검필요' : '정상'}{ragSize ? ` ${ragSize}` : ''}
          </span>
        </div>
      )}

      {/* Row 3: 서비스 칩 */}
      {launchAgents.length > 0 && (
        <div className="mt-2 pt-2 border-t border-black/5 flex flex-wrap gap-1.5">
          <span className="text-[10px] text-zinc-400 self-center mr-1">서비스</span>
          {launchAgents.map(a => {
            const ok = isLaOk(a);
            const name = LA_SHORT[a.name] ?? a.name.split('.').pop() ?? a.name;
            const broken = a.exitCode === 127;
            return (
              <span key={a.name} title={`${a.name} (exit: ${a.exitCode})`}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  broken ? 'bg-red-100 text-red-700' : ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                {name}{ok ? '✓' : broken ? '✗' : '!'}
              </span>
            );
          })}
        </div>
      )}

      {/* Row 4: 이슈 */}
      {data.issues.length > 0 && (
        <div className="mt-2 pt-2 border-t border-black/5 space-y-0.5">
          {data.issues.map((issue, i) => (
            <div key={i} className={`text-xs flex items-center gap-1.5 ${issue.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
              <span>{issue.severity === 'critical' ? '🔴' : '🟡'}</span>
              {issue.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 섹션 2: 내 할 일 ──────────────────────────────────────────────────────────

function ApprovalCard({ items, taskCount, onOpen }: { items: DashboardData['attention']['awaitingApproval']; taskCount: number; onOpen?: (spec: DrawerSpec) => void }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">✅</span>
        <Label>승인 대기</Label>
        <span className="ml-auto bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
          {taskCount}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-emerald-600 font-medium">모두 처리 완료 ✓</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map(task => (
            <div
              key={task.id}
              className="block group cursor-pointer"
              onClick={() => onOpen?.({
                type: 'task',
                title: task.title,
                subtitle: `우선순위: ${task.priority}`,
                data: {
                  id: task.id,
                  title: task.title,
                  priority: task.priority,
                  status: 'awaiting_approval',
                  detail: undefined,
                  expected_impact: task.expected_impact,
                  created_at: task.created_at,
                },
              })}
            >
              <div className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-zinc-50 transition-colors">
                <span className={`mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.low}`}>
                  {PRIORITY_LABEL[task.priority] ?? task.priority}
                </span>
                <span className="text-xs text-zinc-700 group-hover:text-indigo-600 transition-colors leading-tight line-clamp-2">{task.title}</span>
              </div>
            </div>
          ))}
          <Link href="/dev-tasks" className="block text-[11px] text-indigo-500 hover:text-indigo-700 mt-1 pl-1">
            전체 보기 ({taskCount}건) →
          </Link>
        </div>
      )}
    </Card>
  );
}

function OwnerInputCard({ items, onOpen }: { items: DashboardData['attention']['needsOwnerInput']; onOpen?: (spec: DrawerSpec) => void }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">💬</span>
        <Label>의견 필요</Label>
        {items.length > 0 && (
          <span className="ml-auto bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-emerald-600 font-medium">모든 토론 참여 완료 ✓</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map(post => (
            <div
              key={post.id}
              className="block group cursor-pointer"
              onClick={() => onOpen?.({
                type: 'post',
                title: post.title,
                subtitle: `댓글 ${post.comment_count ?? 0}개`,
                data: {
                  id: post.id,
                  title: post.title,
                  type: post.type,
                  status: 'open',
                  created_at: post.created_at,
                  comment_count: post.comment_count,
                },
              })}
            >
              <div className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-zinc-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-700 group-hover:text-indigo-600 transition-colors leading-tight line-clamp-2">{post.title}</p>
                  {post.comment_count !== undefined && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">댓글 {post.comment_count}개{post.created_at ? ` · ${timeAgoShort(post.created_at)}` : ''}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ClosingSoonCard({ items, onOpen }: { items: DashboardData['attention']['closingSoon']; onOpen?: (spec: DrawerSpec) => void }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">⏰</span>
        <Label>마감 임박</Label>
        {items.length > 0 && (
          <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-emerald-600 font-medium">임박한 마감 없음 ✓</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 5).map(post => (
            <div
              key={post.id}
              className="block group cursor-pointer"
              onClick={() => onOpen?.({
                type: 'post',
                title: post.title,
                subtitle: `${post.remaining_minutes}분 남음`,
                data: {
                  id: post.id,
                  title: post.title,
                  type: post.type,
                  status: 'open',
                  remaining_minutes: post.remaining_minutes,
                },
              })}
            >
              <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-zinc-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-700 group-hover:text-indigo-600 transition-colors line-clamp-1">{post.title}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${post.remaining_minutes <= 30 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {post.remaining_minutes}분
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── 섹션 3: Jarvis 오늘 활동 ──────────────────────────────────────────────────

function TodayActivityCard({ sm, today, onOpen }: { sm?: DashboardData['sysMetrics']; today: DashboardData['todaySummary']; onOpen?: (spec: DrawerSpec) => void }) {
  const ds = sm?.discord_stats;
  const cs = sm?.cron_stats;

  const botCalls = ds?.claudeCount ?? 0;
  const humanMsgs = ds?.totalHuman ?? 0;
  const avgElapsed = ds?.avgElapsed ?? 0;
  const restarts = ds?.restartCount ?? 0;

  const cronRate = cs?.rate ?? 100;
  const taskStatus = cs?.taskStatus ?? {};
  const totalCronTasks = Object.keys(taskStatus).length;
  const failedCronTasks = cs?.recentFailed ?? [];

  const decisions = sm?.decisions_today ?? [];
  const decisionCount = decisions.length;

  const failNames = failedCronTasks.map(f => f.task).join(', ');

  // Top active channels
  const channels = (ds?.channelActivity ?? [])
    .sort((a, b) => (b.human ?? 0) - (a.human ?? 0))
    .slice(0, 3);

  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span>📈</span>
        <Label>오늘 Jarvis 활동</Label>
        <span className="text-[10px] text-zinc-400">
          {new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
        </span>
        <button
          className="ml-auto text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
          onClick={() => onOpen?.({
            type: 'bot',
            title: 'Discord 봇 활동 상세',
            subtitle: '채널별 메시지 · 응답 시간 · 재시작 이력',
            data: { discord_stats: sm?.discord_stats ?? null },
          })}
        >
          상세 →
        </button>
      </div>

      {/* Row 1: 봇 활동 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <div className="bg-zinc-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-black text-zinc-900 tabular-nums">{botCalls}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">봇 응답</div>
        </div>
        <div className="bg-zinc-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-black text-zinc-900 tabular-nums">{humanMsgs}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">사람 메시지</div>
        </div>
        <div className="bg-zinc-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-black text-zinc-900 tabular-nums">{avgElapsed}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">평균 응답(초)</div>
        </div>
        <div className={`rounded-lg p-2 text-center ${restarts > 3 ? 'bg-amber-50' : 'bg-zinc-50'}`}>
          <div className={`text-2xl font-black tabular-nums ${restarts > 3 ? 'text-amber-700' : 'text-zinc-900'}`}>{restarts}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">재시작</div>
        </div>
      </div>

      {/* Row 2: 자동화 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <div className={`rounded-lg p-2 text-center ${cronRate < 100 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <div className={`text-2xl font-black tabular-nums ${cronRate < 100 ? 'text-amber-700' : 'text-emerald-700'}`}>{cronRate}%</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">자동화 성공률</div>
        </div>
        <div className="bg-zinc-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-black text-zinc-900 tabular-nums">{totalCronTasks}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">크론 태스크</div>
        </div>
        <div className={`rounded-lg p-2 text-center ${failedCronTasks.length > 0 ? 'bg-red-50' : 'bg-zinc-50'}`}>
          <div className={`text-2xl font-black tabular-nums ${failedCronTasks.length > 0 ? 'text-red-700' : 'text-zinc-900'}`}>
            {failedCronTasks.length}
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">
            {failedCronTasks.length > 0 ? `실패(${failNames})` : '실패'}
          </div>
        </div>
        <div className="bg-zinc-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-black text-zinc-900 tabular-nums">{decisionCount}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5 uppercase tracking-wide">결정</div>
        </div>
      </div>

      {/* 활성 채널 뱃지 */}
      {channels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-2">
          <span className="text-[10px] text-zinc-400 self-center">활성 채널</span>
          {channels.map(ch => (
            <span key={ch.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-medium rounded-full">
              {CH_NAME[ch.id] ?? ch.name}
              <span className="text-indigo-400">({ch.human}명)</span>
            </span>
          ))}
        </div>
      )}

      {/* 7일 추이 미니 차트 */}
      {today.weekTrend.length > 0 && (() => {
        const combined = today.weekTrend.map(d => ({ date: d.date, total: d.posts + d.comments }));
        const maxVal = Math.max(...combined.map(d => d.total), 1);
        return (
          <div className="mt-3 border-t border-zinc-100 pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-400">7일 추이 (게시글+댓글)</span>
            </div>
            <div className="flex items-end gap-0.5 h-8">
              {combined.map(d => {
                const h = d.total > 0 ? (d.total / maxVal) * 100 : 2;
                return (
                  <div key={d.date} className="flex-1 flex flex-col justify-end h-full" title={`${d.date}: ${d.total}건`}>
                    <div className="bg-indigo-400 rounded-sm" style={{ height: `${h}%`, minHeight: '1px' }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] text-zinc-400 mt-0.5">
              {combined.map(d => <span key={d.date}>{d.date.slice(5)}</span>)}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

// ── 섹션 4: 오늘 Jarvis 결정 (접기, 기본 열림) ────────────────────────────────

function DecisionsSection({ sm, onOpen }: { sm?: DashboardData['sysMetrics']; onOpen?: (spec: DrawerSpec) => void }) {
  const [open, setOpen] = useState(true);
  const decisions = sm?.decisions_today ?? [];

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-[10px] font-semibold text-zinc-400 hover:text-zinc-700 transition-colors mb-2"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="uppercase tracking-widest">오늘 Jarvis 결정</span>
        <span className="ml-2 text-[11px] font-normal text-zinc-400 normal-case tracking-normal">
          {decisions.length}건
        </span>
      </button>

      {open && (
        <Card>
          {decisions.length === 0 ? (
            <div className="text-xs text-zinc-400">오늘 결정 없음</div>
          ) : (
            <div className="space-y-1.5">
              {decisions.map((d, i) => {
                const isUnmatched = d.action === 'UNMATCHED' || d.result === 'NEEDS_MANUAL_REVIEW';
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${isUnmatched ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-zinc-50'}`}
                    onClick={() => onOpen?.({
                      type: 'decision',
                      title: d.decision?.slice(0, 50) || '의사결정 상세',
                      subtitle: d.team || '',
                      data: {
                        decision: d,
                        allDecisions: decisions,
                      },
                    })}
                  >
                    {isUnmatched && <span className="text-[10px] text-orange-500 font-bold mt-0.5 flex-shrink-0">⚠</span>}
                    {!isUnmatched && <span className="text-[10px] text-zinc-300 mt-0.5 flex-shrink-0">•</span>}
                    {d.team && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${TEAM_COLOR[d.team] ?? 'bg-zinc-100 text-zinc-500'}`}>
                        {TEAM_LABEL[d.team] ?? d.team}
                      </span>
                    )}
                    <span className={`text-[11px] leading-snug ${isUnmatched ? 'text-orange-800' : 'text-zinc-600'}`}>
                      {d.decision ?? '(내용 없음)'}
                    </span>
                    {d.status && (
                      <span className="ml-auto text-[10px] text-zinc-300 flex-shrink-0">{d.status}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── 섹션 5: 팀 현황 (접기, 기본 닫힘) ─────────────────────────────────────────

function TeamOverviewSection({ data, onOpen }: { data: DashboardData['teamOverview']; onOpen?: (spec: DrawerSpec) => void }) {
  const [open, setOpen] = useState(false);

  const normalCount = data.teams.filter(t => t.status === 'NORMAL').length;
  const issueCount = data.teams.length - normalCount;

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-[10px] font-semibold text-zinc-400 hover:text-zinc-700 transition-colors mb-2"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="uppercase tracking-widest">팀 현황</span>
        {!open && (
          <span className="ml-2 text-[11px] font-normal text-zinc-400 normal-case tracking-normal">
            {normalCount}개 정상{issueCount > 0 ? ` · ${issueCount}개 주의` : ''}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3">
          {/* MVP */}
          {data.mvp && (
            <Card>
              <div className="flex items-center gap-3">
                <span className="text-xl">🏆</span>
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider">이번주 MVP</div>
                  <div className="text-base font-black text-zinc-800">{data.mvp.agent_id}</div>
                  <div className="text-xs text-zinc-500">{data.mvp.score}점 · {data.mvp.events}건 활동</div>
                </div>
              </div>
            </Card>
          )}

          {/* 팀 그리드 */}
          {(() => {
            const maxMerit = Math.max(...data.teams.map(t => t.merit), 1);
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {data.teams.map(team => {
                  const statusCls = team.status === 'NORMAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : team.status === 'AT_RISK' ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-red-50 text-red-700 border-red-200';
                  const statusLabel = team.status === 'NORMAL' ? '정상' : team.status === 'AT_RISK' ? '주의' : '패널티';
                  const statusSubtitle = team.status === 'NORMAL' ? '정상 운영' : team.status === 'AT_RISK' ? '위험 상태' : '제재 중';
                  const meritPct = team.merit > 0 ? Math.max(8, Math.round((team.merit / maxMerit) * 100)) : 0;
                  return (
                    <div
                      key={team.name}
                      className="bg-white border border-zinc-200 rounded-xl p-2.5 shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors"
                      onClick={() => onOpen?.({
                        type: 'team',
                        title: TEAM_LABEL[team.name] ?? team.name,
                        subtitle: statusSubtitle,
                        data: {
                          teamKey: team.name,
                          teamLabel: TEAM_LABEL[team.name] ?? team.name,
                          teamEmoji: '🏢',
                          status: team.status,
                          merit: team.merit,
                          penalty: team.penalty,
                        },
                      })}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-zinc-800">{TEAM_LABEL[team.name] ?? team.name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusCls}`}>{statusLabel}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                        {team.merit > 0 && <span className="text-emerald-600 font-medium">+{team.merit}</span>}
                        {team.penalty > 0 && <span className="text-red-500 font-medium">-{team.penalty}</span>}
                        {team.merit === 0 && team.penalty === 0 && <span>—</span>}
                      </div>
                      {/* 공적 미니바 */}
                      {meritPct > 0 && (
                        <div className="mt-1.5 h-1 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                            style={{ width: `${meritPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── 섹션 6: 엔지니어링 상세 (접기, 기본 열림) ─────────────────────────────────

function CronTaskTable({ sm, onRowClick }: { sm?: DashboardData['sysMetrics']; onRowClick?: (spec: DrawerSpec) => void }) {
  const taskStatus = sm?.cron_stats?.taskStatus ?? {};
  const entries = Object.entries(taskStatus);
  const circuitBreakers = sm?.circuit_breakers ?? [];

  if (entries.length === 0) return null;

  const sorted = entries.sort(([, a], [, b]) => {
    if (a.lastStatus === 'FAILED' && b.lastStatus !== 'FAILED') return -1;
    if (a.lastStatus !== 'FAILED' && b.lastStatus === 'FAILED') return 1;
    return 0;
  }).slice(0, 12);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span>⏱</span>
        <Label>크론 태스크 현황</Label>
        <span className="ml-auto text-[10px] text-zinc-400">{entries.length}개</span>
      </div>
      <div className="space-y-1">
        {sorted.map(([name, info]) => {
          const ok = info.lastStatus === 'OK';
          const cbMatch = circuitBreakers.find(cb => cb.name === name);
          const circuitOpen = cbMatch?.state === 'open';
          return (
            <div
              key={name}
              className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-zinc-50 rounded px-1 -mx-1 transition-colors"
              onClick={() => onRowClick?.({
                type: 'cron',
                title: name,
                subtitle: `크론 작업 상세 · ${info.lastStatus === 'FAILED' ? '실패' : info.lastStatus === 'OK' ? '정상' : '미실행'}`,
                data: {
                  task: name,
                  status: info.lastStatus ?? 'unknown',
                  failCount: info.failCount ?? 0,
                  lastRun: info.lastRun,
                  circuitOpen,
                  cbName: name,
                },
              })}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-400' : 'bg-red-500'}`} />
              <span className={`text-[11px] flex-1 truncate ${ok ? 'text-zinc-600' : 'text-red-700 font-medium'}`}>
                {name.replace(/-/g, ' ')}
              </span>
              <span className="text-[10px] text-zinc-400 flex-shrink-0 tabular-nums">
                {formatTime(info.lastRun)}
              </span>
              {info.failCount > 0 && (
                <span className="text-[10px] text-red-500 font-medium flex-shrink-0">×{info.failCount}</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DiscordChannelCard({ sm, onOpen }: { sm?: DashboardData['sysMetrics']; onOpen?: (spec: DrawerSpec) => void }) {
  const channels = sm?.discord_stats?.channelActivity ?? [];
  const restarts = sm?.discord_stats?.restartCount ?? 0;
  const errs = sm?.discord_stats?.botErrors ?? 0;

  if (channels.length === 0) return null;

  const maxTotal = Math.max(...channels.map(c => c.human + (c.bot ?? c.claudes)), 1);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span>💬</span>
        <Label>Discord 채널별 활동</Label>
        {restarts > 0 && <span className="text-[10px] text-amber-600">재시작 {restarts}회</span>}
        {errs > 0 && <span className="text-[10px] text-red-500">에러 {errs}건</span>}
        <button
          className="ml-auto text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
          onClick={() => onOpen?.({
            type: 'bot',
            title: 'Discord 채널 활동',
            subtitle: '채널별 인간/봇 메시지 현황',
            data: { discord_stats: sm?.discord_stats ?? null },
          })}
        >
          상세 →
        </button>
      </div>
      <div className="space-y-1.5">
        {channels.slice(0, 6).map(ch => {
          const botCount = ch.bot ?? ch.claudes;
          const total = ch.human + botCount;
          const barPct = total > 0 ? Math.round((total / maxTotal) * 100) : 0;
          return (
            <div key={ch.id} className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-600 w-28 truncate flex-shrink-0">{CH_NAME[ch.id] ?? ch.name ?? ch.id.slice(-6)}</span>
              <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${barPct}%` }} />
              </div>
              <span className="text-[10px] text-zinc-400 tabular-nums w-16 text-right flex-shrink-0">
                👤{ch.human} 🤖{botCount}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RagCard({ sm, onOpen }: { sm?: DashboardData['sysMetrics']; onOpen?: (spec: DrawerSpec) => void }) {
  const rag = sm?.rag_stats;
  if (!rag) return null;

  const inboxHigh = (rag.inboxCount ?? 0) > 5000;

  return (
    <Card>
      <div
        className="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => onOpen?.({
          type: 'rag',
          title: 'RAG 상세',
          subtitle: '자비스 장기 기억 시스템',
          data: {
            dbSize: rag.dbSize ?? '?',
            inboxCount: rag.inboxCount ?? 0,
            chunks: rag.chunks ?? 0,
            rebuilding: !!(rag as { rebuilding?: boolean }).rebuilding,
            stuck: !!(rag.stuck),
          },
        })}
      >
        <div className="flex items-center gap-2 mb-2">
          <span>📚</span>
          <Label>RAG 상태</Label>
          {rag.stuck && <span className="ml-auto text-[10px] text-red-500 font-semibold">⚠ 중단됨</span>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-lg font-black text-zinc-900">{rag.dbSize ?? '-'}</div>
            <div className="text-[10px] text-zinc-400">DB 크기</div>
          </div>
          <div>
            <div className="text-lg font-black text-zinc-900">{rag.chunks?.toLocaleString() ?? '-'}</div>
            <div className="text-[10px] text-zinc-400">청크 수</div>
          </div>
          <div>
            <div className={`text-lg font-black ${inboxHigh ? 'text-amber-600' : 'text-zinc-900'}`}>
              {rag.inboxCount?.toLocaleString() ?? '-'}
            </div>
            <div className={`text-[10px] ${inboxHigh ? 'text-amber-600' : 'text-zinc-400'}`}>
              {inboxHigh ? '⚠ 인박스 대기' : '인박스'}
            </div>
          </div>
        </div>
        {inboxHigh && (
          <div className="mt-2 text-[11px] text-amber-600 font-medium">
            인박스 처리 대기 {rag.inboxCount?.toLocaleString()}건 — 적극 처리 권장
          </div>
        )}
      </div>
    </Card>
  );
}

function DevQueueCard({ sm, onOpen }: { sm?: DashboardData['sysMetrics']; onOpen?: (spec: DrawerSpec) => void }) {
  const queue = (sm?.dev_queue ?? []).filter(i => i.status === 'pending');
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span>⚙️</span>
        <Label>Dev 대기열</Label>
        <span className="ml-auto text-[10px] text-zinc-400">{queue.length}건</span>
      </div>
      {queue.length === 0 ? (
        <div className="text-xs text-zinc-400">대기 중인 작업 없음 ✓</div>
      ) : (
        <div className="space-y-1">
          {queue.slice(0, 6).map((item, idx) => (
            <div
              key={item.id ?? idx}
              className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 rounded px-1 -mx-1 py-0.5 transition-colors"
              onClick={() => onOpen?.({
                type: 'task',
                title: item.name,
                subtitle: `상태: ${item.status}`,
                data: {
                  id: item.id || item.name,
                  title: item.name,
                  priority: item.priority != null ? (item.priority <= 1 ? 'urgent' : item.priority <= 2 ? 'high' : 'medium') : 'medium',
                  status: item.status,
                },
              })}
            >
              <span className={`text-[10px] font-bold w-5 flex-shrink-0 ${(item.priority ?? 0) >= 8 ? 'text-red-500' : (item.priority ?? 0) >= 5 ? 'text-amber-500' : 'text-zinc-400'}`}>
                P{item.priority ?? 0}
              </span>
              <span className="text-[11px] text-zinc-700 flex-1 line-clamp-1">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CircuitBreakerCard({ sm, onRowClick, nowSec }: { sm?: DashboardData['sysMetrics']; onRowClick?: (spec: DrawerSpec) => void; nowSec: number }) {
  const cbs = (sm?.circuit_breakers ?? []).filter(cb => (cb.failCount ?? 0) > 0);
  if (cbs.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span>⚡</span>
        <Label>서킷브레이커</Label>
        <span className="ml-auto text-[10px] text-amber-600">{cbs.length}개 이력</span>
      </div>
      <div className="space-y-1">
        {cbs.map((cb, i) => {
          const stateOpen = cb.state === 'open';
          const cbName = cb.name ?? '(unnamed)';
          const lastFailTs = cb.last_fail_ts;
          const lastFailAgo = lastFailTs ? nowSec - lastFailTs : 0;
          const cooldownRemaining = Math.max(0, 3600 - lastFailAgo);
          return (
            <div
              key={i}
              className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 rounded px-1 -mx-1 transition-colors py-0.5"
              onClick={() => onRowClick?.({
                type: 'cb',
                title: `회로차단: ${cbName}`,
                subtitle: `연속 ${cb.failCount}회 실패`,
                data: {
                  name: cbName,
                  failCount: cb.failCount ?? 0,
                  lastFailAgo,
                  cooldownRemaining,
                },
              })}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stateOpen ? 'bg-red-500' : 'bg-amber-400'}`} />
              <span className={`text-[11px] flex-1 ${stateOpen ? 'text-red-700 font-medium' : 'text-zinc-600'}`}>
                {cbName}
              </span>
              <span className="text-[10px] text-zinc-400">{cb.failCount}회 실패</span>
              <span className={`text-[10px] font-medium ${stateOpen ? 'text-red-600' : 'text-amber-600'}`}>
                {stateOpen ? '열림' : '닫힘'}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LaunchAgentsDetail({ sm, onRowClick }: { sm?: DashboardData['sysMetrics']; onRowClick?: (spec: DrawerSpec) => void }) {
  const agents = sm?.launch_agents ?? [];
  if (agents.length === 0) return null;

  const isOk = (a: { pid: string | null; exitCode: number | null; loaded: boolean }) =>
    a.loaded && (a.exitCode === 0 || a.exitCode === -15 || a.exitCode === null) && a.pid !== null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span>🖥️</span>
        <Label>서비스 상태</Label>
      </div>
      <div className="space-y-1">
        {agents.map(a => {
          const ok = isOk(a);
          const broken = a.exitCode === 127;
          const name = LA_SHORT[a.name] ?? a.name.replace('ai.jarvis.', '');
          return (
            <div
              key={a.name}
              className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 rounded px-1 -mx-1 transition-colors py-0.5"
              onClick={() => onRowClick?.({
                type: 'service',
                title: a.name,
                subtitle: a.pid ? `PID ${a.pid}` : '미실행',
                data: {
                  name: a.name,
                  pid: a.pid,
                  exitCode: a.exitCode,
                  loaded: a.loaded,
                  label: a.name.replace('ai.jarvis.', ''),
                },
              })}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${broken ? 'bg-red-500' : ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className={`text-[11px] flex-1 ${broken ? 'text-red-700 font-medium' : ok ? 'text-zinc-600' : 'text-amber-700'}`}>{name}</span>
              <span className="text-[10px] text-zinc-400">
                {a.pid ? `PID ${a.pid}` : '미실행'}
              </span>
              <span className={`text-[10px] font-medium ${broken ? 'text-red-600' : ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                {broken ? '오류(127)' : ok ? '정상' : `exit:${a.exitCode}`}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function EngineeringSection({ sm, onOpen, nowSec, e2e, errors }: {
  sm?: DashboardData['sysMetrics'];
  onOpen?: (spec: DrawerSpec) => void;
  nowSec: number;
  e2e?: DashboardData['e2e'];
  errors?: DashboardData['errors'];
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-[10px] font-semibold text-zinc-400 hover:text-zinc-700 transition-colors mb-2"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="uppercase tracking-widest">엔지니어링 상세</span>
      </button>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CronTaskTable sm={sm} onRowClick={onOpen} />
          <LaunchAgentsDetail sm={sm} onRowClick={onOpen} />
          <DiscordChannelCard sm={sm} onOpen={onOpen} />
          <RagCard sm={sm} onOpen={onOpen} />
          <DevQueueCard sm={sm} onOpen={onOpen} />
          <CircuitBreakerCard sm={sm} onRowClick={onOpen} nowSec={nowSec} />
          {e2e && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <span>🧪</span>
                <Label>E2E 테스트</Label>
                <span className={`ml-auto text-[10px] font-semibold ${e2e.rate >= 95 ? 'text-emerald-600' : e2e.rate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                  {e2e.passed}/{e2e.total} ({e2e.rate}%)
                </span>
                <button
                  className="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
                  onClick={() => onOpen?.({
                    type: 'e2e-full',
                    title: 'E2E 테스트 상세',
                    subtitle: `${e2e.passed}/${e2e.total} 통과 · ${e2e.rate}%`,
                    data: {
                      passed: e2e.passed,
                      total: e2e.total,
                      rate: e2e.rate,
                      lastRun: e2e.lastRun,
                      failures: e2e.failures,
                    },
                  })}
                >
                  상세 →
                </button>
              </div>
              <div className="w-full bg-zinc-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${e2e.rate >= 95 ? 'bg-emerald-500' : e2e.rate >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${e2e.rate}%` }}
                />
              </div>
            </Card>
          )}
          {errors && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <span>🔴</span>
                <Label>오류 현황</Label>
                <span className={`ml-auto text-[10px] font-semibold ${errors.total24h >= 20 ? 'text-red-600' : errors.total24h >= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  24h: {errors.total24h}건
                </span>
                <button
                  className="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
                  onClick={() => onOpen?.({
                    type: 'errors-full',
                    title: '오류 현황 상세',
                    subtitle: `24시간 ${errors.total24h}건 · 누적 ${errors.totalAll}건`,
                    data: {
                      total24h: errors.total24h,
                      totalAll: errors.totalAll,
                      topErrors: errors.topErrors,
                    },
                  })}
                >
                  상세 →
                </button>
              </div>
              <div className="text-xs text-zinc-500">누적 {errors.totalAll}건</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

const EMPTY_HEALTH: DashboardData['healthSummary'] = {
  overall: 'green', botLevel: 'green', cronLevel: 'green',
  e2eLevel: 'green', errorLevel: 'green', issues: [],
};
const EMPTY_ATTENTION: DashboardData['attention'] = { awaitingApproval: [], needsOwnerInput: [], closingSoon: [] };
const EMPTY_TODAY: DashboardData['todaySummary'] = { newPosts: 0, resolvedPosts: 0, completedTasks: 0, aiComments: 0, weekChange: 0, weekTrend: [] };
const EMPTY_TEAM: DashboardData['teamOverview'] = { mvp: null, autonomyRate: 0, totalDecisions: 0, executed: 0, teams: [] };

const EMPTY_DATA: DashboardData = {
  ts: '',
  system: {},
  cron: { todaySuccess: 0, todayFail: 0, todayTotal: 0, successRate: 100, recentFailures: [], trend: [] },
  claude: { todayCalls: 0, lastHourCalls: 0, totalTracked: 0, hourly: new Array(24).fill(0) },
  tasks: { total: 0, awaiting: 0, approved: 0, active: 0, done: 0, failed: 0, rejected: 0, groups: 0 },
  board: { totalPosts: 0, openPosts: 0, resolvedPosts: 0, totalComments: 0, recentDays: [] },
  agents: { top5: [], tierChanges: [] },
  e2e: { passed: 0, total: 0, rate: 100, lastRun: '', failures: [] },
  teams: [],
  autonomy: {},
  errors: { total24h: 0, totalAll: 0, topErrors: [] },
  healthSummary: EMPTY_HEALTH,
  attention: EMPTY_ATTENTION,
  todaySummary: EMPTY_TODAY,
  teamOverview: EMPTY_TEAM,
  sysMetrics: null,
};

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardClient({ initialData }: { initialData: DashboardData | null }) {
  const [data, setData] = useState<DashboardData>(initialData ?? EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [drawer, setDrawer] = useState<DrawerSpec | null>(null);
  const openDrawer = useCallback((spec: DrawerSpec) => setDrawer(spec), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const { subscribe } = useEvent();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const json = await res.json() as DashboardData;
        setData(json);
        setLastRefresh(new Date());
      }
    } catch {
      // 스테일 데이터 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'dev_task_updated') fetchData();
    });
  }, [subscribe, fetchData]);

  const d = data;
  const health = d.healthSummary ?? EMPTY_HEALTH;
  const attention = d.attention ?? EMPTY_ATTENTION;
  const today = d.todaySummary ?? EMPTY_TODAY;
  const team = d.teamOverview ?? EMPTY_TEAM;
  const sm = d.sysMetrics;
  const nowSec = Math.floor(new Date().getTime() / 1000);

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 flex items-center gap-1 transition-colors">
            ← 홈
          </Link>
          <h1 className="text-sm font-semibold text-zinc-900">📊 Jarvis 브리핑</h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-zinc-400 tabular-nums">
              {lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <button onClick={fetchData} disabled={loading}
              className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors disabled:opacity-50" title="새로고침">
              <RefreshCw className={`w-3.5 h-3.5 text-zinc-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-3">

        {/* 섹션 1: 전체 상태 */}
        <HealthPanel data={health} sm={sm} />

        {/* Health Prediction — "자비스 안정성" */}
        <section className="mb-6">
          <div
            className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openDrawer({
              type: 'health',
              title: '자비스 안정성 상세',
              subtitle: '현재 리스크 요인 및 예측',
              data: {
                overall: data.healthSummary?.overall,
                issues: data.healthSummary?.issues ?? [],
                bot: sm?.health?.discord_bot ?? 'unknown',
                cronRate: sm?.cron_stats?.rate ?? data.cron?.successRate ?? 100,
                disk: sm?.disk,
                memory_mb: sm?.health?.memory_mb,
              }
            })}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-zinc-700 uppercase tracking-wide">⚡ 자비스 안정성</h2>
              <span className="text-xs text-zinc-400">클릭하여 상세 보기</span>
            </div>
            {/* 4-pill row */}
            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: 'Discord 봇',
                  level: sm?.health?.discord_bot === 'healthy' ? 'green' : 'red',
                  detail: sm?.health?.discord_bot === 'healthy' ? '정상' : '이상',
                },
                {
                  label: '크론',
                  level: (sm?.cron_stats?.rate ?? 100) >= 90 ? 'green' : (sm?.cron_stats?.rate ?? 100) >= 70 ? 'yellow' : 'red',
                  detail: `${sm?.cron_stats?.rate ?? data.cron?.successRate ?? 100}%`,
                },
                {
                  label: 'RAG 인박스',
                  level: (sm?.rag_stats?.inboxCount ?? 0) > 15000 ? 'red' : (sm?.rag_stats?.inboxCount ?? 0) > 5000 ? 'yellow' : 'green',
                  detail: `${(sm?.rag_stats?.inboxCount ?? 0).toLocaleString()}건`,
                },
                {
                  label: '디스크',
                  level: (sm?.disk?.used_pct ?? 0) > 90 ? 'red' : (sm?.disk?.used_pct ?? 0) > 75 ? 'yellow' : 'green',
                  detail: `${sm?.disk?.used_pct ?? '?'}%`,
                },
                {
                  label: 'Dev Daemon',
                  level: (() => {
                    const daemon = sm?.dev_daemon;
                    if (!daemon?.alive) return 'red' as const;
                    const lastPoll = daemon.last_poll ? new Date(daemon.last_poll).getTime() : 0;
                    return (Date.now() - lastPoll < 60000) ? 'green' as const : 'yellow' as const;
                  })(),
                  detail: sm?.dev_daemon?.alive ? (sm?.dev_daemon?.current_task ? '실행 중' : '대기') : '비활성',
                },
              ].map(({ label, level, detail }) => (
                <span key={label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  level === 'green' ? 'bg-emerald-100 text-emerald-700' :
                  level === 'yellow' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${level === 'green' ? 'bg-emerald-500' : level === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  {label}: {detail}
                </span>
              ))}
            </div>
            {/* Crash prediction text */}
            {(() => {
              const inboxCount = sm?.rag_stats?.inboxCount ?? 0;
              const cronRate = sm?.cron_stats?.rate ?? 100;
              const diskPct = sm?.disk?.used_pct ?? 0;
              const botOk = sm?.health?.discord_bot === 'healthy';

              const risks: string[] = [];
              if (inboxCount > 15000) risks.push('RAG compact 위험 (자비스 일시 중단 가능)');
              if (cronRate < 70) risks.push('크론 다수 실패 (기능 저하)');
              if (diskPct > 90) risks.push('디스크 부족 (장애 임박)');
              if (!botOk) risks.push('Discord 봇 이상');

              if (risks.length === 0) return (
                <p className="mt-3 text-xs text-emerald-600 font-medium">✓ 현재 장애 위험 요소 없음</p>
              );
              return (
                <p className="mt-3 text-xs text-rose-600">
                  ⚠️ 장애 위험: {risks.join(' · ')}
                </p>
              );
            })()}
          </div>
        </section>

        {/* 섹션 2: 내 할 일 */}
        {(attention.awaitingApproval.length > 0 || attention.needsOwnerInput.length > 0 || attention.closingSoon.length > 0) && (
          <section className="mb-4">
            <SectionHeader>내 할 일</SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ApprovalCard items={attention.awaitingApproval} taskCount={d.tasks.awaiting} onOpen={openDrawer} />
              <OwnerInputCard items={attention.needsOwnerInput} onOpen={openDrawer} />
              <ClosingSoonCard items={attention.closingSoon} onOpen={openDrawer} />
            </div>
          </section>
        )}

        {/* 섹션 3: 오늘 활동 */}
        <TodayActivityCard sm={sm} today={today} onOpen={openDrawer} />

        {/* 섹션 4: 오늘 Jarvis 결정 */}
        <DecisionsSection sm={sm} onOpen={openDrawer} />

        {/* 섹션 5: 팀 현황 */}
        <TeamOverviewSection data={team} onOpen={openDrawer} />

        {/* 섹션 5b: 에이전트 리더보드 */}
        {d.agents.top5.length > 0 && (
          <div className="mb-4">
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <span>🏆</span>
                <Label>에이전트 TOP 5</Label>
                <button
                  className="ml-auto text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
                  onClick={() => openDrawer({
                    type: 'agents',
                    title: '에이전트 리더보드',
                    subtitle: '30일 점수 · 투표 분석 · 티어 변화',
                    data: {
                      top5: d.agents.top5,
                      tierChanges: d.agents.tierChanges,
                    },
                  })}
                >
                  상세 →
                </button>
              </div>
              <div className="space-y-2">
                {d.agents.top5.slice(0, 5).map((agent, i) => {
                  const maxScore = d.agents.top5[0]?.score ?? 1;
                  const barPct = Math.max(4, Math.round((agent.score / maxScore) * 100));
                  const RANK_COLORS = ['text-amber-500', 'text-zinc-400', 'text-orange-400', 'text-zinc-500', 'text-zinc-500'];
                  const BAR_COLORS = ['bg-indigo-500', 'bg-indigo-400', 'bg-indigo-300', 'bg-zinc-300', 'bg-zinc-200'];
                  return (
                    <div key={agent.agent_id} className="flex items-center gap-2">
                      <span className={`w-4 text-center text-[11px] font-black flex-shrink-0 ${RANK_COLORS[i] ?? 'text-zinc-400'}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-zinc-700 font-medium truncate">{agent.agent_id}</span>
                          <span className="text-[10px] text-zinc-400 tabular-nums ml-2 flex-shrink-0">{agent.score.toLocaleString()}점</span>
                        </div>
                        <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${BAR_COLORS[i] ?? 'bg-zinc-200'}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* 섹션 6: 엔지니어링 상세 */}
        <EngineeringSection sm={sm} onOpen={openDrawer} nowSec={nowSec} e2e={d.e2e} errors={d.errors} />

      </main>

      <Drawer spec={drawer} onClose={closeDrawer} />
    </>
  );
}
