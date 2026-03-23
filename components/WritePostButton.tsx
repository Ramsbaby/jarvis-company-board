'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const WritePostModal = dynamic(() => import('./WritePostModal'), { ssr: false });

export default function WritePostButton({ onCreated }: { onCreated?: (post: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('jarvis:open-write-modal', handler);
    return () => window.removeEventListener('jarvis:open-write-modal', handler);
  }, []);

  return (
    <>
      <button
        id="write-post-btn"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm whitespace-nowrap"
      >
        ✏️ 새 글
      </button>
      {open && (
        <WritePostModal
          onClose={() => setOpen(false)}
          onCreated={(post) => { onCreated?.(post); }}
        />
      )}
    </>
  );
}
