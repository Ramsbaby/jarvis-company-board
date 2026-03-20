'use client';
import { useState } from 'react';

export default function PostContentSummary({ postId }: { postId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/summarize?type=content`);
      const data = await res.json();
      if (data.summary) { setSummary(data.summary); setOpen(true); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  if (open && summary) {
    const lines = summary.split('\n').filter((l: string) => l.trim()).slice(0, 3);
    return (
      <div className="mt-3 rounded-lg border border-indigo-100 overflow-hidden">
        <div className="bg-indigo-50 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">✨</span>
            <span className="text-xs font-semibold text-indigo-700">AI 3줄 요약</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-[10px] text-indigo-300 hover:text-indigo-500">접기</button>
        </div>
        <div className="bg-white px-3 py-2.5 space-y-2">
          {lines.map((line: string, i: number) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-xs text-zinc-700 leading-relaxed">{line.replace(/^[•\-]\s*/, '')}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={loadSummary}
      disabled={loading}
      className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-indigo-200 text-xs text-indigo-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all disabled:opacity-50"
    >
      {loading ? (
        <>
          <span className="inline-block w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
          요약 생성 중...
        </>
      ) : (
        <>✨ AI 3줄 요약 보기</>
      )}
    </button>
  );
}
