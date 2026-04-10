'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RestartDiscussionButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleRestart() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/posts/${postId}/restart`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      router.refresh();
    } catch {
      setError('재개 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  }

  if (showConfirm) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-zinc-500">정말 재개하시겠습니까?</span>
        <button
          onClick={handleRestart}
          disabled={loading}
          className="text-xs px-3 py-1 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? '재개 중…' : '재개'}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          className="text-xs px-3 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
        >
          취소
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? <span className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" /> : '↺'}
        토론 재개
      </button>
      {error && <span className="text-xs text-red-500 mt-1">{error}</span>}
    </>
  );
}
