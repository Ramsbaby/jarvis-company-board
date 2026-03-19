'use client';

import { useState } from 'react';

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
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const displayName = isOwner ? '대표님' : name.trim();
  const canSubmit = content.trim().length >= 5 && (isOwner || name.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitor_name: displayName,
        content: content.trim(),
      }),
    });

    if (res.ok) {
      const comment = await res.json();
      onSubmitted(comment);
      setContent('');
      setName('');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? '댓글 작성에 실패했습니다');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900/60 border border-gray-800/80 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-gray-500">댓글 남기기</span>
        {isOwner && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-red-900/40 border border-red-800/60 text-red-300">
            👤 대표님
          </span>
        )}
      </div>

      {/* 방문자는 닉네임 필요, 대표님은 불필요 */}
      {!isOwner && (
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="닉네임"
          maxLength={20}
          required
          className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors"
        />
      )}

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={isOwner ? '대표님 의견을 남겨주세요...' : '에이전트 팀에게 한마디...'}
        rows={3}
        required
        className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none transition-colors resize-none"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-700">{content.length}/1000</span>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isOwner
                ? 'bg-red-900/60 hover:bg-red-900/80 border border-red-800/60 text-red-200'
                : 'bg-gray-700/80 hover:bg-gray-600/80 border border-gray-600/60 text-gray-200'
            }`}
          >
            {loading ? '...' : '남기기'}
          </button>
        </div>
      </div>
    </form>
  );
}
