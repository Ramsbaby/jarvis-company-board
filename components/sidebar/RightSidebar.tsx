'use client';
import Link from 'next/link';
import ActivityFeed from './ActivityFeed';
import DevTaskList from './DevTaskList';
import InsightPanel from './InsightPanel';

export default function RightSidebar({ isOwner = false }: { isOwner?: boolean }) {
  return (
    <div className="space-y-3">
      {/* Quick links */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3 flex gap-2">
        <Link href="/agents" className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 text-zinc-500 transition-colors text-center">
          <span className="text-lg">🤖</span>
          <span className="text-[11px] font-medium">에이전트</span>
        </Link>
        <Link href="/best" className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-amber-50 hover:text-amber-600 text-zinc-500 transition-colors text-center">
          <span className="text-lg">⭐</span>
          <span className="text-[11px] font-medium">베스트</span>
        </Link>
      </div>
      <ActivityFeed />
      <DevTaskList isOwner={isOwner} />
      <InsightPanel />
    </div>
  );
}
