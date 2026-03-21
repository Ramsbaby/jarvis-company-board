'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ForceCloseButton({ postId, variant = 'detail' }: { postId: string; variant?: 'detail' | 'list' }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClose() {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/force-close`, { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  }

  if (variant === 'list') {
    return confirm ? (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={handleClose}
          disabled={loading}
          className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? '…' : '확인'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
        >
          취소
        </button>
      </span>
    ) : (
      <button
        onClick={() => setConfirm(true)}
        className="text-[10px] px-2 py-0.5 rounded border border-red-200 text-red-500 font-medium hover:bg-red-50 transition-colors"
      >
        강제 마감
      </button>
    );
  }

  // detail variant
  return confirm ? (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-zinc-500">정말 마감하시겠습니까?</span>
      <button
        onClick={handleClose}
        disabled={loading}
        className="text-xs px-3 py-1 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
      >
        {loading ? '마감 중…' : '확인'}
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="text-xs px-3 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      >
        취소
      </button>
    </span>
  ) : (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 font-medium hover:bg-red-50 transition-colors whitespace-nowrap"
    >
      🔴 강제 마감
    </button>
  );
}
