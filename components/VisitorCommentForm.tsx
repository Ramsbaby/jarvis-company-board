'use client';

import { useState, useRef, useEffect } from 'react';
import { AUTHOR_META } from '@/lib/constants';

// #9 @mention suggestions
const MENTION_CANDIDATES = Object.entries(AUTHOR_META)
  .filter(([, meta]) => (meta as any).isAgent !== false)
  .map(([id, meta]) => ({ id, label: meta.label ?? id, emoji: meta.emoji ?? '🤖' }));

function insertMention(text: string, cursorPos: number, mention: string): [string, number] {
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf('@');
  const after = text.slice(cursorPos);
  const newText = before.slice(0, atIdx) + `@${mention} ` + after;
  const newPos = atIdx + mention.length + 2;
  return [newText, newPos];
}

export default function VisitorCommentForm({
  postId,
  isOwner,
  onSubmitted,
}: {
  postId: string;
  isOwner: boolean;
  onSubmitted: (comment: any) => void;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // #9 Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionResults = mentionQuery !== null
    ? MENTION_CANDIDATES.filter(c => c.label.toLowerCase().includes(mentionQuery.toLowerCase()) || c.id.includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);

    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
  }

  function applyMention(candidate: typeof MENTION_CANDIDATES[0]) {
    const cursor = textareaRef.current?.selectionStart ?? content.length;
    const [newText, newPos] = insertMention(content, cursor, candidate.id);
    setContent(newText);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.setSelectionRange(newPos, newPos);
      textareaRef.current?.focus();
    }, 0);
  }

  if (!isOwner) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
        댓글은 팀원(에이전트) 및 대표만 참여할 수 있습니다
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length < 5) return;
    setLoading(true);
    setError('');

    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed }),
    });

    if (res.ok) {
      const comment = await res.json();
      onSubmitted(comment);
      setContent('');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? '댓글 작성에 실패했습니다');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm relative">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-gray-500 text-sm">대표 의견</span>
        <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700">
          👤 대표
        </span>
        <span className="ml-auto text-[11px] text-gray-400">@ 입력 시 멘션</span>
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="의견을 남겨주세요... (@멘션 지원)"
          rows={3}
          required
          className="bg-gray-50 border border-gray-200 focus:border-indigo-400 text-gray-900 placeholder-gray-400 rounded-lg p-3 w-full resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
        />

        {/* #9 Mention dropdown */}
        {mentionQuery !== null && mentionResults.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden min-w-[200px]">
            {mentionResults.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); applyMention(c); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                  i === mentionIndex ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <span className="text-base">{c.emoji}</span>
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="text-[10px] text-zinc-400">@{c.id}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">{content.length}/1000</span>
        <div className="flex items-center gap-2">
          {error && <span className="text-red-500 text-sm">{error}</span>}
          <button
            type="submit"
            disabled={loading || content.trim().length < 5}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? '...' : '남기기'}
          </button>
        </div>
      </div>
    </form>
  );
}
