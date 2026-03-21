'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useEvent } from '@/contexts/EventContext';

interface LiveStatsProps {
  initialOpen: number;
  initialInProgress: number;
  initialResolved: number;
  initialPostStatuses: Array<{ id: string; status: string }>;
  activeStatus: string;
}

export default function LiveStats({
  initialOpen,
  initialInProgress,
  initialResolved,
  initialPostStatuses,
  activeStatus,
}: LiveStatsProps) {
  const [open, setOpen] = useState(initialOpen);
  const [inProgress, setInProgress] = useState(initialInProgress);
  const [resolved, setResolved] = useState(initialResolved);
  const statusMap = useRef<Map<string, string>>(
    new Map(initialPostStatuses.map(p => [p.id, p.status]))
  );
  const { subscribe } = useEvent();

  useEffect(() => {
    return subscribe((ev: any) => {
      const postId: string = ev.post_id ?? ev.data?.id;
      if (!postId) return;

      if (ev.type === 'new_post') {
        const status: string = ev.data?.status ?? 'open';
        statusMap.current.set(postId, status);
        if (status === 'open') setOpen(c => c + 1);
        else if (status === 'in-progress') setInProgress(c => c + 1);
        else if (status === 'resolved') setResolved(c => c + 1);
        return;
      }

      if (ev.type === 'post_updated' && ev.data?.status) {
        const newStatus: string = ev.data.status;
        const oldStatus = statusMap.current.get(postId);
        if (oldStatus === newStatus) return;
        statusMap.current.set(postId, newStatus);
        // decrement old bucket
        if (oldStatus === 'open') setOpen(c => Math.max(0, c - 1));
        else if (oldStatus === 'in-progress') setInProgress(c => Math.max(0, c - 1));
        else if (oldStatus === 'resolved') setResolved(c => Math.max(0, c - 1));
        // increment new bucket
        if (newStatus === 'open') setOpen(c => c + 1);
        else if (newStatus === 'in-progress') setInProgress(c => c + 1);
        else if (newStatus === 'resolved') setResolved(c => c + 1);
        return;
      }

      // Agent resolution comment → post becomes resolved
      if (ev.type === 'new_comment' && ev.data?.is_resolution) {
        const oldStatus = statusMap.current.get(postId);
        if (oldStatus === 'resolved') return;
        statusMap.current.set(postId, 'resolved');
        if (oldStatus === 'open') setOpen(c => Math.max(0, c - 1));
        else if (oldStatus === 'in-progress') setInProgress(c => Math.max(0, c - 1));
        setResolved(c => c + 1);
        return;
      }

      if (ev.type === 'post_deleted') {
        const oldStatus = statusMap.current.get(postId);
        statusMap.current.delete(postId);
        if (oldStatus === 'open') setOpen(c => Math.max(0, c - 1));
        else if (oldStatus === 'in-progress') setInProgress(c => Math.max(0, c - 1));
        else if (oldStatus === 'resolved') setResolved(c => Math.max(0, c - 1));
      }
    });
  }, [subscribe]);

  return (
    <>
      <Link
        href={activeStatus === 'open' ? '/' : '/?status=open'}
        className={`flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs transition-colors cursor-pointer ${
          activeStatus === 'open'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold'
            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className={`font-medium ${activeStatus === 'open' ? 'text-emerald-700' : 'text-zinc-700'}`}>{open}</span> 대기
      </Link>
      <span className="text-zinc-300 text-xs">|</span>
      <Link
        href={activeStatus === 'in-progress' ? '/' : '/?status=in-progress'}
        className={`flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs transition-colors cursor-pointer ${
          activeStatus === 'in-progress'
            ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold'
            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        <span className={`font-medium ${activeStatus === 'in-progress' ? 'text-amber-700' : 'text-zinc-700'}`}>{inProgress}</span> 처리중
      </Link>
      <span className="text-zinc-300 text-xs">|</span>
      <Link
        href={activeStatus === 'resolved' ? '/' : '/?status=resolved'}
        className={`flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs transition-colors cursor-pointer ${
          activeStatus === 'resolved'
            ? 'bg-zinc-100 border-zinc-400 text-zinc-700 font-semibold'
            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
        <span className={`font-medium ${activeStatus === 'resolved' ? 'text-zinc-700' : 'text-zinc-400'}`}>{resolved}</span> 완료
      </Link>
    </>
  );
}
