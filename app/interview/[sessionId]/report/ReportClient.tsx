'use client';
import Link from 'next/link';
import { useState } from 'react';
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

export default function ReportClient({
  session,
  messages,
  readOnly = false,
}: {
  session: Session;
  messages: Message[];
  readOnly?: boolean;
}) {
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
    await navigator.clipboard.writeText(fullUrl).catch(() => {});
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const company = COMPANIES.find(c => c.id === session.company);
  const category = CATEGORIES.find(c => c.id === session.category);
  const difficulty = DIFFICULTIES.find(d => d.id === session.difficulty);

  const feedbacks = messages.filter(m => m.role === 'feedback');
  const questions = messages.filter(m => m.role === 'question');
  const scores = feedbacks.map(f => f.score).filter((s): s is number => s != null);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

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
  const pairs: Array<{ q: Message; f: Message | null; idx: number }> = questions.map((q, i) => ({
    q,
    f: feedbacks[i] ?? null,
    idx: i + 1,
  }));

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
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium transition-colors print-hidden"
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

            {/* 핵심 수치 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className={`text-3xl font-black tabular-nums ${scoreColor(avgScore != null ? Math.round(avgScore) : null)}`}>{avgScore != null ? Math.round(avgScore) : '-'}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">평균 점수</p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className="text-3xl font-black text-zinc-800 tabular-nums">{feedbacks.length}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">문제 수</p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3 text-center">
                <p className={`text-lg font-bold ${scoreColor(avgScore != null ? Math.round(avgScore) : null)} mt-1`}>{avgScore != null ? scoreLabel(Math.round(avgScore)) : '-'}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">종합 평가</p>
              </div>
            </div>
          </div>

          {/* 합격 판정 카드 */}
          {criteria && avgScore != null && (
            <div className={`rounded-xl border-2 p-5 mb-6 ${passed
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-amber-300 bg-amber-50'}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{passed ? '🎯' : '📈'}</span>
                <div>
                  <p className={`font-bold text-lg ${passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {passed
                      ? `합격 가능권 (기준 ${passScore}점 → 현재 ${Math.round(avgScore)}점, +${Math.round(passGap)}점)`
                      : `합격까지 ${Math.round(passGap)}점 부족 (기준 ${passScore}점)`}
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">{criteria.description}</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">✅ 이 회사 합격 포인트</p>
                <ul className="space-y-1">
                  {criteria.tips.map((tip, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-emerald-500">•</span>{tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 권고사항 */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1">🎯 다음 액션</p>
            <p className="text-sm text-indigo-800 leading-relaxed">{getRecommendation()}</p>
          </div>

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
            {pairs.map(({ q, f, idx }) => (
              <div key={q.id} className={`border rounded-xl p-4 space-y-2 ${scoreBg(f?.score ?? null)}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-semibold text-zinc-500">Q{idx}</p>
                  {f?.score != null && (
                    <span className={`text-lg font-black tabular-nums shrink-0 ${scoreColor(f.score)}`}>{f.score}점</span>
                  )}
                </div>
                <p className="text-xs text-zinc-700 leading-relaxed line-clamp-3">{q.content}</p>
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
            <div className="flex gap-3 pb-8 print-hidden">
              <Link href={`/interview/${session.id}`}
                className="flex-1 py-3 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-600 text-center hover:bg-zinc-50 transition-colors">
                세션 다시 보기
              </Link>
              <Link href="/interview"
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold text-center hover:bg-indigo-700 transition-colors">
                🎯 새 면접 시작
              </Link>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
