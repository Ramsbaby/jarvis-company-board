'use client';
/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Team briefing popup (팀장 클릭 시)
   Extracted from app/company/VirtualOffice.tsx
   ═══════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { ROOMS, ROOM_TO_CRON_TEAM, statusExplanation, activityIcon } from '@/lib/map/rooms';
import type { BriefingData, CronItem, RoomDef } from '@/lib/map/rooms';
import { cronToHuman } from '@/lib/map/cron-human';
import MarkdownContent from '@/components/MarkdownContent';
import MetricDetailModal from '@/components/map/MetricDetailModal';

interface ChatMessage { role: string; content: string; created_at: number }

type MetricType = 'disk' | 'memory' | 'cpu';
type MetricItem = { label: string; value: number; color: string; icon: string; type: MetricType };

interface TeamBriefingPopupProps {
  popupOpen: boolean;
  popupLoading: boolean;
  briefing: BriefingData | null;
  activeRoom: RoomDef | null;
  isMobile: boolean;
  cronData: CronItem[];
  closePopup: () => void;
  chatPanelOpen: boolean;
  setChatPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatHasMore: boolean;
  chatHistoryLoading: boolean;
  loadMoreHistory: () => void;
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  chatResp: string;
  sendMessage: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

const stColor = (s: string) => {
  if (s === 'GREEN') return '#3fb950';
  if (s === 'RED') return '#f85149';
  return '#d29922';
};

export default function TeamBriefingPopup({
  popupOpen, popupLoading, briefing, activeRoom, isMobile, cronData, closePopup,
  chatPanelOpen, setChatPanelOpen, chatMessages, chatLoading,
  chatHasMore, chatHistoryLoading, loadMoreHistory,
  chatInput, setChatInput, chatResp, sendMessage, chatEndRef,
}: TeamBriefingPopupProps) {
  const [metricDetail, setMetricDetail] = useState<MetricItem | null>(null);
  const [activityDetail, setActivityDetail] = useState<{ task: string; result: string; latestTime?: string; description?: string; matchedCron: CronItem | null } | null>(null);
  const [mobileTab, setMobileTab] = useState<'briefing' | 'chat'>('briefing');
  if (!popupOpen) return null;
  const showTwoCol = !isMobile && chatPanelOpen;
  return (
    <div
      onClick={closePopup}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,6,16,0.92)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : '92vw',
          maxWidth: isMobile ? '100%' : (showTwoCol ? 1080 : 680),
          height: isMobile ? 'auto' : (showTwoCol ? '88vh' : 'auto'),
          maxHeight: isMobile ? '92dvh' : '92vh',
          background: isMobile
            ? 'linear-gradient(180deg, #0e1225 0%, #090c18 100%)'
            : 'linear-gradient(160deg, #0e1225 0%, #090c18 100%)',
          borderRadius: isMobile ? '20px 20px 0 0' : 22,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: isMobile
            ? '0 -8px 40px rgba(0,0,0,0.8)'
            : '0 0 0 1px rgba(255,255,255,0.02), 0 32px 100px rgba(0,0,0,0.95)',
          overflow: showTwoCol ? 'hidden' : 'hidden auto',
          padding: 0,
          display: showTwoCol ? 'flex' : 'block',
          transition: 'max-width 0.3s ease',
          color: '#e6edf3',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* ── 모바일 탭 바 (채팅 열린 상태) ── */}
        {isMobile && chatPanelOpen && briefing && (
          <div style={{
            display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(14,18,37,0.95)', position: 'sticky', top: 0, zIndex: 10,
          }}>
            {(['briefing', 'chat'] as const).map(tab => (
              <button key={tab} onClick={() => setMobileTab(tab)} style={{
                flex: 1, padding: '14px 0', fontSize: 13, fontWeight: mobileTab === tab ? 800 : 500,
                color: mobileTab === tab ? '#e6edf3' : '#6e7681',
                background: mobileTab === tab ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: 'none', borderBottom: mobileTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                {tab === 'briefing' ? `📋 브리핑` : `💬 채팅`}
              </button>
            ))}
          </div>
        )}

        {popupLoading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#8b949e' }}>
            <style>{`
              @keyframes jmShimmer {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(200%); }
              }
              @keyframes jmPulse {
                0%, 100% { transform: scale(1); opacity: 0.85; }
                50%      { transform: scale(1.12); opacity: 1; }
              }
              @keyframes jmRotate {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
              }
              @keyframes jmFadeDots {
                0%, 20%  { opacity: 0.2; }
                40%      { opacity: 1; }
                60%, 100% { opacity: 0.2; }
              }
            `}</style>
            {/* 회전 링 스피너 */}
            <div style={{
              width: 56, height: 56,
              margin: '0 auto 18px',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                border: '3px solid rgba(88,166,255,0.08)',
                borderRadius: '50%',
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                border: '3px solid transparent',
                borderTopColor: '#58a6ff',
                borderRightColor: '#58a6ff',
                borderRadius: '50%',
                animation: 'jmRotate 0.9s linear infinite',
              }} />
              {/* 가운데 pulse 코어 */}
              <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                width: 18, height: 18,
                marginTop: -9, marginLeft: -9,
                borderRadius: '50%',
                background: 'radial-gradient(circle at center, #58a6ff 0%, #1f6feb 70%, transparent 100%)',
                animation: 'jmPulse 1.4s ease-in-out infinite',
                filter: 'blur(0.5px)',
              }} />
            </div>
            <div style={{ fontSize: 14, color: '#c9d1d9', letterSpacing: 0.5, fontWeight: 600 }}>
              브리핑 로딩 중
              <span style={{ animation: 'jmFadeDots 1.4s infinite', animationDelay: '0s' }}>.</span>
              <span style={{ animation: 'jmFadeDots 1.4s infinite', animationDelay: '0.2s' }}>.</span>
              <span style={{ animation: 'jmFadeDots 1.4s infinite', animationDelay: '0.4s' }}>.</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>cron.log · 메모리 · RAG 집계 중</div>
            {/* 하단 shimmer 바 */}
            <div style={{
              marginTop: 20, height: 3,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 2, overflow: 'hidden',
              width: 160, margin: '20px auto 0',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: '50%', height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(88,166,255,0.8), transparent)',
                animation: 'jmShimmer 1.3s ease-in-out infinite',
              }} />
            </div>
          </div>
        ) : briefing ? (() => {
          const room = ROOMS.find(r => r.entityId === briefing.id || r.id === briefing.id);
          const teamColorHex = room?.teamColor || '#58a6ff';
          return (
            <>
              {/* ── 좌측: 브리핑 컬럼 ── */}
              <div style={{
                flex: showTwoCol ? '0 0 55%' : '1 1 auto',
                overflowY: 'auto',
                maxHeight: showTwoCol ? '88vh' : undefined,
                padding: isMobile ? '20px 16px 24px' : '28px 32px',
                display: (isMobile && chatPanelOpen && mobileTab === 'chat') ? 'none' : 'block',
              }}>
              {/* Header — hero banner with team color */}
              <div style={{
                margin: isMobile ? '-16px -16px 20px' : '-28px -32px 20px',
                padding: isMobile ? '20px 16px 20px' : '28px 32px 22px',
                background: `linear-gradient(135deg, ${teamColorHex}1e 0%, ${teamColorHex}08 50%, transparent 85%)`,
                borderBottom: `1px solid ${teamColorHex}1a`,
                borderRadius: isMobile ? 0 : '22px 22px 0 0',
                position: 'relative',
              }}>
                {/* Top row: emoji + title + close */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      fontSize: 44,
                      background: `linear-gradient(135deg, ${teamColorHex}28, ${teamColorHex}10)`,
                      border: `2px solid ${teamColorHex}55`,
                      borderRadius: 16,
                      width: 72, height: 72,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 0 0 6px ${teamColorHex}10, 0 0 32px ${teamColorHex}40`,
                      flexShrink: 0,
                    }}>
                      {briefing.emoji || briefing.avatar || briefing.icon || room?.emoji || '👤'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* ④ 이름 계층: "팀명 · NPC" → 팀명 크게, NPC 작게 */}
                      {(() => {
                        const parts = (briefing.name || '').split('·').map((s: string) => s.trim());
                        const teamName = parts[0] || briefing.name;
                        const npcName = parts[1] || null;
                        return (
                          <>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#edf2ff', lineHeight: 1.15, letterSpacing: -0.4 }}>{teamName}</div>
                            {npcName && (
                              <div style={{ fontSize: 11, color: teamColorHex, fontWeight: 600, marginTop: 2, opacity: 0.8 }}>
                                👤 {npcName} 담당
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div style={{ fontSize: 12, color: '#7a8aaa', lineHeight: 1.55, marginTop: 5 }}>
                        {briefing.roomDescription || briefing.description || room?.description || ''}
                      </div>
                      {(briefing.schedule || briefing.title) && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          marginTop: 6, padding: '3px 10px',
                          background: teamColorHex + '12', border: `1px solid ${teamColorHex}25`,
                          borderRadius: 20, fontSize: 11, color: teamColorHex,
                        }}>
                          {briefing.schedule && <span>📅 {briefing.schedule}</span>}
                          {briefing.schedule && briefing.title && <span>·</span>}
                          {briefing.title && <span>{briefing.title}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={closePopup}
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#8094b0',
                      cursor: 'pointer', fontSize: 15, padding: '0',
                      borderRadius: 10, width: 36, height: 36, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}
                    aria-label="닫기"
                  >✕</button>
                </div>
              </div>

              {/* ── ⚡ 팀 역할 — GREEN이면 헤더에 이미 표시됨 → 숨김. RED/YELLOW만 표시 ── */}
              {(() => {
                const roleDesc = briefing.roomDescription || briefing.description || room?.description;
                if (!roleDesc || briefing.status === 'GREEN') return null;
                return (
                  <div style={{
                    marginBottom: 18,
                    padding: '14px 16px',
                    background: teamColorHex + '0a',
                    border: `1px solid ${teamColorHex}25`,
                    borderLeft: `4px solid ${teamColorHex}`,
                    boxShadow: `inset 0 0 20px ${teamColorHex}06`,
                    borderRadius: 12,
                  }}>
                    <div style={{ fontSize: 11, color: teamColorHex, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      ⚡ 팀 역할
                    </div>
                    <div style={{ fontSize: 13, color: '#c9d1d9', lineHeight: 1.75 }}>
                      {roleDesc}
                    </div>
                    {briefing.schedule && (
                      <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: teamColorHex + '12', border: `1px solid ${teamColorHex}25`, borderRadius: 20, fontSize: 11, color: teamColorHex }}>
                        📅 {briefing.schedule}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── 🚨 실패 감지 (RED일 때 최우선 표시) ── */}
              {briefing.status === 'RED' && (() => {
                const hasAlerts = briefing.alerts && briefing.alerts.length > 0;
                // alerts가 없으면 recentActivity + cronData에서 실패 원인 추론
                const failedActivities = (briefing.recentActivity || []).filter((a: { result?: string }) => a.result === 'failed');
                const teamLabel = ROOM_TO_CRON_TEAM[briefing.id] || ROOM_TO_CRON_TEAM[room?.id || ''];
                const failingCrons = teamLabel
                  ? cronData.filter(c => c.status === 'failed' && c.team === teamLabel).slice(0, 4)
                  : [];
                if (!hasAlerts && failedActivities.length === 0 && failingCrons.length === 0) {
                  return (
                    <div style={{
                      marginBottom: 18, padding: '12px 16px',
                      background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.25)',
                      borderLeft: '4px solid #f85149', borderRadius: 12,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🚨</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f85149' }}>이상 감지 — 상세 정보 수집 중</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8b949e', marginTop: 6, lineHeight: 1.5 }}>
                        최근 실행 데이터가 아직 없습니다. 다음 크론 실행 후 상세 원인이 표시됩니다.
                      </div>
                    </div>
                  );
                }
                return (
                  <div style={{
                    marginBottom: 18, padding: '14px 16px',
                    background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.35)',
                    borderLeft: '4px solid #f85149', borderRadius: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 16 }}>🚨</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#f85149' }}>
                        이상 감지 — {hasAlerts ? `${briefing.alerts!.length}건 경보` : failedActivities.length > 0 ? `${failedActivities.length}건 실패` : `크론 ${failingCrons.length}건 실패`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {/* alerts 우선 표시 */}
                      {hasAlerts && briefing.alerts!.map((a, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: 8,
                          background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)',
                          fontSize: 12, color: '#fca5a5', lineHeight: 1.5, fontFamily: 'monospace',
                        }}>
                          <span style={{ color: '#f85149', marginRight: 6 }}>✗</span>{a}
                        </div>
                      ))}
                      {/* recentActivity 실패 항목 */}
                      {!hasAlerts && failedActivities.slice(0, 3).map((a: { task?: string; time?: string; message?: string }, i: number) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: 8,
                          background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.18)',
                          fontSize: 12, color: '#fca5a5', lineHeight: 1.5,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ color: '#f85149' }}>✗</span>
                            <span style={{ fontWeight: 600 }}>{a.task || '알 수 없음'}</span>
                            <span style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 10 }}>{(a.time || '').slice(11, 16)}</span>
                          </div>
                          {a.message && <div style={{ color: '#8b949e', fontSize: 11, marginLeft: 14 }}>{String(a.message).slice(0, 100)}</div>}
                        </div>
                      ))}
                      {/* cronData에서 같은 팀 실패 크론 */}
                      {!hasAlerts && failedActivities.length === 0 && failingCrons.map((c, i) => (
                        <div key={i} style={{
                          padding: '8px 12px', borderRadius: 8,
                          background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.18)',
                          fontSize: 12, color: '#fca5a5', lineHeight: 1.5,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ color: '#f85149' }}>✗</span>
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                            <span style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 10 }}>{c.lastRun ? (c.lastRun).slice(11, 16) : ''}</span>
                          </div>
                          {c.outputSummary && <div style={{ color: '#8b949e', fontSize: 11, marginLeft: 14 }}>{c.outputSummary.slice(0, 100)}</div>}
                          {!c.outputSummary && c.lastMessage && <div style={{ color: '#8b949e', fontSize: 11, marginLeft: 14 }}>{c.lastMessage.slice(0, 80)}</div>}
                        </div>
                      ))}
                      {/* 실패 크론 일괄 재실행 */}
                      {failingCrons.length > 0 && <BulkRetryButton cronIds={failingCrons.map(c => c.id)} count={failingCrons.length} />}
                    </div>
                  </div>
                );
              })()}

              {/* Status + KPI 인라인 */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
                {/* 상태 카드 */}
                <div style={{
                  flex: '1 1 160px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 14,
                  background: `linear-gradient(135deg, ${stColor(briefing.status)}12 0%, ${stColor(briefing.status)}05 100%)`,
                  border: `1px solid ${stColor(briefing.status)}35`,
                  boxShadow: `inset 0 0 24px ${stColor(briefing.status)}05`,
                }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%',
                    background: stColor(briefing.status) + '1c',
                    border: `2px solid ${stColor(briefing.status)}60`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                    boxShadow: `0 0 16px ${stColor(briefing.status)}20`,
                  }}>
                    {briefing.status === 'GREEN' ? '✅' : briefing.status === 'RED' ? '🚨' : '⚠️'}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: stColor(briefing.status), letterSpacing: -0.2 }}>
                      {briefing.status === 'GREEN' ? '정상 운영' : briefing.status === 'RED' ? '이상 감지' : '주의 필요'}
                    </div>
                    <div style={{ fontSize: 11, color: '#7a8aaa', marginTop: 3, lineHeight: 1.45 }}>
                      {statusExplanation(briefing)}
                    </div>
                  </div>
                </div>
                {/* 성공률 카드 (stats 있을 때) */}
                {briefing.stats && (
                  <div style={{
                    flex: '1 1 120px',
                    padding: '14px 16px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    gap: 4,
                  }}>
                    <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1,
                      color: briefing.stats.rate >= 90 ? '#3fb950' : briefing.stats.rate >= 70 ? '#d29922' : '#f85149',
                    }}>{briefing.stats.rate}%</div>
                    <div style={{ fontSize: 10, color: '#5a6480', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>성공률 (24h)</div>
                  </div>
                )}
              </div>

              {/* YELLOW 경고 (alerts 있을 때) */}
              {briefing.status !== 'RED' && briefing.alerts && briefing.alerts.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {briefing.alerts.map((a, i) => (
                    <div key={i} style={{
                      padding: '10px 14px', borderRadius: 10, marginBottom: 4,
                      background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.25)',
                      borderLeft: '3px solid rgba(210,153,34,0.6)',
                      fontSize: 12, color: '#fbbf24', lineHeight: 1.5,
                    }}>
                      ⚠️ {a}
                    </div>
                  ))}
                </div>
              )}

              {/* 팀 현황 요약 */}
              {briefing.summary && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                    📌 현재 상태
                  </div>
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                    fontSize: 13, color: '#c9d1d9', lineHeight: 1.65,
                  }}>
                    <MarkdownContent content={briefing.summary} variant="dark" />
                  </div>
                </div>
              )}

              {/* ① 리소스 KPI 시각화 — summary 텍스트에서 % 수치 파싱 + 클릭 드릴다운 */}
              {briefing.summary && (() => {
                const metrics: MetricItem[] = [];
                const diskM = briefing.summary.match(/디스크\s*(\d+)%/);
                if (diskM) {
                  const v = parseInt(diskM[1]);
                  metrics.push({ label: '디스크 사용률', value: v, icon: '\uD83D\uDCBE', type: 'disk',
                    color: v >= 90 ? '#f85149' : v >= 70 ? '#d29922' : '#3fb950' });
                }
                const memM = briefing.summary.match(/메모리\s*(\d+)%/);
                if (memM) {
                  const v = parseInt(memM[1]);
                  metrics.push({ label: '메모리 사용률', value: v, icon: '\uD83E\uDDE0', type: 'memory',
                    color: v >= 90 ? '#f85149' : v >= 70 ? '#d29922' : '#3fb950' });
                }
                const cpuM = briefing.summary.match(/CPU\s*(\d+)%/i);
                if (cpuM) {
                  const v = parseInt(cpuM[1]);
                  metrics.push({ label: 'CPU 사용률', value: v, icon: '\u26A1', type: 'cpu',
                    color: v >= 90 ? '#f85149' : v >= 70 ? '#d29922' : '#3fb950' });
                }
                if (metrics.length === 0) return null;
                return (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                      🖥️ 리소스 현황 <span style={{ fontSize: 10, fontWeight: 400, color: '#5a6480', textTransform: 'none' }}>· 클릭하면 상세</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {metrics.map((m, i) => (
                        <div key={i} onClick={() => setMetricDetail(m)} style={{
                          padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                          background: `linear-gradient(135deg, ${m.color}0d 0%, rgba(255,255,255,0.02) 100%)`,
                          border: `1px solid ${m.color}22`,
                          transition: 'border-color 0.15s, background 0.15s',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 12, color: '#b8c2d8', fontWeight: 600 }}>{m.icon} {m.label}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 18, fontWeight: 900, color: m.color, letterSpacing: -0.5 }}>{m.value}%</span>
                              <span style={{ fontSize: 10, color: '#5a6480' }}>\u203A</span>
                            </div>
                          </div>
                          <div style={{ height: 7, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${m.value}%`, borderRadius: 4,
                              background: `linear-gradient(90deg, ${m.color}70, ${m.color})`,
                              transition: 'width 0.8s ease',
                            }} />
                          </div>
                          <div style={{ fontSize: 10, color: '#4a5370', marginTop: 5 }}>
                            {m.value < 70 ? '\u2713 정상 범위' : m.value < 90 ? '\u26A0 주의 필요' : '\uD83D\uDEA8 위험'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 신임 팀장 KPI (인프라팀 전용 — 이준혁) */}
              {briefing.kpi && briefing.kpi.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                    🛡️ 신임 팀장 KPI
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {briefing.kpi.map((k, i) => {
                      const ok = k.direction === 'higher' ? k.value >= k.target : k.value <= k.target;
                      const pct = k.direction === 'higher'
                        ? Math.min(100, Math.round((k.value / k.target) * 100))
                        : Math.min(100, Math.round(((k.target * 2 - k.value) / (k.target * 2)) * 100));
                      const barColor = ok ? '#3fb950' : k.value >= k.target * 0.8 ? '#d29922' : '#f85149';
                      return (
                        <div key={i} style={{
                          padding: '10px 14px', borderRadius: 10,
                          background: `linear-gradient(135deg, ${barColor}0d 0%, rgba(255,255,255,0.02) 100%)`,
                          border: `1px solid ${barColor}25`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: '#b8c2d8', fontWeight: 600 }}>{k.icon} {k.label}</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: barColor }}>
                              {k.value}{k.unit} <span style={{ fontSize: 10, color: '#5a6480', fontWeight: 400 }}>/ 목표 {k.target}{k.unit}</span>
                            </span>
                          </div>
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${pct}%`, borderRadius: 3,
                              background: `linear-gradient(90deg, ${barColor}80, ${barColor})`,
                              transition: 'width 0.8s ease',
                            }} />
                          </div>
                          <div style={{ fontSize: 10, color: '#4a5370', marginTop: 4 }}>
                            {ok ? '✓ 목표 달성' : `목표까지 ${k.direction === 'higher' ? `+${k.target - k.value}${k.unit}` : `-${k.value - k.target}${k.unit}`}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 24h KPI + 성공률 바 */}
              {briefing.stats && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                    📊 24시간 지표
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    {([
                      ['✅ 성공', String(briefing.stats.success), '#3fb950'],
                      ['❌ 실패', String(briefing.stats.failed), briefing.stats.failed > 0 ? '#f85149' : '#6e7681'],
                      ['📦 전체', String(briefing.stats.total), '#8b949e'],
                    ] as [string, string, string][]).map(([label, value, color], i) => (
                      <div key={i} style={{
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: 10, padding: '12px 10px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 10, color: '#6e7681', marginBottom: 5, fontWeight: 600 }}>{label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {/* 성공률 프로그레스 바 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: '#6e7681' }}>성공률</span>
                      <span style={{ fontSize: 10, fontWeight: 700,
                        color: briefing.stats.rate >= 90 ? '#3fb950' : briefing.stats.rate >= 70 ? '#d29922' : '#f85149',
                      }}>{briefing.stats.rate}%</span>
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${briefing.stats.rate}%`,
                        background: briefing.stats.rate >= 90 ? '#3fb950' : briefing.stats.rate >= 70 ? '#d29922' : '#f85149',
                        borderRadius: 4,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── 이 팀의 주간 성과 ── */}
              {(() => {
                const teamLabel = ROOM_TO_CRON_TEAM[briefing.id] || ROOM_TO_CRON_TEAM[room?.id || ''];
                if (!teamLabel) return null;
                const owned = cronData.filter(c => c.team === teamLabel);
                if (owned.length === 0) return null;
                // 7일 집계 (KST 기준)
                const KST_OFFSET = 9 * 3600_000;
                const WEEK_MS = 7 * 86400_000;
                const cutoff = Date.now() - WEEK_MS;
                let wkSuccess = 0, wkFailed = 0, wkTotal = 0;
                for (const c of owned) {
                  for (const r of c.recentRuns || []) {
                    const ts = Date.parse(r.timestamp);
                    if (isNaN(ts) || ts < cutoff) continue;
                    wkTotal++;
                    if (r.status === 'success') wkSuccess++;
                    else if (r.status === 'failed') wkFailed++;
                  }
                }
                if (wkTotal === 0) return null;
                const wkRate = Math.round((wkSuccess / wkTotal) * 100);
                void KST_OFFSET;
                return (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                      🏆 이번 주 성과 (7일)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {([
                        ['처리', String(wkTotal), '#8b949e', '📦'],
                        ['완료', String(wkSuccess), '#22c55e', '✅'],
                        ['실패', String(wkFailed), wkFailed > 0 ? '#f85149' : '#4b5563', '❌'],
                        ['성공률', `${wkRate}%`, wkRate >= 90 ? '#22c55e' : wkRate >= 70 ? '#d29922' : '#f85149', '📊'],
                      ] as [string, string, string, string][]).map(([label, val, color, icon], i) => (
                        <div key={i} style={{
                          padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                          background: `linear-gradient(180deg, ${color}14 0%, rgba(255,255,255,0.02) 100%)`,
                          border: `1px solid ${color}24`,
                        }}>
                          <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 3 }}>{icon} {label}</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color, letterSpacing: -0.5 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── 7일 실행 추이 sparkline ── */}
              {(() => {
                const teamLabel = ROOM_TO_CRON_TEAM[briefing.id] || ROOM_TO_CRON_TEAM[room?.id || ''];
                if (!teamLabel) return null;
                const owned = cronData.filter(c => c.team === teamLabel);
                if (owned.length === 0) return null;
                const KST_OFFSET = 9 * 3600_000;
                const now = Date.now();
                const dayKey = (ts: number) => new Date(ts + KST_OFFSET).toISOString().slice(0, 10);
                const days: { key: string; success: number; failed: number; other: number }[] = [];
                for (let i = 6; i >= 0; i--) {
                  days.push({ key: dayKey(now - i * 86400_000), success: 0, failed: 0, other: 0 });
                }
                for (const c of owned) {
                  for (const r of c.recentRuns || []) {
                    const ts = Date.parse(r.timestamp);
                    if (isNaN(ts)) continue;
                    const day = days.find(d => d.key === dayKey(ts));
                    if (!day) continue;
                    if (r.status === 'success') day.success++;
                    else if (r.status === 'failed') day.failed++;
                    else day.other++;
                  }
                }
                const maxTotal = Math.max(1, ...days.map(d => d.success + d.failed + d.other));
                const hasData = days.some(d => d.success + d.failed + d.other > 0);
                if (!hasData) return null;
                const weekDays = ['일','월','화','수','목','금','토'];
                return (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                      📈 7일 실행 추이
                    </div>
                    <div style={{
                      padding: '14px 12px 8px', borderRadius: 12,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 58 }}>
                        {days.map((d, i) => {
                          const total = d.success + d.failed + d.other;
                          const ratio = total / maxTotal;
                          const barH = Math.max(total > 0 ? 3 : 0, ratio * 48);
                          const successShare = total > 0 ? d.success / total : 0;
                          const failedShare = total > 0 ? d.failed / total : 0;
                          const dDate = new Date(d.key + 'T00:00:00+09:00');
                          const wd = weekDays[dDate.getDay()];
                          const dom = d.key.slice(8);
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }} title={`${d.key} · 성공 ${d.success} / 실패 ${d.failed}`}>
                              <div style={{ fontSize: 8, color: failedShare > 0.3 ? '#f85149' : '#6e7681', fontWeight: 600, marginBottom: 1, height: 10 }}>
                                {total > 0 ? total : ''}
                              </div>
                              <div style={{
                                width: '100%', maxWidth: 20, height: barH,
                                background: total === 0
                                  ? 'rgba(255,255,255,0.04)'
                                  : failedShare > 0
                                    ? `linear-gradient(180deg, #f85149 0%, #f85149 ${failedShare * 100}%, #22c55e ${failedShare * 100}%, #22c55e 100%)`
                                    : 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
                                borderRadius: '3px 3px 0 0',
                                opacity: successShare > 0 || failedShare > 0 ? 1 : 0.3,
                              }} />
                              <div style={{ fontSize: 9, color: '#4a5370', fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.1 }}>
                                <div>{wd}</div>
                                <div style={{ color: '#6e7681' }}>{dom}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── 책임 크론 (이 팀이 운영하는 자동화) ── */}
              {(() => {
                const teamLabel = ROOM_TO_CRON_TEAM[briefing.id] || ROOM_TO_CRON_TEAM[room?.id || ''];
                if (!teamLabel) return null;
                const owned = cronData.filter(c => c.team === teamLabel);
                if (owned.length === 0) return null;
                const statusRank: Record<string, number> = { failed: 0, skipped: 1, running: 2, unknown: 3, success: 4 };
                const sorted = [...owned].sort((a, b) => (statusRank[a.status] ?? 5) - (statusRank[b.status] ?? 5));
                const counts = { success: 0, failed: 0, other: 0 };
                for (const c of owned) {
                  if (c.status === 'success') counts.success++;
                  else if (c.status === 'failed') counts.failed++;
                  else counts.other++;
                }
                const SHOW = 8;
                return (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        🗂️ 책임 크론 ({owned.length}개)
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                        <span style={{ color: '#22c55e' }}>✅ {counts.success}</span>
                        {counts.failed > 0 && <span style={{ color: '#f85149' }}>❌ {counts.failed}</span>}
                        {counts.other > 0 && <span style={{ color: '#d29922' }}>○ {counts.other}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {sorted.slice(0, SHOW).map((c) => {
                        const sc = c.status === 'success' ? { bar: '#22c55e', bg: 'rgba(34,197,94,0.06)', label: '정상' }
                          : c.status === 'failed' ? { bar: '#f85149', bg: 'rgba(248,81,73,0.09)', label: '실패' }
                          : c.status === 'skipped' ? { bar: '#d29922', bg: 'rgba(210,153,34,0.06)', label: '건너뜀' }
                          : c.status === 'running' ? { bar: '#58a6ff', bg: 'rgba(88,166,255,0.07)', label: '실행중' }
                          : { bar: '#6b7280', bg: 'rgba(107,114,128,0.06)', label: '대기' };
                        let lastRunLabel = '—';
                        if (c.lastRun) {
                          try {
                            lastRunLabel = new Date(c.lastRun).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                          } catch { lastRunLabel = c.lastRun.slice(5, 16); }
                        }
                        return (
                          <div key={c.id} style={{
                            padding: '9px 12px', borderRadius: 9,
                            background: sc.bg,
                            border: `1px solid ${sc.bar}1f`,
                            borderLeft: `3px solid ${sc.bar}`,
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#d8e0ed', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.name}
                              </div>
                              <div style={{ fontSize: 10, color: '#6e7681', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {(c.scheduleHuman || c.schedule) && <span>⏱️ {c.scheduleHuman || c.schedule}</span>}
                                {c.lastRun && <span>🕐 {lastRunLabel}</span>}
                                {c.lastDuration && <span>⚡ {c.lastDuration}</span>}
                              </div>
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: sc.bar, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0, padding: '3px 8px', borderRadius: 10, background: sc.bar + '18', border: `1px solid ${sc.bar}30` }}>
                              {sc.label}
                            </div>
                          </div>
                        );
                      })}
                      {sorted.length > SHOW && (
                        <div style={{ fontSize: 11, color: '#5a6480', textAlign: 'center', paddingTop: 4 }}>
                          +{sorted.length - SHOW}개 더 (크론 센터에서 전체 보기)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ② 최근 활동 — 중복 그룹핑 + ⑤ GREEN시 제한 */}
              {(briefing.recentActivity?.length || briefing.recentEvents?.length) ? (() => {
                const isGreen = briefing.status === 'GREEN';
                const allActs = (briefing.recentActivity || briefing.recentEvents || []) as Array<{result?:string;time?:string;task?:string;description?:string;event?:string}>;

                // 그룹핑: task 이름 기준으로 합산 (결과 중 failed 우선)
                type Grouped = { task: string; result: string; count: number; latestTime?: string; description?: string };
                const groupMap = new Map<string, Grouped>();
                for (const a of allActs.slice(0, 30)) {
                  const taskName = a.task || a.event || '알 수 없음';
                  const existing = groupMap.get(taskName);
                  if (!existing) {
                    groupMap.set(taskName, { task: taskName, result: a.result || 'unknown', count: 1, latestTime: a.time, description: a.description });
                  } else {
                    existing.count++;
                    if (a.result === 'failed' && existing.result !== 'failed') {
                      existing.result = 'failed';
                      existing.description = a.description;
                      existing.latestTime = a.time;
                    }
                  }
                }
                const grouped = Array.from(groupMap.values());
                const MAX = isGreen ? 4 : 6;
                const shown = grouped.slice(0, MAX);
                const totalOriginal = allActs.length;
                const totalFailed = grouped.filter(g => g.result === 'failed').length;
                const totalSuccess = grouped.filter(g => g.result === 'success').length;

                return (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        📋 최근 활동
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                        <span style={{ color: '#22c55e' }}>✅ {totalSuccess}</span>
                        <span style={{ color: totalFailed > 0 ? '#f85149' : '#4b5563' }}>❌ {totalFailed}</span>
                        {totalOriginal > MAX && (
                          <span style={{ color: '#4a5370', fontSize: 10 }}>총 {totalOriginal}건</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {shown.map((g, i) => {
                        const isFail = g.result === 'failed';
                        const actColor = g.result === 'success' ? '#22c55e' : g.result === 'failed' ? '#f85149' : g.result === 'running' ? '#58a6ff' : '#6b7280';
                        // 이름으로 cronData에서 매칭되는 크론 찾기 (loose match)
                        const normalizedName = (g.task || '').toLowerCase().replace(/[\s_]+/g, '-');
                        const matched = cronData.find(c =>
                          c.id === g.task ||
                          c.name === g.task ||
                          c.id.toLowerCase() === normalizedName ||
                          (c.name && c.name.toLowerCase().includes((g.task || '').toLowerCase())) ||
                          (g.task || '').toLowerCase().includes(c.id.toLowerCase())
                        ) || null;
                        return (
                          <div
                            key={i}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivityDetail({ task: g.task, result: g.result, latestTime: g.latestTime, description: g.description, matchedCron: matched });
                            }}
                            style={{
                              padding: '10px 13px',
                              background: isFail ? 'rgba(248,81,73,0.07)' : `linear-gradient(135deg, ${actColor}09 0%, rgba(255,255,255,0.02) 100%)`,
                              border: `1px solid ${actColor}18`,
                              borderLeft: `3px solid ${actColor}90`,
                              borderRadius: 10,
                              cursor: 'pointer',
                              transition: 'transform 0.12s, background 0.15s',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateX(2px)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, flexShrink: 0 }}>{activityIcon(g.result)}</span>
                              <span style={{ color: '#6e7681', fontFamily: 'monospace', fontSize: 10, flexShrink: 0 }}>
                                {(() => {
                                  const t = g.latestTime || '';
                                  if (t.length >= 16 && t.includes(' ')) return t.slice(11, 16);
                                  if (t.length >= 5) return t.slice(0, 5);
                                  return t;
                                })()}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#c9d1d9', fontSize: 12, fontWeight: 600, flex: 1 }}>
                                {g.task.replace(/-/g, ' ').replace(/_/g, ' ')}
                              </span>
                              {g.count > 1 && (
                                <span style={{
                                  flexShrink: 0, fontSize: 10, fontWeight: 700, color: actColor,
                                  background: actColor + '18', border: `1px solid ${actColor}30`,
                                  borderRadius: 10, padding: '1px 7px',
                                }}>×{g.count}</span>
                              )}
                              <span style={{ flexShrink: 0, fontSize: 11, color: '#5a6480' }}>›</span>
                            </div>
                            {isFail && g.description && (
                              <div style={{ fontSize: 11, color: '#fca5a5', lineHeight: 1.5, marginLeft: 21, marginTop: 4, wordBreak: 'break-all' }}>
                                {g.description.slice(0, 120)}{g.description.length > 120 ? '…' : ''}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })() : null}

              {/* ③ 예정 작업 — dedupe + 카드 스타일 */}
              {briefing.upcoming && briefing.upcoming.length > 0 && (() => {
                const seenKeys = new Set<string>();
                const deduped: Array<{taskKo?:string;task?:string;time?:string}> = [];
                for (const u of briefing.upcoming) {
                  const key = (u.taskKo || u.task || '').trim();
                  if (!seenKeys.has(key)) { seenKeys.add(key); deduped.push(u); }
                }
                return (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      🔜 예정 작업
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {deduped.slice(0, 4).map((u, i) => {
                        // u.time은 raw cron expression ("30 4 * * 0") — 사람 친화 변환
                        const humanTime = cronToHuman(u.time || '');
                        return (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '9px 12px', borderRadius: 9,
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                          }}>
                            <span style={{ fontSize: 12, color: '#b8c2d8', fontWeight: 500 }}>{u.taskKo || u.task}</span>
                            <span style={{ fontSize: 11, color: '#5a6480', flexShrink: 0, marginLeft: 8 }}>{humanTime || u.time}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Board minutes */}
              {(briefing.lastBoardMinutes || briefing.boardMinutes) && (
                <div style={{ marginBottom: 14 }}>
                  <h4 style={{ color: '#8b949e', fontSize: 12, margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    &#x1F4DD; 최근 보고
                  </h4>
                  <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 10, padding: 14,
                    maxHeight: 180, overflowY: 'auto',
                  }}>
                    <MarkdownContent
                      content={briefing.lastBoardMinutes || briefing.boardMinutes?.content || ''}
                      variant="dark"
                    />
                  </div>
                </div>
              )}

              {/* 팀장 AI 질문 버튼 */}
              <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#484f58' }}>
                  {briefing.schedule ? `다음 실행: ${briefing.schedule}` : ''}
                </span>
                <button
                  onClick={() => { setChatPanelOpen(v => !v); if (isMobile) setMobileTab('chat'); }}
                  style={{
                    background: teamColorHex + '15', border: `1px solid ${teamColorHex}30`,
                    borderRadius: 8, padding: '7px 14px',
                    color: teamColorHex, fontSize: 12, cursor: 'pointer',
                    fontWeight: 700, letterSpacing: 0.3, transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span>💬</span>
                  <span>{chatPanelOpen ? '질문 닫기' : `${briefing.name}에게 질문`}</span>
                </button>
              </div>
              </div>{/* 좌측 브리핑 컬럼 끝 */}

              {/* ── 우측: 채팅 컬럼 (데스크톱 2컬럼 / 모바일 탭) ── */}
              {chatPanelOpen && (
                <div style={{
                  flex: showTwoCol ? '0 0 45%' : '1 1 auto',
                  display: (isMobile && mobileTab === 'briefing') ? 'none' : 'flex',
                  flexDirection: 'column',
                  borderLeft: showTwoCol ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  height: showTwoCol ? '88vh' : undefined,
                  maxHeight: isMobile ? '75dvh' : undefined,
                  padding: isMobile ? '16px' : '0',
                }}>
                  {/* 채팅 헤더 */}
                  <div style={{
                    padding: isMobile ? '0 0 12px' : '20px 24px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>
                      {briefing.emoji} {briefing.name}에게 질문
                    </span>
                    <button onClick={() => { setChatPanelOpen(false); if (isMobile) setMobileTab('briefing'); }} style={{
                      background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6,
                      padding: '4px 10px', color: '#8b949e', fontSize: 11, cursor: 'pointer',
                    }}>닫기</button>
                  </div>

                  {/* 채팅 메시지 영역 — flex:1로 전체 높이 사용 */}
                  <div style={{
                    flex: 1, overflowY: 'auto', padding: isMobile ? '12px 0' : '12px 24px',
                    minHeight: 0,
                  }}>
                    {chatHasMore && (
                      <div style={{ textAlign: 'center', marginBottom: 8 }}>
                        <button
                          onClick={loadMoreHistory}
                          disabled={chatHistoryLoading}
                          style={{
                            fontSize: 11, color: '#58a6ff', background: 'none', border: '1px solid rgba(88,166,255,0.3)',
                            borderRadius: 6, padding: '3px 10px', cursor: chatHistoryLoading ? 'default' : 'pointer',
                            opacity: chatHistoryLoading ? 0.5 : 1,
                          }}
                        >
                          {chatHistoryLoading ? '불러오는 중...' : '이전 대화 더 보기'}
                        </button>
                      </div>
                    )}
                    {chatMessages.length === 0 && (
                      <div style={{ fontSize: 13, color: '#484f58', textAlign: 'center', padding: '40px 10px' }}>
                        {briefing.name}에게 질문해보세요
                      </div>
                    )}
                    {chatMessages.map((m, i) => (
                      <div key={i} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10,
                      }}>
                        {m.role !== 'user' && (
                          <span style={{ fontSize: 10, color: '#6e7681', marginBottom: 2, marginLeft: 4 }}>
                            {briefing.emoji} {briefing.name}
                          </span>
                        )}
                        <div style={{
                          maxWidth: '85%', padding: '8px 12px',
                          borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          fontSize: 13, lineHeight: 1.5,
                          whiteSpace: m.role === 'user' ? 'pre-wrap' : undefined,
                          background: m.role === 'user' ? 'linear-gradient(135deg, #238636, #1a6b2a)' : 'rgba(255,255,255,0.07)', color: '#e6edf3',
                        }}>
                          {m.role === 'user'
                            ? m.content
                            : <MarkdownContent content={m.content} variant="dark" />}
                        </div>
                        <span style={{ fontSize: 9, color: '#484f58', marginTop: 2, marginLeft: 4, marginRight: 4 }}>
                          {new Date(m.created_at * 1000).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{ fontSize: 12, color: '#8b949e', padding: 6 }}>
                        {briefing.emoji} 응답 작성 중...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* 채팅 입력 영역 — 하단 고정 */}
                  <div style={{
                    padding: isMobile ? '12px 0 0' : '12px 24px 20px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                  }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !chatLoading) sendMessage(); }}
                        placeholder={`${briefing.name}에게 질문...`}
                        style={{
                          flex: 1, background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                          padding: '10px 14px', color: '#e6edf3',
                          fontSize: 13, outline: 'none',
                          fontFamily: '-apple-system, sans-serif', minHeight: 40,
                        }}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={chatLoading}
                        style={{
                          background: teamColorHex, border: 'none', borderRadius: 10,
                          padding: '10px 18px', color: '#fff', fontSize: 13, cursor: 'pointer',
                          fontWeight: 700, opacity: chatLoading ? 0.5 : 1, minHeight: 40, minWidth: 56,
                        }}
                      >전송</button>
                    </div>
                    {chatResp && <div style={{ marginTop: 6, fontSize: 12, color: '#f85149' }}>{chatResp}</div>}
                  </div>
                </div>
              )}
            </>
          );
        })() : (
          <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{activeRoom?.emoji || '\uD83C\uDFE2'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3', marginBottom: 6 }}>
              {activeRoom?.name || '알 수 없는 공간'}
            </div>
            {activeRoom?.description && (
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                {activeRoom.description}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#5a6480', marginBottom: 12 }}>
              브리핑 데이터를 불러오지 못했습니다
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); closePopup(); }}
              style={{
                padding: '8px 20px', fontSize: 12, fontWeight: 600,
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 8, color: '#818cf8', cursor: 'pointer',
              }}
            >닫기</button>
          </div>
        )}

        {/* ── 메트릭 드릴다운 모달 ── */}
        {metricDetail && (
          <MetricDetailModal
            metric={metricDetail}
            briefingSummary={briefing?.summary || ''}
            onClose={() => setMetricDetail(null)}
            isMobile={isMobile}
          />
        )}

        {/* ── 최근 활동 드릴다운 팝오버 ── */}
        {activityDetail && (
          <ActivityDetailPopover
            detail={activityDetail}
            onClose={() => setActivityDetail(null)}
            isMobile={isMobile}
          />
        )}

      </div>
    </div>
  );
}

/* ── 최근 활동 드릴다운 팝오버 ── */
type ActivityDetail = { task: string; result: string; latestTime?: string; description?: string; matchedCron: CronItem | null };
function ActivityDetailPopover({ detail, onClose, isMobile }: { detail: ActivityDetail; onClose: () => void; isMobile: boolean }) {
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<{ success: boolean; message: string; stdout?: string; stderr?: string } | null>(null);

  const handleRetry = async () => {
    if (!detail.matchedCron) return;
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await fetch('/api/crons/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronId: detail.matchedCron.id }),
      });
      const data = await res.json();
      setRetryResult(data);
    } catch (e) {
      setRetryResult({ success: false, message: `요청 실패: ${String(e)}` });
    } finally {
      setRetrying(false);
    }
  };

  const accent = detail.result === 'success' ? '#22c55e' : detail.result === 'failed' ? '#f85149' : '#d29922';
  const cron = detail.matchedCron;
  const timeFmt = (s?: string) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: 'rgba(4,6,16,0.85)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : '88vw',
          maxWidth: isMobile ? '100%' : 620,
          maxHeight: isMobile ? '90dvh' : '88vh',
          overflowY: 'auto',
          background: 'linear-gradient(165deg, #0f1326 0%, #080b18 100%)',
          borderRadius: isMobile ? '20px 20px 0 0' : 18,
          border: `1px solid ${accent}33`,
          padding: isMobile ? '22px 18px 32px' : '24px 26px',
          color: '#e6edf3',
          fontFamily: '-apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
              최근 활동 상세
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#edf2ff', lineHeight: 1.2 }}>
              {detail.task.replace(/-/g, ' ').replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
              {detail.latestTime && <span>🕐 {timeFmt(detail.latestTime)}</span>}
              {cron?.scheduleHuman && <span style={{ marginLeft: 10 }}>⏱️ {cron.scheduleHuman}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#8094b0', cursor: 'pointer', borderRadius: 10, width: 32, height: 32,
              flexShrink: 0, fontSize: 14,
            }}
            aria-label="닫기"
          >✕</button>
        </div>

        {/* Status pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 20, marginBottom: 16,
          background: accent + '18', border: `1px solid ${accent}40`,
          fontSize: 12, fontWeight: 700, color: accent,
        }}>
          {detail.result === 'success' ? '✅ 성공' : detail.result === 'failed' ? '❌ 실패' : detail.result === 'running' ? '🔄 실행중' : '○ ' + detail.result}
        </div>

        {!cron && (
          <div style={{
            marginBottom: 14, padding: 14, borderRadius: 10,
            background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.3)',
            fontSize: 12, color: '#fbbf24', lineHeight: 1.6,
          }}>
            ⚠️ 이 활동과 매칭되는 크론을 찾을 수 없습니다. cron.log에만 흔적이 있거나 태스크 이름이 변경됐을 수 있어요.
          </div>
        )}

        {cron && (
          <>
            {/* 설명 */}
            {cron.description && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#6e7681', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                  📋 하는 일
                </div>
                <div style={{
                  padding: '10px 13px', borderRadius: 9, fontSize: 12, color: '#c9d1d9', lineHeight: 1.65,
                  background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {cron.description}
                </div>
              </div>
            )}

            {/* 마지막 실행 세부 */}
            <div style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                ['⚡ 소요', cron.lastDuration || '—'],
                ['🕐 마지막', timeFmt(cron.lastRun || undefined).slice(0, 11)],
                ['🏷️ 우선순위', cron.priority || 'normal'],
              ].map(([label, val], i) => (
                <div key={i} style={{
                  padding: '9px 10px', borderRadius: 9, textAlign: 'center',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#c9d1d9' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* 실패 시: outputSummary / lastMessage 강조 */}
            {detail.result === 'failed' && (cron.outputSummary || cron.lastMessage) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#f85149', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  🚨 실패 원인 (최근)
                </div>
                <pre style={{
                  margin: 0, padding: '10px 13px', borderRadius: 9,
                  fontSize: 11, color: '#fca5a5', lineHeight: 1.55,
                  background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.22)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 160, overflowY: 'auto',
                  fontFamily: 'ui-monospace, monospace',
                }}>{cron.outputSummary || cron.lastMessage}</pre>
              </div>
            )}

            {/* 최근 실행 이력 (recentRuns) */}
            {cron.recentRuns && cron.recentRuns.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#6e7681', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  📜 최근 {Math.min(cron.recentRuns.length, 10)}회 실행
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cron.recentRuns.slice(0, 10).map((run, i) => {
                    const rc = run.status === 'success' ? '#22c55e' : run.status === 'failed' ? '#f85149' : run.status === 'running' ? '#58a6ff' : '#6b7280';
                    return (
                      <div key={i} style={{
                        padding: '6px 10px', borderRadius: 7,
                        background: rc + '0d', border: `1px solid ${rc}20`,
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 11,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: rc, flexShrink: 0 }} />
                        <span style={{ color: '#6e7681', fontFamily: 'monospace', fontSize: 10, flexShrink: 0 }}>
                          {timeFmt(run.timestamp)}
                        </span>
                        <span style={{ color: '#c9d1d9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {run.message?.slice(0, 90) || run.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CEO 가이드 (상태별) */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#6e7681', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                💡 지금 할 수 있는 일
              </div>
              <ul style={{
                margin: 0, paddingLeft: 18, fontSize: 12, color: '#c9d1d9', lineHeight: 1.7,
              }}>
                {detail.result === 'failed' ? (
                  <>
                    <li>바로 재실행 버튼을 눌러 일회성 오류인지 확인</li>
                    <li>오류 메시지를 복사해서 팀장에게 원인을 물어보기</li>
                    <li>연속 실패라면 서킷 브레이커가 곧 발동될 수 있음</li>
                  </>
                ) : detail.result === 'success' ? (
                  <>
                    <li>정상 작동 중 — 최근 실행 이력을 확인해 패턴 파악</li>
                    <li>필요 시 {cron.scheduleHuman || '스케줄'} 전 즉시 한 번 더 실행 가능</li>
                  </>
                ) : (
                  <>
                    <li>실행 상태를 확인 중 — 최근 이력 참고</li>
                    <li>문제 있어 보이면 재실행 후 로그 확인</li>
                  </>
                )}
              </ul>
            </div>

            {/* 재실행 결과 */}
            {retryResult && (
              <div style={{
                marginBottom: 12, padding: '10px 13px', borderRadius: 10,
                background: retryResult.success ? 'rgba(34,197,94,0.08)' : 'rgba(248,81,73,0.08)',
                border: `1px solid ${retryResult.success ? '#22c55e40' : '#f8514940'}`,
                borderLeft: `3px solid ${retryResult.success ? '#22c55e' : '#f85149'}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: retryResult.success ? '#22c55e' : '#f85149', marginBottom: retryResult.stdout ? 6 : 0 }}>
                  {retryResult.message}
                </div>
                {retryResult.stdout && (
                  <pre style={{
                    margin: 0, padding: '6px 8px', borderRadius: 5,
                    fontSize: 10, lineHeight: 1.5, color: '#a3b1c6',
                    background: 'rgba(0,0,0,0.28)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    maxHeight: 120, overflowY: 'auto', fontFamily: 'ui-monospace, monospace',
                  }}>{retryResult.stdout}</pre>
                )}
                {retryResult.stderr && (
                  <pre style={{
                    marginTop: 6, padding: '6px 8px', borderRadius: 5,
                    fontSize: 10, lineHeight: 1.5, color: '#fca5a5',
                    background: 'rgba(0,0,0,0.28)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    maxHeight: 120, overflowY: 'auto', fontFamily: 'ui-monospace, monospace',
                  }}>{retryResult.stderr}</pre>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleRetry}
                disabled={retrying}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, border: 'none',
                  background: accent, color: '#fff',
                  opacity: retrying ? 0.5 : 1,
                }}
              >{retrying ? '⏳ 실행 중...' : '🔄 재실행'}</button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`tail -n 100 ~/.jarvis/logs/cron.log | grep "\\[${cron.id}\\]"`);
                }}
                style={{
                  padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#c9d1d9',
                }}
              >📋 로그 명령 복사</button>
              <button
                onClick={onClose}
                style={{
                  padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#6b7280',
                }}
              >닫기</button>
            </div>
          </>
        )}

        {!cron && (
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 10, cursor: 'pointer',
              fontSize: 13, fontWeight: 700, marginTop: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c9d1d9',
            }}
          >닫기</button>
        )}
      </div>
    </div>
  );
}

/* ── 실패 크론 일괄 재실행 버튼 ── */
function BulkRetryButton({ cronIds, count }: { cronIds: string[]; count: number }) {
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);

  const handleBulkRetry = async () => {
    setRetrying(true);
    let ok = 0, fail = 0;
    for (const id of cronIds) {
      try {
        const res = await fetch('/api/crons/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cronId: id }),
        });
        const data = await res.json();
        if (data.success) ok++; else fail++;
      } catch { fail++; }
    }
    setResult({ ok, fail });
    setRetrying(false);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {result && (
        <div style={{ marginBottom: 6, fontSize: 11, color: result.fail > 0 ? '#d29922' : '#16a34a' }}>
          ✅ {result.ok}건 성공 {result.fail > 0 ? `/ ❌ ${result.fail}건 실패` : ''}
        </div>
      )}
      <button
        onClick={handleBulkRetry}
        disabled={retrying}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 8, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, border: 'none',
          background: '#f85149', color: '#fff',
          opacity: retrying ? 0.5 : 1,
        }}
      >{retrying ? '⏳ 재실행 중...' : `🔄 실패 크론 일괄 재실행 (${count}건)`}</button>
    </div>
  );
}
