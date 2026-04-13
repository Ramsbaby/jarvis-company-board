'use client';
import { useEffect, useState } from 'react';

interface UpcomingItem {
  id: string;
  name: string;
  nextRun: string;
  minutesUntil: number;
  priority: string;
  humanTime: string;
}

interface Commit {
  sha: string;
  ago: string;
  subject: string;
  author: string;
  repo: 'jarvis' | 'jarvis-board';
}

const REFRESH_MS = 60_000;

interface RightInfoPanelsProps {
  isMobile: boolean;
  /** 크론 항목 클릭 시 — id를 받아 VirtualOffice의 CronDetailPopup을 연다 */
  onCronClick?: (cronId: string) => void;
  /** 커밋 항목 클릭 시 — 현 단계는 GitHub 웹 URL을 새 창으로 연다 */
  onCommitClick?: (commit: Commit) => void;
}

/**
 * 우상단 정보 패널 스택 — BoardBanner 아래에 붙음:
 *  1. 오늘 남은 예정 크론 (6개) → 클릭 시 CronDetailPopup
 *  2. 최근 커밋 (jarvis/jarvis-board 합쳐 10개) → 클릭 시 GitHub
 */
export default function RightInfoPanels({ isMobile, onCronClick, onCommitClick }: RightInfoPanelsProps) {
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [expanded, setExpanded] = useState<'upcoming' | 'commits' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [scheduleRes, commitsRes] = await Promise.all([
          fetch('/api/map/today-schedule', { cache: 'no-store' }),
          fetch('/api/map/recent-commits', { cache: 'no-store' }),
        ]);
        if (scheduleRes.ok) {
          const j = await scheduleRes.json() as { upcoming?: UpcomingItem[] };
          if (!cancelled) setUpcoming(j.upcoming || []);
        }
        if (commitsRes.ok) {
          const j = await commitsRes.json() as { commits?: Commit[] };
          if (!cancelled) setCommits(j.commits || []);
        }
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // 모바일에선 숨김 (화면 좁아서)
  if (isMobile) return null;

  const fmtUntil = (min: number) => {
    if (min < 1) return '곧';
    if (min < 60) return `${min}분 후`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 24) return m > 0 ? `${h}시간 ${m}분 후` : `${h}시간 후`;
    return '24h+';
  };

  const priorityColor = (p: string) =>
    p === 'high' ? '#f85149' : p === 'low' ? '#6e7681' : '#d29922';

  return (
    <div
      style={{
        position: 'fixed',
        top: 82,
        right: 4,
        zIndex: 450,
        width: 180,
        maxHeight: '40vh',
        overflowY: 'auto',
        opacity: 0.9,
        display: 'flex',
        flexDirection: 'column',  // 위에서 아래 방향 확장
        gap: 10,
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        pointerEvents: 'none',
      }}
    >
      {/* 오늘 예정 크론 카드 */}
      {upcoming.length > 0 && (
        <div
          style={{
            background: 'rgba(13, 17, 23, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            borderRadius: 10,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => setExpanded(expanded === 'upcoming' ? null : 'upcoming')}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: '10px 14px',
              color: '#c9d1d9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            <span>
              <span style={{ marginRight: 6 }}>⏳</span>
              오늘 예정 {upcoming.length}건
            </span>
            <span style={{ color: '#58a6ff', fontSize: 10 }}>
              다음 {upcoming[0]?.humanTime}
            </span>
          </button>
          {expanded === 'upcoming' && (
            <div style={{
              padding: '4px 10px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 280,
              overflowY: 'auto',
            }}>
              {upcoming.map((u) => {
                const clickable = !!onCronClick;
                return (
                  <button
                    key={u.id}
                    onClick={() => onCronClick && onCronClick(u.id)}
                    disabled={!clickable}
                    title={clickable ? `${u.name} — 클릭하면 상세 팝업` : undefined}
                    style={{
                      all: 'unset',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${priorityColor(u.priority)}25`,
                      borderLeft: `2px solid ${priorityColor(u.priority)}`,
                      borderRadius: 7,
                      fontSize: 11,
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'background 0.12s',
                      boxSizing: 'border-box' as const,
                    }}
                    onMouseEnter={e => {
                      if (clickable) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
                    }}
                    onMouseLeave={e => {
                      if (clickable) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                    }}
                  >
                    <span style={{ color: '#58a6ff', fontFamily: 'monospace', fontSize: 10, minWidth: 38 }}>
                      {u.humanTime}
                    </span>
                    <span style={{ color: '#c9d1d9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.name}
                    </span>
                    <span style={{ color: '#6e7681', fontSize: 9, fontFamily: 'monospace', flexShrink: 0 }}>
                      {fmtUntil(u.minutesUntil)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 최근 커밋 카드 */}
      {commits.length > 0 && (
        <div
          style={{
            background: 'rgba(13, 17, 23, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            borderRadius: 10,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => setExpanded(expanded === 'commits' ? null : 'commits')}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: '10px 14px',
              color: '#c9d1d9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            <span>
              <span style={{ marginRight: 6 }}>🔀</span>
              최근 커밋 {commits.length}건
            </span>
            <span style={{ color: '#3fb950', fontSize: 10 }}>
              {commits[0]?.ago}
            </span>
          </button>
          {expanded === 'commits' && (
            <div style={{
              padding: '4px 10px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 280,
              overflowY: 'auto',
            }}>
              {commits.map((c) => {
                const githubUrl = `https://github.com/ramsbaby/${c.repo}/commit/${c.sha}`;
                const handleClick = () => {
                  if (onCommitClick) {
                    onCommitClick(c);
                  } else if (typeof window !== 'undefined') {
                    window.open(githubUrl, '_blank', 'noopener,noreferrer');
                  }
                };
                return (
                  <button
                    key={`${c.repo}-${c.sha}`}
                    onClick={handleClick}
                    title={`${c.repo}@${c.sha} — 클릭 시 GitHub 커밋 페이지 열림`}
                    style={{
                      all: 'unset',
                      display: 'block',
                      padding: '7px 10px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(63, 185, 80, 0.18)',
                      borderLeft: '2px solid #3fb950',
                      borderRadius: 7,
                      fontSize: 11,
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                      boxSizing: 'border-box' as const,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(63, 185, 80, 0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ color: '#3fb950', fontFamily: 'monospace', fontSize: 9, fontWeight: 700 }}>
                        {c.sha}
                      </span>
                      <span style={{ color: '#6e7681', fontSize: 9 }}>
                        {c.repo}
                      </span>
                      <span style={{ color: '#484f58', fontSize: 9, marginLeft: 'auto' }}>
                        {c.ago}
                      </span>
                    </div>
                    <div style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.subject}
                    </div>
                    <div style={{ color: '#4a5370', fontSize: 9, marginTop: 2 }}>→ GitHub 열기</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
