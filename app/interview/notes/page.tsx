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

function scoreColor(s: number) {
  return s >= 70 ? 'text-amber-600' : s >= 50 ? 'text-orange-600' : 'text-red-600';
}

function NoteCard({ item }: { item: NoteItem }) {
  const diff = DIFFICULTIES.find(d => d.id === item.difficulty);
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xl font-black tabular-nums ${scoreColor(item.score)}`}>{item.score}점</span>
        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">{diff?.emoji} {diff?.name}</span>
        <span className="text-[10px] text-zinc-400 ml-auto">{new Date(item.session_date).toLocaleDateString('ko-KR')}</span>
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

      <Link
        href={`/interview/${item.session_id}/report`}
        className="block text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold"
      >
        세션 리포트 보기 →
      </Link>
    </div>
  );
}

export default function NotesPage() {
  const [data, setData] = useState<NotesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<NotesData>('/api/interview/notes?company=kakaopay&threshold=70')
      .then(res => {
        if (res.ok) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const cats = data?.categories ?? [];
  const filtered = activeCategory ? cats.filter(c => c.category === activeCategory) : cats;

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/interview" className="text-zinc-400 hover:text-zinc-600 text-sm">← 면접 홈</Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-bold text-zinc-800">📓 오답노트</h1>
          {data && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold ml-auto">
              70점 미만 {data.total}개
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading && <p className="text-center text-zinc-400 text-sm py-10">오답 로딩 중...</p>}

        {!loading && data?.total === 0 && (
          <div className="text-center py-10 space-y-2">
            <p className="text-3xl">🎉</p>
            <p className="text-sm font-semibold text-zinc-700">70점 미만 답변이 없습니다!</p>
            <p className="text-xs text-zinc-400">더 많은 세션을 진행하면 약점이 쌓입니다.</p>
          </div>
        )}

        {!loading && cats.length > 0 && (
          <>
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
              return (
                <div key={group.category} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{catInfo?.emoji}</span>
                    <h2 className="text-sm font-bold text-zinc-800">{catInfo?.name ?? group.category}</h2>
                    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{group.items.length}개</span>
                  </div>
                  {group.items.map(item => (
                    <NoteCard key={item.feedback_id} item={item} />
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
