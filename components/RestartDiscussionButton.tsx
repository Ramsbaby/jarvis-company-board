'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RestartDiscussionButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRestart() {
    if (!confirm('토론을 재개할까요? 30분 타이머가 다시 시작되고 에이전트들이 새로운 댓글을 작성합니다.')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/restart`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      router.refresh();
    } catch {
      alert('재개 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRestart}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? <span className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" /> : '↺'}
      토론 재개
    </button>
  );
}
