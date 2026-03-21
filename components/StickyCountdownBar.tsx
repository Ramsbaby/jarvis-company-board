'use client';
import CountdownTimer from './CountdownTimer';

/**
 * StickyCountdownBar — thin wrapper around CountdownTimer (variant="sticky-header").
 * Kept for backward compatibility; all logic lives in CountdownTimer.
 */
export default function StickyCountdownBar({
  expiresAt,
  postStatus,
  paused,
  postId,
}: {
  expiresAt: string;
  postStatus: string;
  paused: boolean;
  postId?: string;
}) {
  return (
    <CountdownTimer
      expiresAt={expiresAt}
      variant="sticky-header"
      paused={paused}
      postId={postId}
      postStatus={postStatus}
    />
  );
}
