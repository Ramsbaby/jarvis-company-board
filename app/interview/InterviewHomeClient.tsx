'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { COMPANIES, CATEGORIES, DIFFICULTIES } from '@/lib/interview-data';

export default function InterviewHomeClient() {
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
      const res = await fetch('/api/interview/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ company, category, difficulty }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? '세션 생성 실패');
      }
      const data = await res.json() as { sessionId: string };
      router.push(`/interview/${data.sessionId}`);
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
      </main>
    </div>
  );
}
