'use client';
import { useState, useEffect, useRef } from 'react';
import MarkdownContent from '@/components/MarkdownContent';

export default function ConsensusPanel({ postId, autoTrigger = false }: { postId: string; autoTrigger?: boolean }) {
  const [result, setResult] = useState<string | null>(null);
  const [consensusAt, setConsensusAt] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<'resolution' | 'coding' | null>('resolution');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function checkStatus() {
    const r = await fetch(`/api/posts/${postId}/consensus`).catch(() => null);
    if (!r?.ok) return;
    const data = await r.json();
    if (data.consensus) {
      setResult(data.consensus);
      setConsensusAt(data.consensus_at ?? null);
      setPending(false);
      stopPolling();
    } else if (!data.pending) {
      setPending(false);
      stopPolling();
    }
  }

  useEffect(() => {
    fetch(`/api/posts/${postId}/consensus`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.consensus) {
          setResult(data.consensus);
          setConsensusAt(data.consensus_at ?? null);
        } else if (data?.pending) {
          setPending(true);
          pollRef.current = setInterval(checkStatus, 5000);
        } else if (autoTrigger) {
          fetchConsensus();
        }
      })
      .catch(() => {});
    return stopPolling;
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchConsensus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/consensus`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.pending) {
        setPending(true);
        pollRef.current = setInterval(checkStatus, 5000);
      } else {
        setResult(data.consensus);
        setConsensusAt(data.consensus_at ?? null);
        if (data.commentCount) setAgentCount(data.commentCount);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Split consensus into resolution part and coding part
  function splitConsensus(text: string): { resolution: string; coding: string } {
    const codingMarker = /##\s+🤖\s*Jarvis\s*코딩\s*지시사항/;
    const match = codingMarker.exec(text);
    if (!match) return { resolution: text, coding: '' };
    return {
      resolution: text.slice(0, match.index).trim(),
      coding: text.slice(match.index).trim(),
    };
  }

  const parts = result ? splitConsensus(result) : null;
  const hasCoding = parts && parts.coding.length > 30 &&
    !parts.coding.includes('코딩 작업 없음') &&
    !parts.coding.includes('개발 작업 없음');

  return (
    <div>
      <button
        onClick={fetchConsensus}
        disabled={loading || pending}
        className="w-full flex items-center justify-center gap-2 text-sm font-medium text-violet-700 hover:bg-violet-50 px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
      >
        {pending ? (
          <><span className="w-3 h-3 border-2 border-violet-400 border-t-violet-700 rounded-full animate-spin" /> Jarvis 분석 중...</>
        ) : loading ? (
          <><span className="w-3 h-3 border-2 border-violet-400 border-t-violet-700 rounded-full animate-spin" /> Groq 분석 중... (15초 내외)</>
        ) : result ? '🤝 합의 재분석' : '🤝 팀 합의 분석'}
      </button>

      {pending && (
        <p className="mt-2 text-xs text-violet-500 px-3 text-center">
          Mac Mini 크론으로 처리 중입니다. 결과가 도착하면 자동으로 표시됩니다.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500 px-3">{error}</p>}

      {result && parts && (
        <div className="mt-3 mx-2 mb-2 rounded-xl border border-violet-200 overflow-hidden">
          {/* Header */}
          <div className="bg-violet-700 px-4 py-2.5 flex items-center gap-2">
            <span className="text-white text-sm">🤝</span>
            <span className="text-white font-semibold text-sm">이사회 최종 결의</span>
            {agentCount && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-violet-600 text-violet-200 text-[10px] font-medium">
                {agentCount}명 의견 기반
              </span>
            )}
            {consensusAt && (
              <span className="ml-auto text-violet-300 text-[10px]">
                {new Date(consensusAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기록
              </span>
            )}
          </div>

          {/* Tab buttons */}
          <div className="flex border-b border-violet-100 bg-white">
            <button
              onClick={() => setExpanded(expanded === 'resolution' ? null : 'resolution')}
              className={`flex-1 text-xs font-semibold py-2 px-3 transition-colors ${
                expanded === 'resolution'
                  ? 'bg-violet-50 text-violet-700 border-b-2 border-violet-500'
                  : 'text-zinc-500 hover:text-violet-600 hover:bg-violet-50/40'
              }`}
            >
              🏛️ 결의 내용
            </button>
            {hasCoding && (
              <button
                onClick={() => setExpanded(expanded === 'coding' ? null : 'coding')}
                className={`flex-1 text-xs font-semibold py-2 px-3 transition-colors border-l border-violet-100 ${
                  expanded === 'coding'
                    ? 'bg-orange-50 text-orange-700 border-b-2 border-orange-500'
                    : 'text-zinc-500 hover:text-orange-600 hover:bg-orange-50/40'
                }`}
              >
                🤖 Jarvis 코딩 지시
              </button>
            )}
          </div>

          {/* Resolution section */}
          {expanded === 'resolution' && (
            <div className="p-4 bg-violet-50">
              <MarkdownContent content={parts.resolution} />
            </div>
          )}

          {/* Coding section */}
          {expanded === 'coding' && hasCoding && (
            <div className="p-4 bg-orange-50">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-[10px] bg-orange-200 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                  Jarvis 코더 전용
                </span>
                <span className="text-[10px] text-orange-500">이 섹션을 보고 바로 코딩 시작</span>
              </div>
              <MarkdownContent content={parts.coding} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
