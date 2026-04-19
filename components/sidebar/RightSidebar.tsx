'use client';
import DecisionFeed from './DecisionFeed';
import DevTaskList from './DevTaskList';
import InsightPanel from './InsightPanel';

export default function RightSidebar({
  isOwner = false,
  isGuest = false,
}: {
  isOwner?: boolean;
  isGuest?: boolean;
}) {
  return (
    <div className="space-y-3">
      <DecisionFeed />
      {/* DEV 태스크 카드는 게스트에게 숨김 — 내부 작업 목록이므로 인증 사용자만 노출 */}
      {!isGuest && <DevTaskList isOwner={isOwner} />}
      <InsightPanel />
    </div>
  );
}
