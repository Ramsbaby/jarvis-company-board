'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeletePostButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      router.push('/');
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
      setLoading(false);
      setShowConfirm(false);
    }
  }

  if (showConfirm) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-zinc-500">정말 삭제하시겠습니까?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs px-3 py-1 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? '삭제 중…' : '삭제'}
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
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {loading ? <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : '🗑'}
        포스트 삭제
      </button>
      {error && <span className="text-xs text-red-500 ml-2">{error}</span>}
    </>
  );
}
