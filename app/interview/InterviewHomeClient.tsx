'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { COMPANIES, CATEGORIES, DIFFICULTIES } from '@/lib/interview-data';
import { apiFetch } from '@/lib/api-fetch';

interface WeaknessEntry {
  keyword: string;
  miss_count: number;
  affected_sessions: number;
  avg_score_when_missed: number | null;
  severity: 'high' | 'medium' | 'low';
}

interface CategoryBreakdown {
  category: string;
  session_count: number;
  avg_score: number;
}

interface WeaknessReport {
  company: string;
  session_count: number;
  top_weaknesses: WeaknessEntry[];
  category_breakdown: CategoryBreakdown[];
}

// ── D-Day 배너 ─────────────────────────────────────────────────────────────
const DDAY_KEY = 'kakaopay_interview_date';

function DdayBanner() {
  const [dday, setDday] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem(DDAY_KEY);
    if (!saved) return null;
    return Math.ceil((new Date(saved).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  });
  const [editing, setEditing] = useState(false);
  const [inputDate, setInputDate] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(DDAY_KEY) ?? '';
  });

  function handleSave() {
    if (!inputDate) return;
    localStorage.setItem(DDAY_KEY, inputDate);
    const diff = Math.ceil((new Date(inputDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    setDday(diff);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-xl px-3 py-1.5 ml-auto">
        <span className="text-[11px] text-zinc-500 shrink-0">면접일</span>
        <input
          type="date"
          value={inputDate}
          onChange={e => setInputDate(e.target.value)}
          className="text-[11px] border border-zinc-200 rounded px-2 py-0.5 w-32"
        />
        <button onClick={handleSave} className="text-[11px] bg-indigo-600 text-white px-2 py-0.5 rounded font-semibold">저장</button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-zinc-400">✕</button>
      </div>
    );
  }

  if (dday === null) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[11px] text-zinc-400 hover:text-indigo-500 transition-colors ml-auto flex items-center gap-1"
      >
        📅 D-day 설정
      </button>
    );
  }

  const label = dday < 0 ? `D+${Math.abs(dday)}` : dday === 0 ? 'D-Day!' : `D-${dday}`;
  const urgencyClass =
    dday <= 3  ? 'bg-red-500 text-white' :
    dday <= 7  ? 'bg-amber-500 text-white' :
    dday <= 14 ? 'bg-orange-100 text-orange-700' :
                 'bg-indigo-100 text-indigo-700';

  return (
    <button
      onClick={() => setEditing(true)}
      className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ml-auto ${urgencyClass}`}
      title="클릭하여 날짜 수정"
    >
      카카오페이 {label}
    </button>
  );
}

// ── 오늘의 추천 카드 ──────────────────────────────────────────────────────
const KEYWORD_TO_CATEGORY: Array<{ patterns: string[]; category: string }> = [
  { patterns: ['SAGA', 'saga', '분산트랜잭션', '2PC', '보상트랜잭션', 'outbox', 'TCC', '분산 트랜잭션'], category: 'distributed-tx' },
  { patterns: ['멱등', '이중결제', '정산', '결제정합성', '환불', '취소', '결제'], category: 'payment-arch' },
  { patterns: ['동시성', '데드락', '락', 'race', '낙관적', '비관적', '경쟁조건'], category: 'concurrency' },
  { patterns: ['kafka', 'Kafka', '컨슈머', '파티션', '오프셋', '메시지큐', 'consumer'], category: 'kafka' },
  { patterns: ['캐시', '스케일', 'index', '인덱스', '아키텍처', 'DB', 'redis', 'Redis'], category: 'system-design' },
];

function mapKeywordToCategory(keyword: string): string {
  const lower = keyword.toLowerCase();
  for (const { patterns, category } of KEYWORD_TO_CATEGORY) {
    if (patterns.some(p => lower.includes(p.toLowerCase()))) return category;
  }
  return 'distributed-tx';
}

interface TodayRecommendProps {
  onStart: (overrides: { company: string; category: string; difficulty: string; mode?: string }) => void;
  loading: boolean;
}

function TodayRecommendCard({ onStart, loading }: TodayRecommendProps) {
  const [rec, setRec] = useState<{ keyword: string; category: string; count: number; severity: string } | null>(null);
  const [recLoading, setRecLoading] = useState(true);

  useEffect(() => {
    apiFetch<WeaknessReport>('/api/interview/weakness-report?company=kakaopay&limit=20')
      .then(res => {
        if (res.ok && res.data.top_weaknesses?.length > 0) {
          const top = res.data.top_weaknesses.find(w => w.severity === 'high') ?? res.data.top_weaknesses[0];
          setRec({
            keyword: top.keyword,
            category: mapKeywordToCategory(top.keyword),
            count: top.miss_count,
            severity: top.severity,
          });
        }
      })
      .catch(() => {})
      .finally(() => setRecLoading(false));
  }, []);

  if (!rec) {
    if (!recLoading) return null;
    return (
      <div className="rounded-2xl p-5 space-y-3 border-2 border-zinc-100 bg-white animate-pulse">
        <div className="h-3 bg-zinc-100 rounded w-1/3" />
        <div className="h-5 bg-zinc-100 rounded w-2/3 mt-2" />
        <div className="h-9 bg-zinc-100 rounded-xl mt-3" />
      </div>
    );
  }

  const catInfo = CATEGORIES.find(c => c.id === rec.category);

  return (
    <div className="rounded-2xl p-5 space-y-3 border-2 border-red-200" style={{ background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)' }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">🎯 오늘의 추천</span>
            <span className="text-[10px] text-red-500 font-semibold">{rec.count}회 반복 약점</span>
          </div>
          <p className="font-black text-red-900 text-base leading-tight">
            {catInfo?.emoji} {catInfo?.name ?? rec.category}
          </p>
          <p className="text-xs text-red-700 mt-1.5 leading-relaxed">
            <strong className="bg-red-200 px-1 rounded">{rec.keyword}</strong> 집중 공략 — 시니어 압박 면접
          </p>
        </div>
      </div>
      <button
        onClick={() => onStart({ company: 'kakaopay', category: rec.category, difficulty: 'senior' })}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {loading ? '준비 중...' : '지금 바로 공략 →'}
      </button>
    </div>
  );
}

// ── 반복 약점 위젯 ────────────────────────────────────────────────────────
function WeaknessWidget({ company }: { company: string }) {
  const [report, setReport] = useState<WeaknessReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<WeaknessReport>(`/api/interview/weakness-report?company=${company}&limit=20`)
      .then(res => { if (res.ok) setReport(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [company]);

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-4 bg-zinc-100 rounded w-32" />
        <div className="h-4 bg-zinc-100 rounded-full w-16" />
      </div>
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-1.5">
          {[1,2,3,4,5].map(i => <div key={i} className="h-6 bg-zinc-100 rounded-lg w-16" />)}
        </div>
      </div>
      <div className="bg-white border border-zinc-200 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-1.5">
          {[1,2,3,4].map(i => <div key={i} className="h-10 bg-zinc-100 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
  if (!report || report.session_count === 0) return null;

  const sevColor = (s: string) =>
    s === 'high' ? 'bg-red-100 text-red-700 border-red-200' :
    s === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    'bg-zinc-100 text-zinc-500 border-zinc-200';

  const catColor = (score: number) =>
    score >= 75 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-500';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-zinc-700">🔍 반복 약점 분석</h2>
        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">{report.session_count}회 세션 기반</span>
      </div>

      {report.top_weaknesses.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
          <p className="text-[11px] text-zinc-400 mb-3">자주 놓치는 키워드 — 집중 보완 필요</p>
          <div className="flex flex-wrap gap-1.5">
            {report.top_weaknesses.slice(0, 10).map(w => (
              <span key={w.keyword}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold ${sevColor(w.severity)}`}>
                {w.keyword}
                <span className="font-normal opacity-70">×{w.miss_count}</span>
              </span>
            ))}
          </div>
          {report.top_weaknesses[0]?.severity === 'high' && (
            <p className="text-[11px] text-red-500 font-medium mt-2">
              ⚠️ <strong>{report.top_weaknesses[0].keyword}</strong>을 {report.top_weaknesses[0].miss_count}번 연속 놓쳤습니다. 최우선 학습 필요.
            </p>
          )}
        </div>
      )}

      {report.category_breakdown.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-[11px] text-zinc-400 mb-3">카테고리별 점수 히트맵 <span className="text-zinc-300">— 붉을수록 집중 보완 필요</span></p>
          <div className="grid grid-cols-2 gap-1.5">
            {report.category_breakdown.map(cat => {
              const catInfo = CATEGORIES.find(c => c.id === cat.category);
              const cellColor = cat.avg_score >= 75
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : cat.avg_score >= 60
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-800';
              const scoreColor = cat.avg_score >= 75 ? 'text-emerald-600' : cat.avg_score >= 60 ? 'text-amber-600' : 'text-red-600';
              return (
                <div key={cat.category} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${cellColor}`}>
                  <span className="text-base shrink-0">{catInfo?.emoji ?? '📂'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium truncate">{catInfo?.name ?? cat.category}</p>
                    <p className="text-[10px] text-zinc-400">{cat.session_count}회</p>
                  </div>
                  <span className={`text-base font-black tabular-nums shrink-0 ${scoreColor}`}>{cat.avg_score}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// 모듈 레벨 순수 함수 — 렌더 중 불순 함수 호출 방지
function relativeTime(dateStr: string, now: number): string {
  const diff = now - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

interface InterviewSession {
  id: string;
  company: string;
  category: string;
  difficulty: string;
  status: string;
  total_score: number | null;
  created_at: string;
  completed_at: string | null;
  last_activity_at: string;
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-zinc-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-500';
}

interface TendencyData {
  total_answers: number;
  avg_score: number;
  score_distribution: { over80: number; over60: number; under60: number };
  top_strengths: Array<{ text: string; count: number }>;
  top_weaknesses: Array<{ text: string; count: number }>;
  tendency_diagnosis: string[];
}

function TendencyWidget({ company }: { company: string }) {
  const [data, setData] = useState<TendencyData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<TendencyData>(`/api/interview/tendency?company=${company}`)
      .then(res => { if (res.ok && res.data.total_answers > 0) setData(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [company]);

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-zinc-100 rounded w-28" />
      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="h-3 bg-zinc-100 rounded w-full" />
        <div className="h-3 bg-zinc-100 rounded w-3/4" />
        <div className="h-3 bg-zinc-100 rounded w-1/2" />
      </div>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-zinc-700">🧬 나의 답변 성향</h2>
          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{data.total_answers}개 답변 분석</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/interview/notes" className="text-[11px] bg-red-100 text-red-600 px-2 py-1 rounded-lg font-semibold hover:bg-red-200 transition-colors">
            📓 오답노트 →
          </Link>
          <button onClick={() => setOpen(v => !v)} className="text-[11px] text-zinc-400 hover:text-zinc-600">
            {open ? '접기 ▲' : '상세 ▼'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        {/* 점수 분포 바 */}
        <div className="space-y-1">
          <p className="text-[10px] text-zinc-400">점수 분포 (전체 {data.total_answers}개)</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {data.score_distribution.over80 > 0 && (
              <div className="bg-emerald-400" style={{ flex: data.score_distribution.over80 }} title={`80점+ : ${data.score_distribution.over80}개`} />
            )}
            {data.score_distribution.over60 > 0 && (
              <div className="bg-amber-400" style={{ flex: data.score_distribution.over60 }} title={`60~79점 : ${data.score_distribution.over60}개`} />
            )}
            {data.score_distribution.under60 > 0 && (
              <div className="bg-red-400" style={{ flex: data.score_distribution.under60 }} title={`60점 미만 : ${data.score_distribution.under60}개`} />
            )}
          </div>
          <div className="flex gap-3 text-[10px] text-zinc-400">
            <span><span className="text-emerald-500">●</span> 80+ ({data.score_distribution.over80})</span>
            <span><span className="text-amber-500">●</span> 60~79 ({data.score_distribution.over60})</span>
            <span><span className="text-red-400">●</span> ~59 ({data.score_distribution.under60})</span>
          </div>
        </div>

        {/* 성향 진단 */}
        {data.tendency_diagnosis.length > 0 && (
          <div className="space-y-1">
            {data.tendency_diagnosis.map((d, i) => (
              <p key={i} className="text-xs text-zinc-700 leading-relaxed">{d}</p>
            ))}
          </div>
        )}

        {open && (
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            {data.top_strengths.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-emerald-600 mb-1.5">✅ 반복 강점 패턴</p>
                <ul className="space-y-1">
                  {data.top_strengths.map((s, i) => (
                    <li key={i} className="text-xs text-zinc-600 flex gap-1.5">
                      <span className="text-emerald-400 shrink-0">•</span>
                      <span className="truncate">{s.text}</span>
                      <span className="text-[10px] text-zinc-400 shrink-0">×{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.top_weaknesses.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-red-500 mb-1.5">❌ 반복 약점 패턴</p>
                <ul className="space-y-1">
                  {data.top_weaknesses.map((w, i) => (
                    <li key={i} className="text-xs text-zinc-600 flex gap-1.5">
                      <span className="text-red-400 shrink-0">•</span>
                      <span className="truncate">{w.text}</span>
                      <span className="text-[10px] text-zinc-400 shrink-0">×{w.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreHistoryChart({ sessions, onNavigate }: { sessions: InterviewSession[]; onNavigate: (id: string) => void }) {
  const recentSessions = sessions
    .filter(s => s.status === 'completed' && s.total_score != null)
    .slice(0, 10)
    .reverse(); // 오래된 것이 왼쪽

  if (recentSessions.length === 0) return null;

  const maxScore = 100;
  const chartHeight = 80;
  const barWidth = 24;
  const gap = 8;
  const svgWidth = recentSessions.length * (barWidth + gap);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-zinc-700">📈 점수 추이 (최근 {recentSessions.length}회)</h2>
      <div className="bg-white border border-zinc-200 rounded-xl p-4 overflow-x-auto">
        <svg width={svgWidth} height={chartHeight + 30} className="block">
          {/* 75점 기준선 */}
          <line
            x1={0} y1={(1 - 75 / maxScore) * chartHeight}
            x2={svgWidth} y2={(1 - 75 / maxScore) * chartHeight}
            stroke="#fbbf24" strokeDasharray="4,4" strokeWidth={1}
          />
          {recentSessions.map((s, i) => {
            const score = s.total_score ?? 0;
            const barH = (score / maxScore) * chartHeight;
            const x = i * (barWidth + gap);
            const y = chartHeight - barH;
            const color = score >= 80 ? '#10b981' : score >= 65 ? '#f59e0b' : '#ef4444';
            const company = COMPANIES.find(c => c.id === s.company);
            return (
              <g key={s.id} className="cursor-pointer" onClick={() => onNavigate(s.id)}>
                <title>{company?.name} · {score}점</title>
                <rect x={x} y={y} width={barWidth} height={barH} fill={color} rx={4} opacity={0.85} />
                <text x={x + barWidth / 2} y={chartHeight + 14} textAnchor="middle" fontSize={10} fill="#6b7280">
                  {Math.round(score)}
                </text>
                <text x={x + barWidth / 2} y={chartHeight + 26} textAnchor="middle" fontSize={9} fill="#9ca3af">
                  {company?.emoji ?? ''}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="text-[10px] text-amber-500 mt-1">— 75점 기준선</p>
      </div>
    </div>
  );
}

function SessionHistory({ sessions, onDelete }: { sessions: InterviewSession[]; onDelete: (id: string) => void }) {
  const now = new Date().getTime();
  // 삭제 확인 중인 세션 ID
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    // 두 번째 클릭 → 실제 삭제
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/interview/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(id);
      }
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-700">📋 최근 면접 이력</h2>
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-3xl">🚀</p>
          <p className="text-sm font-semibold text-zinc-700">아직 면접 기록이 없습니다. 첫 세션을 시작해보세요! 🚀</p>
          <p className="text-xs text-zinc-400">위의 퀵스타트 버튼을 눌러 바로 시작할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-zinc-700">📋 최근 면접 이력</h2>
      <div className="space-y-2">
        {sessions.map(s => {
          const company = COMPANIES.find(c => c.id === s.company);
          const category = CATEGORIES.find(c => c.id === s.category);
          const difficulty = DIFFICULTIES.find(d => d.id === s.difficulty);
          const isCompleted = s.status === 'completed';
          const isConfirming = confirmId === s.id;
          const isDeleting = deletingId === s.id;
          return (
            <div key={s.id} className="relative group">
              <Link
                href={`/interview/${s.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all"
              >
                <div className="text-xl shrink-0">{company?.emoji ?? '🎯'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-800">{company?.name}</span>
                    <span className="text-[11px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">{category?.name}</span>
                    <span className="text-[11px] text-zinc-400">{difficulty?.emoji} {difficulty?.name}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{relativeTime(s.last_activity_at ?? s.created_at, now)}</div>
                </div>
                <div className="shrink-0 text-right">
                  {isCompleted ? (
                    <div>
                      <span className={`text-lg font-black tabular-nums ${scoreColor(s.total_score)}`}>
                        {s.total_score ?? '-'}
                      </span>
                      <span className="text-[11px] text-zinc-400 ml-0.5">점</span>
                    </div>
                  ) : s.status === 'abandoned' ? (
                    <span className="text-[11px] bg-zinc-100 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">시간초과</span>
                  ) : (
                    <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">진행중</span>
                  )}
                </div>
                {/* 삭제 버튼 — 항상 표시 (모바일 대응) */}
                <button
                  onClick={(e) => handleDelete(s.id, e)}
                  disabled={isDeleting}
                  className={`shrink-0 ml-1 w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-all
                    ${isConfirming
                      ? 'bg-red-500 text-white'
                      : 'bg-zinc-100 text-zinc-400 hover:bg-red-100 hover:text-red-500 active:bg-red-200'
                    }
                    ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  title={isConfirming ? '한 번 더 클릭하면 삭제됩니다' : '세션 삭제'}
                >
                  {isDeleting ? '…' : isConfirming ? '✕' : '🗑'}
                </button>
              </Link>
              {/* 확인 취소 — 다른 곳 클릭 시 */}
              {isConfirming && (
                <button
                  onClick={(e) => { e.preventDefault(); setConfirmId(null); }}
                  className="absolute right-0 -bottom-5 text-[10px] text-zinc-400 hover:text-zinc-600 px-2"
                >
                  취소
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 섹션 구분선 ──────────────────────────────────────────────────────────────
function SectionDivider({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold tracking-[0.12em] text-zinc-400 uppercase shrink-0">{label}</span>
      <div className="flex-1 h-px bg-zinc-200" />
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default function InterviewHomeClient({ sessions: initialSessions }: { sessions: InterviewSession[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    const c = searchParams?.get('company');
    const cat = searchParams?.get('category');
    if (c && cat) return 3;
    if (c) return 2;
    return 1;
  });
  const [company, setCompany] = useState(() => searchParams?.get('company') ?? '');
  const [category, setCategory] = useState(() => searchParams?.get('category') ?? '');
  const [difficulty, setDifficulty] = useState(() => searchParams?.get('difficulty') ?? 'mid');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCustom, setShowCustom] = useState(() => !!(searchParams?.get('company')));
  // 삭제 후 즉시 UI 반영을 위한 로컬 세션 상태
  const [sessions, setSessions] = useState<InterviewSession[]>(initialSessions);

  const primaryCompany = useMemo(() => {
    if (sessions.length === 0) return 'kakaopay';
    const counts: Record<string, number> = {};
    sessions.forEach(s => { counts[s.company] = (counts[s.company] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'kakaopay';
  }, [sessions]);

  // 🔥 연속 면접 스트릭 계산
  const streak = useMemo(() => {
    const dates = sessions
      .filter(s => s.status === 'completed')
      .map(s => new Date(s.last_activity_at ?? s.created_at).toDateString());
    const unique = [...new Set(dates)].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (unique.length === 0) return 0;
    const todayStr = new Date().toDateString();
    const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
    if (unique[0] !== todayStr && unique[0] !== yesterdayStr) return 0;
    let count = 1;
    for (let i = 1; i < unique.length; i++) {
      const prev = new Date(unique[i - 1]);
      const curr = new Date(unique[i]);
      const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
      if (diff === 1) count++;
      else break;
    }
    return count;
  }, [sessions]);

  function handleDeleteSession(id: string) {
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function handleStart(overrides?: { company: string; category: string; difficulty: string; mode?: string }) {
    const co = overrides?.company ?? company;
    const ca = overrides?.category ?? category;
    const di = overrides?.difficulty ?? difficulty;
    const mo = overrides?.mode;
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ sessionId: string }>('/api/interview/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: co, category: ca, difficulty: di }),
      });
      if (!result.ok) throw new Error(result.message);
      const url = mo ? `/interview/${result.data.sessionId}?mode=${mo}` : `/interview/${result.data.sessionId}`;
      router.push(url);
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  // Sort categories: priority=1 first
  const sortedCategories = [...CATEGORIES].sort((a, b) => {
    const pa = (a as { priority?: number }).priority ?? 99;
    const pb = (b as { priority?: number }).priority ?? 99;
    return pa - pb;
  });

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-600 text-sm">← 보드</Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-bold text-zinc-800">🎯 면접 시뮬레이터</h1>
          {streak >= 2 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full font-bold shrink-0">🔥 {streak}일 연속</span>
          )}
          <DdayBanner />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">

        {/* ═══════════════ 빠른 시작 ═══════════════ */}
        <section className="space-y-3">
          <SectionDivider label="빠른 시작" />

          {/* 오늘의 추천 — 약점 기반 자동 추천 */}
          <TodayRecommendCard onStart={handleStart} loading={loading} />

          {/* 2열 드릴 그리드 */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleStart({ company: 'kakaopay', category: 'distributed-tx', difficulty: 'senior', mode: 'micro' })}
              disabled={loading}
              className="flex flex-col gap-3 px-4 py-4 rounded-2xl border-2 border-amber-200 bg-white hover:bg-amber-50 hover:border-amber-300 disabled:opacity-50 transition-all text-left"
            >
              <span className="text-xl">⚡</span>
              <div>
                <p className="text-sm font-black text-zinc-800">8분 집중 드릴</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">3문제 · 시니어 압박</p>
              </div>
            </button>

            {/*
              라이브코딩 드릴 — 현재 비활성 (2026-04-17).
              POST /api/interview/live-coding 라우트 미구현 상태에서 클릭 시 런타임 404가 발생해
              임시로 disabled 처리. API 구현 후 이 버튼 onClick 핸들러를 복구하고 타이틀/서브텍스트 원복할 것.
              이전 동작: onClick 내부에서 apiFetch POST → router.push(`/interview/live-coding/${sessionId}`)
            */}
            <button
              type="button"
              disabled
              title="라이브코딩 API 구현 대기 중"
              className="flex flex-col gap-3 px-4 py-4 rounded-2xl border-2 border-indigo-100 bg-white/60 opacity-60 cursor-not-allowed text-left"
            >
              <span className="text-xl">💻</span>
              <div>
                <p className="text-sm font-black text-zinc-800">라이브코딩 드릴</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">30분 · Java · 준비중 🔜</p>
              </div>
            </button>
          </div>

          {/* 카카오페이 추천 조합 — 다크 CTA */}
          <button
            onClick={() => handleStart({ company: 'kakaopay', category: 'distributed-tx', difficulty: 'senior' })}
            disabled={loading}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-base">🎯</span>
              <div className="text-left">
                <p className="text-sm font-black">카카오페이 추천 조합</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">분산 트랜잭션 · 시니어 난이도 — 핵심 출제 영역</p>
              </div>
            </div>
            <span className="text-zinc-400 font-bold">{loading ? '...' : '→'}</span>
          </button>
        </section>

        {/* ═══════════════ 직접 설정 ═══════════════ */}
        <section>
          <button
            onClick={() => { setShowCustom(v => !v); if (showCustom) setStep(1); }}
            className="w-full flex items-center gap-3 text-left group"
          >
            <span className="text-[10px] font-bold tracking-[0.12em] text-zinc-400 uppercase shrink-0 group-hover:text-zinc-600 transition-colors">직접 설정</span>
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-[11px] text-zinc-400 shrink-0 group-hover:text-zinc-600 transition-colors">
              {showCustom ? '접기 ▲' : '직접 선택 ▼'}
            </span>
          </button>

          {showCustom && (
            <div className="mt-5 space-y-5 p-5 bg-white border border-zinc-200 rounded-2xl">
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step > s ? 'bg-emerald-500 text-white' : step === s ? 'bg-indigo-600 text-white' : 'bg-zinc-200 text-zinc-400'}`}>
                      {step > s ? '✓' : s}
                    </div>
                    <span className={`text-xs transition-colors ${step === s ? 'text-zinc-800 font-semibold' : 'text-zinc-400'}`}>
                      {['회사 선택', '카테고리', '난이도'][s - 1]}
                    </span>
                    {s < 3 && <div className="w-8 h-0.5 bg-zinc-200" />}
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-zinc-700">어떤 회사 면접관과 연습하시겠습니까?</p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {COMPANIES.map(c => (
                      <button key={c.id} onClick={() => setCompany(c.id)}
                        className={`relative p-3.5 rounded-xl border-2 text-left transition-all ${company === c.id ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white'}`}>
                        {c.highlight && <span className="absolute top-2 right-2 text-[10px] bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full font-bold">서류합격</span>}
                        <div className="text-2xl mb-1.5">{c.emoji}</div>
                        <div className="text-sm font-bold text-zinc-800">{c.name}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 leading-tight">{c.desc}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => setStep(2)} disabled={!company}
                      className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                      다음 →
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-zinc-700">카테고리를 선택하세요</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sortedCategories.map(cat => {
                      const isPriority = (cat as { priority?: number }).priority === 1;
                      return (
                        <button key={cat.id} onClick={() => setCategory(cat.id)}
                          className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${category === cat.id ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50' : isPriority ? 'border-red-200 bg-red-50 hover:border-red-300' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white'}`}>
                          <span className="text-xl shrink-0">{cat.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5 flex-wrap">
                              {cat.name}
                              {isPriority && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                                  🔥 필수
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400">{cat.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-between">
                    <button onClick={() => setStep(1)} className="text-sm text-zinc-500 hover:text-zinc-700">← 뒤로</button>
                    <button onClick={() => setStep(3)} disabled={!category}
                      className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                      다음 →
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <p className="text-sm font-semibold text-zinc-700">난이도를 선택하세요</p>
                  <div className="grid grid-cols-3 gap-3">
                    {DIFFICULTIES.map(d => (
                      <button key={d.id} onClick={() => setDifficulty(d.id)}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${difficulty === d.id ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-white'}`}>
                        <div className="text-2xl mb-1">{d.emoji}</div>
                        <div className="text-sm font-bold text-zinc-800">{d.name}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">{d.desc}</div>
                      </button>
                    ))}
                  </div>
                  {/* 선택 요약 */}
                  <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500 bg-zinc-50 rounded-xl px-4 py-3 border border-zinc-200">
                    <span>{COMPANIES.find(c => c.id === company)?.emoji} {COMPANIES.find(c => c.id === company)?.name}</span>
                    <span className="text-zinc-300">·</span>
                    <span>{CATEGORIES.find(c => c.id === category)?.name}</span>
                    <span className="text-zinc-300">·</span>
                    <span>{DIFFICULTIES.find(d => d.id === difficulty)?.name}</span>
                  </div>
                  {difficulty === 'senior' && (
                    <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <span className="shrink-0 text-sm">⚠️</span>
                      <p className="text-xs text-amber-800 font-semibold">시니어 압박 면접 — 정답도 더 파고듭니다</p>
                    </div>
                  )}
                  {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
                  <div className="flex justify-between">
                    <button onClick={() => setStep(2)} className="text-sm text-zinc-500 hover:text-zinc-700">← 뒤로</button>
                    <button onClick={() => handleStart()} disabled={loading}
                      className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                      {loading ? '면접 준비 중...' : '🎯 면접 시작'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ═══════════════ 내 성과 ═══════════════ */}
        <section className="space-y-4">
          <SectionDivider label="내 성과" />
          {sessions.filter(s => s.status === 'completed').length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-2">
              <p className="text-2xl">📈</p>
              <p className="text-sm font-semibold text-zinc-600">아직 완료된 세션이 없습니다</p>
              <p className="text-xs text-zinc-400">첫 면접을 완료하면 점수 추이가 여기에 표시됩니다</p>
            </div>
          ) : (
            <>
              <ScoreHistoryChart sessions={sessions} onNavigate={(id) => router.push(`/interview/${id}/report`)} />
              <WeaknessWidget company={primaryCompany} />
            </>
          )}
        </section>

        {/* ═══════════════ 심층 분석 ═══════════════ */}
        <section className="space-y-4">
          <SectionDivider label="심층 분석" />
          {sessions.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-2">
              <p className="text-2xl">🧬</p>
              <p className="text-sm font-semibold text-zinc-600">답변 성향 분석 대기 중</p>
              <p className="text-xs text-zinc-400">3개 이상의 답변 후 성향이 분석됩니다</p>
            </div>
          ) : (
            <TendencyWidget company={primaryCompany} />
          )}
        </section>

        {/* ═══════════════ 면접 이력 ═══════════════ */}
        <section className="space-y-3">
          <SectionDivider label="면접 이력" />
          <SessionHistory sessions={sessions} onDelete={handleDeleteSession} />
        </section>

      </main>
    </div>
  );
}
