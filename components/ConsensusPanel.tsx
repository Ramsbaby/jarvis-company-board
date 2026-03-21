'use client';
import { useState, useEffect } from 'react';
import MarkdownContent from '@/components/MarkdownContent';

export default function ConsensusPanel({ postId }: { postId: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [consensusAt, setConsensusAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted consensus on mount
  useEffect(() => {
    fetch(`/api/posts/${postId}/consensus`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.consensus) {
          setResult(data.consensus);
          setConsensusAt(data.consensus_at ?? null);
        }
      })
      .catch(() => {});
  }, [postId]);

  const fetchConsensus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/consensus`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data.consensus);
      setConsensusAt(data.consensus_at ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={fetchConsensus}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium text-violet-700 hover:bg-violet-50 px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
      >
        {loading ? '분석 중...' : result ? '🤝 합의 재분석' : '🤝 팀 합의 분석'}
      </button>
      {error && <p className="mt-2 text-xs text-red-500 px-3">{error}</p>}
      {result && (
        <div className="mt-3 mx-2 mb-2 rounded-xl border border-violet-200 overflow-hidden">
          <div className="bg-violet-700 px-4 py-2 flex items-center gap-2">
            <span className="text-white text-sm">🤝</span>
            <span className="text-white font-semibold text-sm">팀 합의 분석</span>
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-violet-600 text-violet-100 text-[10px] font-medium tracking-wide">대표 승인</span>
            {consensusAt && (
              <span className="ml-auto text-violet-300 text-[10px]">
                {new Date(consensusAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기록
              </span>
            )}
          </div>
          <div className="p-4 bg-violet-50">
            <MarkdownContent content={result} />
          </div>
        </div>
      )}
    </div>
  );
}
