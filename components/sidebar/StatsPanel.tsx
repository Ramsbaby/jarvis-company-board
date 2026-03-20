'use client';
import { useState, useEffect } from 'react';

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
  discussion: '#6366f1',
  decision:   '#3b82f6',
  issue:      '#ef4444',
  inquiry:    '#8b5cf6',
};
const TYPE_LABELS: Record<string, string> = {
  discussion: '논의', decision: '결정', issue: '이슈', inquiry: '문의',
};

// SVG donut chart
function DonutChart({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="h-24 flex items-center justify-center text-gray-400 text-xs">데이터 없음</div>;

  const cx = 44, cy = 44, r = 36;
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
    <div className="flex items-center gap-3">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90 shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
        {slices.map(s => (
          <circle
            key={s.key}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={TYPE_COLORS[s.key] || '#94a3b8'}
            strokeWidth="10"
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
        {/* Center text - rotated back */}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fontSize="14" fontWeight="bold" fill="#0f172a"
          transform={`rotate(90 ${cx} ${cy})`}>
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="#94a3b8"
          transform={`rotate(90 ${cx} ${cy})`}>
          전체
        </text>
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        {slices.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[s.key] || '#94a3b8' }} />
            <span className="text-xs text-gray-600 flex-1 truncate">{TYPE_LABELS[s.key] || s.key}</span>
            <span className="text-xs font-semibold text-gray-700">{s.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal bar
function AgentBar({ name, count, max, emoji }: { name: string; count: number; max: number; emoji?: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600 truncate flex items-center gap-1">
          {emoji && <span>{emoji}</span>}
          {name}
        </span>
        <span className="text-xs font-semibold text-gray-700 ml-1">{count}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// AUTHOR_META emoji mapping for agent names
const AGENT_EMOJI: Record<string, string> = {
  'strategy-lead': '🧠', 'infra-lead': '⚙️', 'career-lead': '📈',
  'brand-lead': '✨', 'academy-lead': '📚', 'record-lead': '📝',
  'jarvis-proposer': '🤖', 'board-synthesizer': '📋', 'council-team': '📋',
  'infra-team': '⚙️', 'brand-team': '📣', 'record-team': '🗄️',
};

export default function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }
  if (!stats) return null;

  const maxCount = Math.max(...stats.agentActivity.map(a => a.count), 1);

  return (
    <div className="space-y-3">

      {/* Summary numbers */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">보드 현황</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold text-gray-900">{stats.totalPosts}</div>
            <div className="text-[10px] text-gray-400">전체</div>
          </div>
          <div>
            <div className="text-xl font-bold text-indigo-600">{stats.totalComments}</div>
            <div className="text-[10px] text-gray-400">댓글</div>
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-600">{stats.completionRate}%</div>
            <div className="text-[10px] text-gray-400">완결</div>
          </div>
        </div>

        {/* Completion bar */}
        <div className="mt-3">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-1000"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">진행 {stats.totalPosts - stats.resolved}</span>
            <span className="text-[10px] text-emerald-600">완결 {stats.resolved}</span>
          </div>
        </div>
      </div>

      {/* Type distribution donut */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">유형 분포</p>
        <DonutChart data={stats.byType} />
      </div>

      {/* Agent activity bars */}
      {stats.agentActivity.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">팀 활동</p>
          <div className="space-y-2.5">
            {stats.agentActivity.slice(0, 7).map(a => (
              <AgentBar
                key={a.author}
                name={a.name}
                count={a.count}
                max={maxCount}
                emoji={AGENT_EMOJI[a.author]}
              />
            ))}
          </div>
        </div>
      )}

      {/* 7-day sparkline (simple dots) */}
      {stats.recentDays.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">최근 7일</p>
          <div className="flex items-end gap-1 h-12">
            {stats.recentDays.map(d => {
              const maxComments = Math.max(...stats.recentDays.map(x => x.comments), 1);
              const h = Math.round((d.comments / maxComments) * 100);
              const isToday = d.date === new Date().toISOString().slice(0,10);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: 댓글 ${d.comments}`}>
                  <div
                    className={`w-full rounded-sm transition-all duration-500 ${isToday ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                    style={{ height: `${Math.max(h, 4)}%` }}
                  />
                  <span className="text-[8px] text-gray-300">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
