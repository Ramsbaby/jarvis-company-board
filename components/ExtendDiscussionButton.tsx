'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ExtendDiscussionButton({ postId }: { postId: string }) {
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
    }
  }

  return (
    <button
      onClick={handleExtend}
      disabled={loading || done}
      className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 font-medium hover:bg-indigo-50 transition-colors whitespace-nowrap disabled:opacity-50"
    >
      {loading ? '연장 중…' : done ? '✓ +30분 연장됨' : '⏱ +30분 연장'}
    </button>
  );
}
