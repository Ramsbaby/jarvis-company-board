'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

function WeaknessWidget({ company }: { company: string }) {
  const [report, setReport] = useState<WeaknessReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<WeaknessReport>(`/api/interview/weakness-report?company=${company}&limit=20`)
      .then(res => { if (res.ok) setReport(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [company]);

  if (loading) return <div className="text-xs text-zinc-400 text-center py-2">약점 분석 중...</div>;
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
          <p className="text-[11px] text-zinc-400 mb-3">카테고리별 평균 점수 (낮은 순)</p>
          <div className="space-y-2">
            {report.category_breakdown.slice(0, 5).map(cat => {
              const catInfo = CATEGORIES.find(c => c.id === cat.category);
              return (
                <div key={cat.category} className="flex items-center gap-2">
                  <span className="text-sm">{catInfo?.emoji ?? '📂'}</span>
                  <span className="text-xs text-zinc-600 flex-1 truncate">{catInfo?.name ?? cat.category}</span>
                  <span className="text-[10px] text-zinc-400">{cat.session_count}회</span>
                  <span className={`text-sm font-bold tabular-nums ${catColor(cat.avg_score)}`}>{cat.avg_score}</span>
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

  useEffect(() => {
    apiFetch<TendencyData>(`/api/interview/tendency?company=${company}`)
      .then(res => { if (res.ok && res.data.total_answers > 0) setData(res.data); })
      .catch(() => {});
  }, [company]);

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
          {/* 70점 기준선 */}
          <line
            x1={0} y1={(1 - 70 / maxScore) * chartHeight}
            x2={svgWidth} y2={(1 - 70 / maxScore) * chartHeight}
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
        <p className="text-[10px] text-amber-500 mt-1">— 70점 기준선</p>
      </div>
    </div>
  );
}

function SessionHistory({ sessions }: { sessions: InterviewSession[] }) {
  if (sessions.length === 0) return null;
  const now = new Date().getTime();

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-zinc-700">📋 최근 면접 이력</h2>
      <div className="space-y-2">
        {sessions.map(s => {
          const company = COMPANIES.find(c => c.id === s.company);
          const category = CATEGORIES.find(c => c.id === s.category);
          const difficulty = DIFFICULTIES.find(d => d.id === s.difficulty);
          const isCompleted = s.status === 'completed';
          return (
            <Link
              key={s.id}
              href={`/interview/${s.id}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all group"
            >
              <div className="text-xl shrink-0">{company?.emoji ?? '🎯'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-800">{company?.name}</span>
                  <span className="text-[11px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">{category?.name}</span>
                  <span className="text-[11px] text-zinc-400">{difficulty?.emoji} {difficulty?.name}</span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{relativeTime(s.created_at, now)}</div>
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
              <span className="text-zinc-300 group-hover:text-zinc-500 transition-colors text-sm shrink-0">→</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function InterviewHomeClient({ sessions }: { sessions: InterviewSession[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [company, setCompany] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('mid');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch<{ sessionId: string }>('/api/interview/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, category, difficulty }),
      });
      if (!result.ok) throw new Error(result.message);
      router.push(`/interview/${result.data.sessionId}`);
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-600 text-sm">← 보드</Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-bold text-zinc-800">🎯 면접 시뮬레이터</h1>
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold ml-auto">카카오페이 서류합격 대비</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step > s ? 'bg-emerald-500 text-white' : step === s ? 'bg-indigo-600 text-white' : 'bg-zinc-200 text-zinc-400'}`}>
                {step > s ? '✓' : s}
              </div>
              <span className={`text-xs ${step === s ? 'text-zinc-800 font-semibold' : 'text-zinc-400'}`}>{['회사 선택', '카테고리', '난이도'][s - 1]}</span>
              {s < 3 && <div className="w-8 h-0.5 bg-zinc-200" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-zinc-800">어떤 회사 면접관과 연습하시겠습니까?</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {COMPANIES.map(c => (
                <button key={c.id} onClick={() => setCompany(c.id)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${company === c.id ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}>
                  {c.highlight && <span className="absolute top-2 right-2 text-[10px] bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full font-bold">서류합격</span>}
                  <div className="text-2xl mb-2">{c.emoji}</div>
                  <div className="text-sm font-bold text-zinc-800">{c.name}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 leading-tight">{c.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setStep(2)} disabled={!company} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors">다음 →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-zinc-800">어떤 카테고리로 시작하시겠습니까?</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setCategory(cat.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${category === cat.id ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}>
                  <span className="text-xl shrink-0">{cat.emoji}</span>
                  <div>
                    <div className="text-sm font-semibold text-zinc-800 flex items-center gap-1">
                      {cat.name}
                      {cat.priority === 1 && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold">필수</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400">{cat.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="text-sm text-zinc-500 hover:text-zinc-700">← 뒤로</button>
              <button onClick={() => setStep(3)} disabled={!category} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-indigo-700 transition-colors">다음 →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-base font-bold text-zinc-800">난이도를 선택하세요</h2>
            <div className="grid grid-cols-3 gap-3">
              {DIFFICULTIES.map(d => (
                <button key={d.id} onClick={() => setDifficulty(d.id)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${difficulty === d.id ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}>
                  <div className="text-2xl mb-1">{d.emoji}</div>
                  <div className="text-sm font-bold text-zinc-800">{d.name}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{d.desc}</div>
                </button>
              ))}
            </div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-sm text-zinc-600 space-y-1">
              <div>🏢 회사: <span className="font-semibold text-zinc-800">{COMPANIES.find(c => c.id === company)?.name}</span></div>
              <div>📂 카테고리: <span className="font-semibold text-zinc-800">{CATEGORIES.find(c => c.id === category)?.name}</span></div>
              <div>📊 난이도: <span className="font-semibold text-zinc-800">{DIFFICULTIES.find(d => d.id === difficulty)?.name}</span></div>
            </div>
            {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="text-sm text-zinc-500 hover:text-zinc-700">← 뒤로</button>
              <button onClick={handleStart} disabled={loading} className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {loading ? '면접 준비 중...' : '🎯 면접 시작'}
              </button>
            </div>
          </div>
        )}

        {/* 점수 히스토리 차트 */}
        <ScoreHistoryChart sessions={sessions} onNavigate={(id) => router.push(`/interview/${id}/report`)} />

        {/* 반복 약점 분석 위젯 — 카카오페이 세션 데이터 기반 */}
        <WeaknessWidget company="kakaopay" />

        {/* 성향 분석 + 오답노트 바로가기 */}
        <TendencyWidget company="kakaopay" />

        {/* 면접 이력 */}
        <SessionHistory sessions={sessions} />
      </main>
    </div>
  );
}
