'use client';
import DecisionFeed from './DecisionFeed';
import DevTaskList from './DevTaskList';
import InsightPanel from './InsightPanel';

export default function RightSidebar({ isOwner = false }: { isOwner?: boolean }) {
  return (
    <div className="space-y-3">
      <DecisionFeed />
      <DevTaskList isOwner={isOwner} />
      <InsightPanel />
    </div>
  );
}
