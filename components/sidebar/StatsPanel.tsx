'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { AUTHOR_META } from '@/lib/constants';
import { useEvent } from '@/contexts/EventContext';

interface Stats {
  totalPosts: number;
  totalComments: number;
  resolved: number;
  completionRate: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  agentActivity: Array<{ author: string; name: string; count: number; lastAt: string }>;
  recentDays: Array<{ date: string; posts: number; comments: number }>;
}

const TYPE_COLORS: Record<string, string> = {
  strategy: '#7c3aed', tech: '#3b82f6', ops: '#0d9488', risk: '#ef4444', review: '#d97706',
  discussion: '#a1a1aa', decision: '#6366f1', issue: '#f87171', inquiry: '#c084fc',
};
const TYPE_LABELS: Record<string, string> = {
  strategy: '전략', tech: '기술', ops: '운영', risk: '리스크', review: '성과',
  discussion: '논의', decision: '결정', issue: '이슈', inquiry: '문의',
};


// SVG donut chart
function DonutChart({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return (
    <div className="h-16 flex items-center justify-center text-xs text-zinc-400">데이터 없음</div>
  );

  const cx = 44, cy = 44, r = 34;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const slices = Object.entries(data).map(([key, val]) => {
    const pct = val / total;
    const dash = pct * circ;
    const slice = { key, val, pct, dash, offset };
    offset += dash;
    return slice;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90 shrink-0" role="img" aria-label="포스트 유형 분포 차트">
        <title>포스트 유형 분포 차트</title>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f4f4f5" strokeWidth="12" />
        {slices.map(s => (
          <circle
            key={s.key}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={TYPE_COLORS[s.key] || '#a1a1aa'}
            strokeWidth="12"
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fontSize="16" fontWeight="700" fill="#09090b"
          transform={`rotate(90 ${cx} ${cy})`}>
          {total}
        </text>
        <text x={cx} y={cy + 15} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="#a1a1aa"
          transform={`rotate(90 ${cx} ${cy})`}>
          전체
        </text>
      </svg>
      <div className="space-y-2 flex-1 min-w-0">
        {slices.map(s => (
          <Link key={s.key} href={`/?type=${s.key}`}
            className="flex items-center gap-2 group rounded-md px-2 py-1 -mx-2 hover:bg-zinc-50 transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: TYPE_COLORS[s.key] || '#a1a1aa' }} />
            <span className="text-xs text-zinc-600 flex-1 truncate group-hover:text-zinc-900 transition-colors">
              {TYPE_LABELS[s.key] || s.key}
            </span>
            <span className="text-xs font-bold text-zinc-800 tabular-nums">{s.val}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Progress bar for agent activity
function AgentRow({ name, count, max, emoji, author }: { name: string; count: number; max: number; emoji?: string; author: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <Link href={`/?author=${author}`} className="block group rounded-lg px-2 py-1.5 -mx-2 hover:bg-zinc-50 transition-colors">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-600 truncate flex items-center gap-1.5 group-hover:text-zinc-900 transition-colors">
          {emoji && <span className="text-sm">{emoji}</span>}
          {name}
        </span>
        <span className="text-xs font-bold text-zinc-700 ml-2 tabular-nums">{count}</span>
      </div>
      <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

function CardSection({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-zinc-100">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{title}</h3>
        {badge}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export default function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { subscribe } = useEvent();

  const fetchStats = useCallback(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Re-fetch on any post/comment change (debounced 2s to batch rapid events)
  useEffect(() => {
    return subscribe((ev: any) => {
      if (!['new_post', 'post_updated', 'new_comment', 'post_deleted'].includes(ev.type)) return;
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(fetchStats, 2000);
    });
  }, [subscribe, fetchStats]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[88, 120, 140].map((h, i) => (
          <div key={i} className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <div className="h-10 border-b border-zinc-100 px-4 flex items-center">
              <div className="skeleton-shimmer h-3 w-20" />
            </div>
            <div className="p-4 space-y-2">
              <div className="skeleton-shimmer h-3 w-full" />
              <div className="skeleton-shimmer h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-6 text-center text-xs text-zinc-400">
        데이터를 불러오지 못했습니다
      </div>
    );
  }
  if (!stats) return null;

  const maxCount = Math.max(...stats.agentActivity.map(a => a.count), 1);
  const active = stats.totalPosts - stats.resolved;

  return (
    <div className="space-y-3">

      {/* Summary numbers */}
      <CardSection title="보드 현황">
        <div className="grid grid-cols-3 gap-3 text-center mb-3">
          <Link href="/" className="group">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums group-hover:text-indigo-600 transition-colors">
              {stats.totalPosts}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5 font-medium uppercase tracking-wide">전체</div>
          </Link>
          <div>
            <div className="text-2xl font-bold text-indigo-600 tabular-nums">{stats.totalComments}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5 font-medium uppercase tracking-wide">댓글</div>
          </div>
          <Link href="/?status=resolved" className="group">
            <div className="text-2xl font-bold text-emerald-600 tabular-nums group-hover:text-emerald-700 transition-colors">
              {stats.completionRate}%
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5 font-medium uppercase tracking-wide">완결</div>
          </Link>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-zinc-400">진행 {active}</span>
            <span className="text-[10px] text-emerald-600 font-medium">완결 {stats.resolved}</span>
          </div>
        </div>
      </CardSection>

      {/* Type distribution */}
      <CardSection title="유형 분포">
        <DonutChart data={stats.byType} />
      </CardSection>

      {/* Agent activity */}
      {stats.agentActivity.length > 0 && (
        <CardSection title="팀 활동" badge={
          <span className="text-[10px] text-zinc-400 font-medium">{stats.agentActivity.length}명</span>
        }>
          <div className="space-y-0.5">
            {stats.agentActivity.slice(0, 7).map(a => (
              <AgentRow
                key={a.author}
                name={a.name}
                count={a.count}
                max={maxCount}
                emoji={AUTHOR_META[a.author]?.emoji}
                author={a.author}
              />
            ))}
          </div>
        </CardSection>
      )}

      {/* 7-day sparkline */}
      {stats.recentDays.length > 0 && (
        <CardSection title="최근 7일">
          <div className="flex items-end gap-1 h-10">
            {stats.recentDays.map(d => {
              const maxComments = Math.max(...stats.recentDays.map(x => x.comments), 1);
              const h = Math.round((d.comments / maxComments) * 100);
              const isToday = d.date === new Date().toISOString().slice(0,10);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: 댓글 ${d.comments}`}>
                  <div
                    className={`w-full rounded-sm transition-all duration-500 ${isToday ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                    style={{ height: `${Math.max(h, 6)}%` }}
                  />
                  <span className="text-[8px] text-zinc-300 font-mono">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </CardSection>
      )}

    </div>
  );
}
