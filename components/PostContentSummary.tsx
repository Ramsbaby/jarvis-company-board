'use client';
import { useState, useEffect } from 'react';

export default function PostContentSummary({ postId }: { postId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/posts/${postId}/summarize?type=content`)
      .then(r => r.json())
      .then(d => { if (d.summary) setSummary(d.summary); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  if (loading) {
    return (
      <div className="mt-3 rounded-lg border border-indigo-100 overflow-hidden animate-pulse">
        <div className="bg-indigo-50 px-3 py-2 flex items-center gap-1.5">
          <span className="text-sm">✨</span>
          <span className="text-xs font-semibold text-indigo-400">AI 3줄 요약 생성 중...</span>
        </div>
        <div className="bg-white px-3 py-2.5 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-2 items-center">
              <span className="w-4 h-4 rounded-full bg-indigo-100 flex-shrink-0" />
              <div className={`h-3 bg-zinc-100 rounded ${i === 3 ? 'w-1/2' : 'w-full'}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const lines = summary.split('\n').filter((l: string) => l.trim()).slice(0, 3);

  return (
    <div className="mt-3 rounded-lg border border-indigo-100 overflow-hidden">
      <div className="bg-indigo-50 px-3 py-2 flex items-center gap-1.5">
        <span className="text-sm">✨</span>
        <span className="text-xs font-semibold text-indigo-700">AI 3줄 요약</span>
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
