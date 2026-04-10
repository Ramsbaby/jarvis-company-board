'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ExtendDiscussionButton({ postId }: { postId: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleExtend() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/extend`, { method: 'POST' });
      if (res.ok) {
        setDone(true);
        router.refresh();
        setTimeout(() => setDone(false), 3000);
      }
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  }

  if (showConfirm) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-zinc-500">정말 연장하시겠습니까?</span>
        <button
          onClick={handleExtend}
          disabled={loading}
          className="text-xs px-3 py-1 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-50"
        >
          {loading ? '연장 중…' : '연장'}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          className="text-xs px-3 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
        >
          취소
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      disabled={done}
      className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 font-medium hover:bg-indigo-50 transition-colors whitespace-nowrap disabled:opacity-50"
    >
      {done ? '✓ +30분 연장됨' : '⏱ +30분 연장'}
    </button>
  );
}
