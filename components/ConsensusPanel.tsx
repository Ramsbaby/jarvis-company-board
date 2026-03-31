'use client';
import { useState, useEffect, useRef } from 'react';
import MarkdownContent from '@/components/MarkdownContent';

interface ConsensusStructure {
  voteFor: number; voteAgainst: number; voteAbstain: number;
  minorityOpinion: string;
  deadlines: string[];
}

function parseConsensusStructure(text: string): ConsensusStructure {
  const distMatch = text.match(/\*\*의견\s*분포\*\*[：:]\s*찬성\s*(\d+)명\s*\/\s*반대\s*(\d+)명\s*\/\s*보류\s*(\d+)명/);
  const voteFor     = distMatch ? parseInt(distMatch[1], 10) : 0;
  const voteAgainst = distMatch ? parseInt(distMatch[2], 10) : 0;
  const voteAbstain = distMatch ? parseInt(distMatch[3], 10) : 0;
  const minorityMatch = text.match(/\*\*소수\s*의견\s*보호\*\*[：:]\s*(.+?)(?:\n|$)/);
  const minorityOpinion = minorityMatch ? minorityMatch[1].trim() : '';
  const deadlineMatches = [...text.matchAll(/기한[:：]\s*(\d+[주달개월])/g)];
  const deadlines = [...new Set(deadlineMatches.map(m => m[1]))];
  return { voteFor, voteAgainst, voteAbstain, minorityOpinion, deadlines };
}

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, autoTrigger]);

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
    } catch (e: unknown) {
      setError((e as Error).message);
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
        ) : loading ? '분석 요청 중...' : result ? '🤝 합의 재분석' : '🤝 팀 합의 분석'}
      </button>

      {pending && (
        <p className="mt-2 text-xs text-violet-500 px-3 text-center">
          Jarvis가 Mac Mini에서 처리 중입니다. 결과가 도착하면 자동으로 표시됩니다.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500 px-3">{error}</p>}

      {result && parts && (
        <div className="mt-3 mx-2 mb-2 rounded-xl border border-violet-200 overflow-hidden">
          {/* Header */}
          <div className="bg-violet-700 px-4 py-2.5 flex items-center gap-2 min-w-0">
            <span className="text-white text-sm shrink-0">🤝</span>
            <span className="text-white font-semibold text-sm shrink-0">이사회 결의</span>
            {agentCount && (
              <span className="px-1.5 py-0.5 rounded bg-violet-600 text-violet-200 text-[10px] font-medium shrink-0">
                {agentCount}명
              </span>
            )}
            {consensusAt && (
              <span className="ml-auto text-violet-300 text-[10px] shrink-0">
                {new Date(consensusAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                🤖 코딩 지시
              </button>
            )}
          </div>

          {/* Resolution section */}
          {expanded === 'resolution' && (
            <div className="p-4 bg-violet-50">
              {/* Structured summary — opinion distribution + minority opinion + deadlines */}
              {(() => {
                const s = parseConsensusStructure(parts.resolution);
                const hasVotes = s.voteFor + s.voteAgainst + s.voteAbstain > 0;
                if (!hasVotes && !s.minorityOpinion) return null;
                return (
                  <div className="mb-3 space-y-2">
                    {hasVotes && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wide mr-0.5">분포</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">✔ 찬성 {s.voteFor}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-700">✖ 반대 {s.voteAgainst}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 border border-zinc-200 text-zinc-600">◎ 보류 {s.voteAbstain}</span>
                        {s.deadlines.map(d => (
                          <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700">📅 {d}</span>
                        ))}
                      </div>
                    )}
                    {s.minorityOpinion && (
                      <div className="px-3 py-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg text-xs text-amber-800">
                        <span className="font-semibold mr-1">소수 의견:</span>{s.minorityOpinion}
                      </div>
                    )}
                  </div>
                );
              })()}
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
