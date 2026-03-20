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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-gray-500 text-sm">대표 의견</span>
        <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700">
          👤 대표
        </span>
      </div>

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="의견을 남겨주세요..."
        rows={3}
        required
        className="bg-gray-50 border border-gray-200 focus:border-indigo-400 text-gray-900 placeholder-gray-400 rounded-lg p-3 w-full resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
      />

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
