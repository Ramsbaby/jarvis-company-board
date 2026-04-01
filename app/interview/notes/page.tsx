'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CATEGORIES, DIFFICULTIES } from '@/lib/interview-data';
import { apiFetch } from '@/lib/api-fetch';
import { BetterAnswerSection } from '@/components/interview/BetterAnswerSection';

interface NoteItem {
  feedback_id: string;
  session_id: string;
  difficulty: string;
  question: string;
  score: number;
  weaknesses: string[];
  missing_keywords: string[];
  better_answer: string;
  session_date: string;
}

interface NotesData {
  company: string;
  threshold: number;
  total: number;
  categories: Array<{ category: string; items: NoteItem[] }>;
}

type SortMode = 'score-asc' | 'date-desc';

const REVIEWED_KEY = 'reviewed_notes';

function loadReviewed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(REVIEWED_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveReviewed(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REVIEWED_KEY, JSON.stringify([...ids]));
}

function scoreColor(s: number) {
  return s >= 70 ? 'text-amber-600' : s >= 50 ? 'text-orange-600' : 'text-red-600';
}

function NoteCard({
  item,
  reviewed,
  onToggleReview,
}: {
  item: NoteItem;
  reviewed: boolean;
  onToggleReview: (id: string) => void;
}) {
  const diff = DIFFICULTIES.find(d => d.id === item.difficulty);
  return (
    <div className={`bg-white border border-zinc-200 rounded-xl p-4 space-y-3 transition-opacity ${reviewed ? 'opacity-50' : ''}`}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xl font-black tabular-nums ${scoreColor(item.score)}`}>{item.score}점</span>
        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">{diff?.emoji} {diff?.name}</span>
        <span className="text-[10px] text-zinc-400 ml-auto">{new Date(item.session_date).toLocaleDateString('ko-KR')}</span>
        {reviewed && (
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">✅ 복습됨</span>
        )}
      </div>

      {/* 질문 */}
      <div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">질문</p>
        <p className="text-sm text-zinc-800 leading-relaxed">{item.question}</p>
      </div>

      {/* 약점 */}
      {item.weaknesses.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-red-500 uppercase mb-1">❌ 부족했던 점</p>
          <ul className="space-y-0.5">
            {item.weaknesses.map((w, i) => (
              <li key={i} className="text-xs text-zinc-600 flex gap-1.5">
                <span className="text-red-400 shrink-0">•</span>{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 누락 키워드 */}
      {item.missing_keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.missing_keywords.map((kw, i) => (
            <span key={i} className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">{kw}</span>
          ))}
        </div>
      )}

      {/* 모범 답안 */}
      {item.better_answer && (
        <BetterAnswerSection
          betterAnswer={item.better_answer}
          score={item.score}
          missingKeywords={item.missing_keywords}
        />
      )}

      <div className="flex items-center justify-between pt-1">
        <Link
          href={`/interview/${item.session_id}/report`}
          className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold"
        >
          세션 리포트 보기 →
        </Link>
        {reviewed ? (
          <button
            onClick={() => onToggleReview(item.feedback_id)}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 underline"
          >
            복습 취소
          </button>
        ) : (
          <button
            onClick={() => onToggleReview(item.feedback_id)}
            className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-semibold hover:bg-emerald-200 transition-colors"
          >
            ✅ 복습 완료
          </button>
        )}
      </div>
    </div>
  );
}

export default function NotesPage() {
  const [data, setData] = useState<NotesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('score-asc');
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => loadReviewed());

  useEffect(() => {
    apiFetch<NotesData>('/api/interview/notes?company=kakaopay&threshold=70')
      .then(res => {
        if (res.ok) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleToggleReview(feedbackId: string) {
    setReviewedIds(prev => {
      const next = new Set(prev);
      if (next.has(feedbackId)) {
        next.delete(feedbackId);
      } else {
        next.add(feedbackId);
      }
      saveReviewed(next);
      return next;
    });
  }

  const cats = data?.categories ?? [];
  const filtered = activeCategory ? cats.filter(c => c.category === activeCategory) : cats;

  // Compute all items for stats
  const allItems = cats.flatMap(c => c.items);
  const totalCount = allItems.length;
  const reviewedCount = allItems.filter(item => reviewedIds.has(item.feedback_id)).length;

  // Sort items within each category group
  function sortItems(items: NoteItem[]): NoteItem[] {
    if (sortMode === 'score-asc') {
      return [...items].sort((a, b) => a.score - b.score);
    }
    // date-desc: newest first
    return [...items].sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime());
  }

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/interview" className="text-zinc-400 hover:text-zinc-600 text-sm">← 면접 홈</Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-bold text-zinc-800">📓 오답노트</h1>
          {data && data.total > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold ml-auto">
              70점 미만 {data.total}개
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading && <p className="text-center text-zinc-400 text-sm py-10">오답 로딩 중...</p>}

        {/* Empty state */}
        {!loading && data?.total === 0 && (
          <div className="text-center py-16 space-y-4">
            <p className="text-5xl">🎉</p>
            <p className="text-xl font-black text-emerald-700">오답이 없습니다!</p>
            <p className="text-sm font-semibold text-zinc-600">모든 답변이 70점 이상입니다.</p>
            <p className="text-xs text-zinc-400">꾸준히 연습한 결과입니다. 더 어려운 난이도에 도전해보세요!</p>
            <Link href="/interview" className="inline-block mt-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-colors">
              🚀 다음 도전 시작
            </Link>
          </div>
        )}

        {!loading && cats.length > 0 && (
          <>
            {/* Stats header */}
            {totalCount > 0 && (
              <div className="bg-white border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-bold text-zinc-800">📊 복습 진행률</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      전체 {totalCount}개 중 <span className="font-bold text-emerald-600">{reviewedCount}개</span> 복습 완료
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all"
                        style={{ width: `${totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-emerald-600 tabular-nums">
                      {totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Sort buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-zinc-400 font-semibold">정렬:</span>
              <button
                onClick={() => setSortMode('score-asc')}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${sortMode === 'score-asc' ? 'bg-zinc-800 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}
              >
                점수 낮은순
              </button>
              <button
                onClick={() => setSortMode('date-desc')}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${sortMode === 'date-desc' ? 'bg-zinc-800 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}
              >
                최신순
              </button>
            </div>

            {/* 카테고리 필터 */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${activeCategory === null ? 'bg-zinc-800 text-white' : 'bg-white border border-zinc-200 text-zinc-600'}`}
              >
                전체 ({data?.total})
              </button>
              {cats.map(c => {
                const catInfo = CATEGORIES.find(cat => cat.id === c.category);
                return (
                  <button
                    key={c.category}
                    onClick={() => setActiveCategory(c.category)}
                    className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${activeCategory === c.category ? 'bg-zinc-800 text-white' : 'bg-white border border-zinc-200 text-zinc-600'}`}
                  >
                    {catInfo?.emoji} {catInfo?.name} ({c.items.length})
                  </button>
                );
              })}
            </div>

            {/* 카테고리별 오답 */}
            {filtered.map(group => {
              const catInfo = CATEGORIES.find(c => c.id === group.category);
              const sorted = sortItems(group.items);
              return (
                <div key={group.category} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{catInfo?.emoji}</span>
                    <h2 className="text-sm font-bold text-zinc-800">{catInfo?.name ?? group.category}</h2>
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{group.items.length}개</span>
                  </div>
                  {sorted.map(item => (
                    <NoteCard
                      key={item.feedback_id}
                      item={item}
                      reviewed={reviewedIds.has(item.feedback_id)}
                      onToggleReview={handleToggleReview}
                    />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
