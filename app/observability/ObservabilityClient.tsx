'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import MobileBottomNav from '@/components/MobileBottomNav';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PeriodStats {
  total: number;
  errors: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  avgDurMs: number;
  p95DurMs: number;
  topModels: Array<{ model: string; count: number }>;
  daily: Array<{ date: string; calls: number; errors: number; cost: number }>;
}

interface LangfuseData {
  configured: boolean;
  healthy?: boolean;
  url?: string;
  week?: PeriodStats;
  today?: PeriodStats;
  ts?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

function durStr(ms: number) {
  if (!ms) return '-';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function costStr(usd: number) {
  if (!usd) return '$0.00';
  return `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-4 flex flex-col gap-1">
      <div className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color ?? 'text-zinc-900'}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: Array<{ date: string; calls: number; errors: number }> }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.calls), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map(d => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
            {d.date.slice(5)} · {d.calls}회
          </div>
          <div
            className="w-full rounded-t-sm transition-all"
            style={{
              height: `${Math.max(4, (d.calls / max) * 56)}px`,
              background: d.errors > 0
                ? `linear-gradient(to top, #ef4444 ${Math.round((d.errors / d.calls) * 100)}%, #6366f1 0%)`
                : '#6366f1',
            }}
          />
          <div className="text-[9px] text-zinc-400 leading-none">{d.date.slice(8)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Model badge row ───────────────────────────────────────────────────────────

function ModelBadges({ models }: { models: Array<{ model: string; count: number }> }) {
  const total = models.reduce((s, m) => s + m.count, 0) || 1;
  const colors = ['bg-indigo-100 text-indigo-700', 'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-zinc-100 text-zinc-600'];
  return (
    <div className="flex flex-wrap gap-2">
      {models.map((m, i) => (
        <span key={m.model} className={`text-xs px-2.5 py-1 rounded-full font-medium ${colors[i % colors.length]}`}>
          {m.model} · {Math.round((m.count / total) * 100)}%
        </span>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ObservabilityClient({ initialData }: { initialData: LangfuseData | null }) {
  const [data, setData] = useState<LangfuseData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [lastFetch, setLastFetch] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/langfuse');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastFetch(new Date().toLocaleTimeString('ko-KR'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialData) load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, [initialData, load]);

  // ── Not configured ─────────────────────────────────────────────────────────
  if (data?.configured === false) {
    return (
      <>
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-zinc-800 mb-2">Langfuse 미설정</h1>
          <p className="text-zinc-500 text-sm mb-6">
            LLM 옵저버빌리티 도구가 아직 설정되지 않았습니다.
          </p>
          <code className="block bg-zinc-100 rounded-xl px-4 py-3 text-sm text-zinc-700 text-left">
            bash ~/.jarvis/scripts/langfuse-ctl.sh setup<br />
            bash ~/.jarvis/scripts/langfuse-ctl.sh start
          </code>
        </div>
        <MobileBottomNav isOwner={true} />
      </>
    );
  }

  // ── Offline ────────────────────────────────────────────────────────────────
  if (data?.configured && !data.healthy) {
    return (
      <>
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <div className="text-5xl mb-4">🔴</div>
          <h1 className="text-xl font-bold text-zinc-800 mb-2">Langfuse 오프라인</h1>
          <p className="text-zinc-500 text-sm mb-4">{data.url} 에 연결할 수 없습니다.</p>
          <code className="block bg-zinc-100 rounded-xl px-4 py-3 text-sm text-zinc-700">
            bash ~/.jarvis/scripts/langfuse-ctl.sh start
          </code>
        </div>
        <MobileBottomNav isOwner={true} />
      </>
    );
  }

  const w = data?.week;
  const t = data?.today;

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 pb-24 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">← 홈</Link>
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">옵저버빌리티</h1>
            <p className="text-sm text-zinc-500 mt-0.5">LLM 호출 비용 · 품질 · 성능 추적</p>
          </div>
          <div className="flex items-center gap-2">
            {data?.url && (
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Langfuse 열기 ↗
              </a>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors disabled:opacity-40"
              title="새로고침"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {loading && !data && (
          <div className="text-center py-16 text-zinc-400 text-sm">불러오는 중...</div>
        )}

        {w && (
          <>
            {/* Today strip */}
            {t && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6">
                <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-3">오늘</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold text-indigo-700">{fmt(t.total)}</div>
                    <div className="text-xs text-indigo-400">호출</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-indigo-700">{fmt(t.totalTokens)}</div>
                    <div className="text-xs text-indigo-400">토큰</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-xl font-bold ${t.errorRate > 10 ? 'text-red-600' : 'text-indigo-700'}`}>{t.errorRate}%</div>
                    <div className="text-xs text-indigo-400">에러율</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-indigo-700">{costStr(t.cost)}</div>
                    <div className="text-xs text-indigo-400">비용</div>
                  </div>
                </div>
              </div>
            )}

            {/* Weekly stats grid */}
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">지난 7일</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <StatCard label="총 호출" value={fmt(w.total)} sub={`오류 ${w.errors}건`} />
              <StatCard
                label="에러율"
                value={`${w.errorRate}%`}
                sub={`${w.errors}건 실패`}
                color={w.errorRate > 10 ? 'text-red-600' : w.errorRate > 5 ? 'text-amber-600' : 'text-emerald-600'}
              />
              <StatCard label="총 비용" value={costStr(w.cost)} sub="Claude API" />
              <StatCard label="총 토큰" value={fmt(w.totalTokens)} sub={`in ${fmt(w.inputTokens)} / out ${fmt(w.outputTokens)}`} />
              <StatCard label="평균 응답" value={durStr(w.avgDurMs)} sub={`P95: ${durStr(w.p95DurMs)}`} />
              <StatCard label="일평균 호출" value={fmt(Math.round(w.total / 7))} sub="calls/day" />
            </div>

            {/* Daily bar chart */}
            {w.daily.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-200 p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-zinc-700">일별 호출량</div>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" /> 정상</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> 에러</span>
                  </div>
                </div>
                <MiniBarChart data={w.daily} />
              </div>
            )}

            {/* Model distribution */}
            {w.topModels.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-200 p-4 mb-6">
                <div className="text-sm font-semibold text-zinc-700 mb-3">모델 분포</div>
                <ModelBadges models={w.topModels} />
                <div className="mt-3 space-y-1.5">
                  {w.topModels.map(m => {
                    const pct = Math.round((m.count / w.total) * 100);
                    return (
                      <div key={m.model} className="flex items-center gap-2">
                        <div className="text-xs text-zinc-500 w-28 truncate">{m.model}</div>
                        <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-zinc-400 w-12 text-right">{m.count}회</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="text-center text-xs text-zinc-400 mt-4">
              {lastFetch ? `마지막 업데이트: ${lastFetch}` : ''}
              {data?.ts && !lastFetch ? ` · ${new Date(data.ts).toLocaleTimeString('ko-KR')}` : ''}
              {' · '}1분마다 자동 갱신
            </div>
          </>
        )}

        {!loading && !w && data?.healthy && (
          <div className="text-center py-16 text-zinc-400">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm">아직 트레이스 데이터가 없습니다.</div>
            <div className="text-xs mt-1">Jarvis가 LLM을 호출하면 자동으로 기록됩니다.</div>
          </div>
        )}
      </div>

      <MobileBottomNav isOwner={true} />
    </>
  );
}
