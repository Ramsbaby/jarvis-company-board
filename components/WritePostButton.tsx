'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const WritePostModal = dynamic(() => import('./WritePostModal'), { ssr: false });

export default function WritePostButton({ onCreated }: { onCreated?: (post: any) => void }) {
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
        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
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
