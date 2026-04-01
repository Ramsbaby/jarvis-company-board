'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMPANIES, CATEGORIES, DIFFICULTIES, COMPANY_PASS_CRITERIA } from '@/lib/interview-data';
import { apiFetch } from '@/lib/api-fetch';
import { BetterAnswerSection } from '@/components/interview/BetterAnswerSection';

interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  better_answer: string | null;
  missing_keywords: string | null;
  created_at: string;
}

interface Session {
  id: string;
  company: string;
  category: string;
  difficulty: string;
  status: string;
  total_score: number | null;
  created_at: string;
  share_token?: string | null;
}

function parseJson<T>(str: string | null, fallback: T): T {
  try { return str ? JSON.parse(str) as T : fallback; } catch { return fallback; }
}

function scoreLabel(score: number): string {
  if (score >= 80) return '우수';
  if (score >= 60) return '보통';
  return '미흡';
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-zinc-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-500';
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-zinc-50 border-zinc-200';
  if (score >= 80) return 'bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

// SVG arc gauge: semicircle from 180deg to 0deg (left to right)
function ScoreGauge({ score }: { score: number }) {
  const size = 120;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = 44;
  const strokeWidth = 10;

  // Arc math: semicircle (180deg sweep)
  // Start: left (180deg), End: right (0deg)
  const startAngle = Math.PI; // 180deg
  const endAngle = 0;         // 0deg
  const totalAngle = Math.PI; // 180 degrees

  const scoreAngle = startAngle - (score / 100) * totalAngle;
  const trackStart = { x: cx + r * Math.cos(startAngle), y: cy + r * Math.sin(startAngle) };
  const trackEnd   = { x: cx + r * Math.cos(endAngle),   y: cy + r * Math.sin(endAngle) };

  const fillEnd = { x: cx + r * Math.cos(scoreAngle), y: cy + r * Math.sin(scoreAngle) };
  const largeArc = score > 50 ? 1 : 0;

  // Color by zone
  const gaugeColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const textColor  = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626';

  return (
    <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
      {/* Track */}
      <path
        d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
        fill="none"
        stroke="#e4e4e7"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Fill */}
      {score > 0 && (
        score >= 100 ? (
          <path
            d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x - 0.001} ${trackEnd.y}`}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ) : (
          <path
            d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )
      )}
      {/* Score text */}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize={22}
        fontWeight="900"
        fill={textColor}
        fontFamily="inherit"
      >
        {score}
      </text>
      {/* Label */}
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize={9} fill="#a1a1aa" fontFamily="inherit">
        / 100점
      </text>
    </svg>
  );
}

export default function ReportClient({
  session,
  messages,
  readOnly = false,
}: {
  session: Session;
  messages: Message[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [retryLoading, setRetryLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const result = await apiFetch<{ url: string; token: string }>(`/api/interview/sessions/${session.id}/share`, {
      method: 'POST',
    });
    if (!result.ok) return;
    const fullUrl = `${window.location.origin}${result.data.url}`;
    setShareUrl(fullUrl);
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      window.prompt('URL을 직접 복사하세요:', fullUrl);
    }
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const company = COMPANIES.find(c => c.id === session.company);
  const category = CATEGORIES.find(c => c.id === session.category);
  const difficulty = DIFFICULTIES.find(d => d.id === session.difficulty);

  const feedbacks = messages.filter(m => m.role === 'feedback');
  const answers = messages.filter(m => m.role === 'answer');
  const questions = messages.filter(m => m.role === 'question');
  const scores = feedbacks.map(f => f.score).filter((s): s is number => s != null);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const avgScoreRounded = avgScore != null ? Math.round(avgScore) : null;

  // 합격 판정 계산
  const criteria = COMPANY_PASS_CRITERIA[session.company];
  const passScore = criteria?.passScore ?? 75;
  const passed = avgScore != null && avgScore >= passScore;
  const passGap = avgScore != null ? Math.abs(avgScore - passScore) : 0;

  // 반복된 약점 집계
  const allWeaknesses = feedbacks.flatMap(f => parseJson<string[]>(f.weaknesses, []));
  const allMissingKw = feedbacks.flatMap(f => parseJson<string[]>(f.missing_keywords, []));
  // 중복 제거 후 상위 5개
  const topWeaknesses = [...new Set(allWeaknesses)].slice(0, 5);
  const topMissingKw = [...new Set(allMissingKw)].slice(0, 8);

  // 권고 메시지
  function getRecommendation(): string {
    if (avgScore == null) return '다음에도 꾸준히 연습해보세요.';
    const rounded = Math.round(avgScore);
    if (rounded >= 80) return `${category?.name} 카테고리는 충분합니다. 다음 필수 카테고리로 넘어가세요.`;
    if (rounded >= 60) return `기초는 있으나 심화가 부족합니다. ${category?.name} 동일 카테고리를 시니어 난이도로 재도전하세요.`;
    return `${category?.name} 카테고리 핵심 개념을 먼저 정리한 뒤 다시 도전하세요. 오늘 better_answer를 3번 읽고 내일 재시험을 권장합니다.`;
  }

  // Q&A 페어링 (question[i] + answer[i] + feedback[i])
  const pairs: Array<{ q: Message; a: Message | null; f: Message | null; idx: number }> = questions.map((q, i) => ({
    q,
    a: answers[i] ?? null,
    f: feedbacks[i] ?? null,
    idx: i + 1,
  }));

  // Quick action URL for retry
  const retryUrl = `/interview?company=${session.company}&category=${session.category}&difficulty=${session.difficulty}`;

  async function handleFocusRetry() {
    if (topMissingKw.length === 0) return;
    setRetryLoading(true);
    try {
      const result = await apiFetch<{ sessionId: string }>('/api/interview/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: session.company,
          category: session.category,
          difficulty: session.difficulty,
          focusKeywords: topMissingKw,
        }),
      });
      if (!result.ok) throw new Error(result.message);
      router.push(`/interview/${result.data.sessionId}`);
    } catch {
      setRetryLoading(false);
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-hidden { display: none !important; }
          nav, header, footer, [data-sidebar] { display: none !important; }
          @page { margin: 20mm; size: A4; }
        }
      ` }} />
      <div className="bg-zinc-50 min-h-screen">
        <header className="sticky top-0 z-10 bg-white border-b border-zinc-200 print-hidden">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/interview" className="text-zinc-400 hover:text-zinc-600 text-sm">← 면접 홈</Link>
            <span className="text-zinc-300">|</span>
            <h1 className="text-sm font-bold text-zinc-800">📊 세션 리포트</h1>
            <div className="ml-auto flex items-center gap-2">
              {!readOnly && (
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-medium transition-colors print-hidden"
                >
                  {copying ? '✅ 복사됨!' : '🔗 공유'}
                </button>
              )}
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors print-hidden"
              >
                📄 PDF 저장
              </button>
            </div>
          </div>
          {shareUrl && !readOnly && (
            <div className="max-w-3xl mx-auto px-4 pb-2 print-hidden">
              <p className="text-xs text-gray-500 break-all">{shareUrl}</p>
            </div>
          )}
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {/* 세션 메타 */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-2xl">{company?.emoji}</span>
              <div>
                <p className="font-bold text-zinc-900">{company?.name}</p>
                <p className="text-xs text-zinc-400">{category?.name} · {difficulty?.emoji} {difficulty?.name}</p>
              </div>
            </div>

            {/* 핵심 수치 — score gauge replaces plain number */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-50 rounded-xl p-3 flex flex-col items-center justify-center">
                {avgScoreRounded != null ? (
                  <ScoreGauge score={avgScoreRounded} />
                ) : (
                  <p className="text-3xl font-black text-zinc-400 tabular-nums">-</p>
                )}
                <p className="text-[11px] text-zinc-400 mt-0.5">평균 점수</p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className="text-3xl font-black text-zinc-800 tabular-nums">{feedbacks.length}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">문제 수</p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className={`text-lg font-bold ${scoreColor(avgScoreRounded)} mt-1`}>{avgScoreRounded != null ? scoreLabel(avgScoreRounded) : '-'}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">종합 평가</p>
              </div>
            </div>
          </div>

          {/* 권고사항 — 합격 판정 위에 먼저 표시 */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1">🎯 다음 액션</p>
            <p className="text-sm text-indigo-800 leading-relaxed">{getRecommendation()}</p>
          </div>

          {/* 합격 판정 카드 — more prominent */}
          {criteria && avgScore != null && (
            <div className={`rounded-2xl border-2 p-6 ${passed
              ? 'border-emerald-400 bg-emerald-50'
              : 'border-amber-400 bg-amber-50'}`}>
              <div className="flex flex-col items-center text-center gap-3">
                <span className="text-5xl">{passed ? '🎯' : '❌'}</span>
                <p className={`font-black text-2xl leading-tight ${passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {passed ? '합격 가능권!' : '불합격 — 재도전 필요'}
                </p>
                <p className={`text-sm font-semibold ${passed ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {passed
                    ? `기준 ${passScore}점 → 현재 ${Math.round(avgScore)}점 (+${Math.round(passGap)}점 초과)`
                    : `기준 ${passScore}점까지 ${Math.round(passGap)}점 부족`}
                </p>
                <p className="text-sm text-gray-600">{criteria.description}</p>
              </div>
              <div className="mt-4 bg-white bg-opacity-60 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">✅ 이 회사 합격 포인트</p>
                <ul className="space-y-1">
                  {criteria.tips.map((tip: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-emerald-500 shrink-0">•</span>{tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 반복 약점 */}
          {topWeaknesses.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider">❌ 이번 세션 주요 약점</p>
              <ul className="space-y-1.5">
                {topWeaknesses.map((w, i) => (
                  <li key={i} className="text-xs text-zinc-700 flex gap-2">
                    <span className="text-red-400 shrink-0 mt-0.5">•</span>{w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 미언급 키워드 */}
          {topMissingKw.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">🔑 전체 세션에서 언급 안 한 핵심 키워드</p>
              <div className="flex flex-wrap gap-1.5">
                {topMissingKw.map((kw, i) => (
                  <span key={i} className="text-[11px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-semibold">{kw}</span>
                ))}
              </div>
              <p className="text-[11px] text-orange-600 mt-1">위 키워드는 실제 면접에서 필수로 언급해야 합니다.</p>
            </div>
          )}

          {/* Q&A 타임라인 */}
          <div className="space-y-3">
            <p className="text-sm font-bold text-zinc-700">📝 문제별 점수</p>
            {pairs.map(({ q, a, f, idx }) => (
              <div key={q.id} className={`border rounded-xl p-4 space-y-2 ${scoreBg(f?.score ?? null)}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-semibold text-zinc-500">Q{idx}</p>
                  {f?.score != null && (
                    <span className={`text-lg font-black tabular-nums shrink-0 ${scoreColor(f.score)}`}>{f.score}점</span>
                  )}
                </div>
                <p className="text-xs text-zinc-700 leading-relaxed line-clamp-3">{q.content}</p>
                {a && (
                  <div className="bg-white rounded-lg p-2.5 border border-zinc-200">
                    <p className="text-[10px] font-semibold text-zinc-400 mb-1">내 답변</p>
                    <p className="text-xs text-zinc-700 leading-relaxed line-clamp-4 whitespace-pre-wrap">{a.content}</p>
                  </div>
                )}
                {f?.better_answer && (
                  <BetterAnswerSection
                    betterAnswer={f.better_answer}
                    score={f.score ?? 50}
                    missingKeywords={parseJson<string[]>(f.missing_keywords, [])}
                  />
                )}
              </div>
            ))}
          </div>

          {/* 하단 액션 */}
          {!readOnly && (
            <div className="space-y-3 pb-8 print-hidden">
              <div className="flex gap-3">
                <Link href={`/interview/${session.id}`}
                  className="flex-1 py-3 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-600 text-center hover:bg-zinc-50 transition-colors">
                  세션 다시 보기
                </Link>
                <Link href="/interview"
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold text-center hover:bg-indigo-700 transition-colors">
                  🎯 새 면접 시작
                </Link>
              </div>
              {/* Quick action buttons */}
              <div className="flex gap-3">
                <Link
                  href={retryUrl}
                  className="flex-1 py-3 rounded-xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 text-center hover:bg-amber-100 transition-colors"
                >
                  🔄 같은 카테고리 재도전
                </Link>
                <Link
                  href="/interview/notes"
                  className="flex-1 py-3 rounded-xl border border-red-300 bg-red-50 text-sm font-semibold text-red-700 text-center hover:bg-red-100 transition-colors"
                >
                  📓 오답노트 보기
                </Link>
              </div>
              {topMissingKw.length > 0 && (
                <button
                  onClick={handleFocusRetry}
                  disabled={retryLoading}
                  className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {retryLoading ? '준비 중...' : `💥 약점 집중 재도전 — ${topMissingKw.slice(0, 3).join(', ')} 집중 공략`}
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
