'use client';

import { useState, useEffect } from 'react';

interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
}

function getVoterId(): string {
  if (typeof window === 'undefined') return 'anon';
  const stored = localStorage.getItem('jarvis-board-visitor');
  if (stored) return stored;
  const id = 'v-' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('jarvis-board-visitor', id);
  return id;
}

function SinglePoll({ poll, voterId, isOwner }: { poll: Poll; voterId: string; isOwner: boolean }) {
  const [votes, setVotes] = useState(poll.votes);
  const [totalVotes, setTotalVotes] = useState(poll.totalVotes);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch my vote on mount
  useEffect(() => {
    // Can't easily get voter's choice from GET, so just track locally
  }, []);

  async function vote(idx: number) {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_idx: idx, voter_id: voterId }),
      });
      if (res.ok) {
        const data = await res.json();
        setVotes(data.votes);
        setTotalVotes(data.totalVotes);
        setMyVote(data.myVote);
      }
    } finally {
      setLoading(false);
    }
  }

  const maxVotes = Math.max(...votes, 1);

  return (
    <div className="bg-white border border-indigo-100 rounded-xl p-4">
      <p className="text-sm font-semibold text-zinc-800 mb-3">📊 {poll.question}</p>
      <div className="space-y-2">
        {poll.options.map((opt, i) => {
          const pct = totalVotes > 0 ? Math.round((votes[i] / totalVotes) * 100) : 0;
          const isSelected = myVote === i;
          const isLeading = votes[i] === maxVotes && votes[i] > 0;
          return (
            <button
              key={i}
              onClick={() => vote(i)}
              disabled={loading}
              className={`w-full text-left rounded-lg border transition-all overflow-hidden disabled:opacity-60 ${
                isSelected
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-zinc-200 hover:border-indigo-300 bg-white'
              }`}
            >
              <div className="relative px-3 py-2.5">
                {/* Progress bar */}
                {totalVotes > 0 && (
                  <div
                    className={`absolute inset-y-0 left-0 rounded-lg transition-all ${isSelected ? 'bg-indigo-100' : 'bg-zinc-50'}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isSelected && <span className="text-indigo-600 text-xs">✓</span>}
                    <span className={`text-sm ${isSelected ? 'text-indigo-700 font-medium' : 'text-zinc-700'}`}>
                      {opt}
                    </span>
                    {isLeading && totalVotes > 0 && <span className="text-[10px] text-orange-500">🔥</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-zinc-500">{votes[i]}</span>
                    <span className="text-xs text-zinc-400">({pct}%)</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-400 mt-2">총 {totalVotes}표 · 클릭하여 투표</p>
    </div>
  );
}

// Create poll form (owner only)
function CreatePollForm({ postId, onCreated }: { postId: string; onCreated: (poll: Poll) => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = options.filter(o => o.trim());
    if (!question.trim() || filled.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), options: filled }),
      });
      if (res.ok) {
        const poll = await res.json();
        onCreated(poll);
        setQuestion('');
        setOptions(['', '']);
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed border-zinc-300 text-zinc-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
      >
        📊 투표 추가
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-700">📊 투표 만들기</p>
      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="질문을 입력하세요"
        className="w-full text-sm px-3 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:border-indigo-400 bg-zinc-50"
        required
      />
      {options.map((opt, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={opt}
            onChange={e => { const next = [...options]; next[i] = e.target.value; setOptions(next); }}
            placeholder={`선택지 ${i + 1}`}
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:border-indigo-400 bg-zinc-50"
          />
          {options.length > 2 && (
            <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-500 text-sm">×</button>
          )}
        </div>
      ))}
      {options.length < 5 && (
        <button type="button" onClick={() => setOptions([...options, ''])} className="text-xs text-indigo-500 hover:underline">+ 선택지 추가</button>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500 px-3 py-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50">취소</button>
        <button type="submit" disabled={loading} className="text-xs text-white bg-indigo-600 px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? '생성 중...' : '생성'}
        </button>
      </div>
    </form>
  );
}

export default function PollWidget({ postId, initialPolls, isOwner }: { postId: string; initialPolls: Poll[]; isOwner: boolean }) {
  const [polls, setPolls] = useState<Poll[]>(initialPolls);
  const [voterId, setVoterId] = useState('anon');

  useEffect(() => {
    setVoterId(getVoterId());
  }, []);

  return (
    <div className="space-y-3">
      {polls.map(poll => (
        <SinglePoll key={poll.id} poll={poll} voterId={voterId} isOwner={isOwner} />
      ))}
      {isOwner && (
        <CreatePollForm postId={postId} onCreated={poll => setPolls(prev => [...prev, poll])} />
      )}
    </div>
  );
}
