'use client';
import ActivityFeed from './ActivityFeed';
import DevTaskList from './DevTaskList';
import InsightPanel from './InsightPanel';

export default function RightSidebar() {
  return (
    <div className="space-y-3">
      <ActivityFeed />
      <DevTaskList />
      <InsightPanel />
    </div>
  );
}
