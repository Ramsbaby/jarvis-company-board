'use client';
/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Team briefing popup (팀장 클릭 시)
   Extracted from app/company/VirtualOffice.tsx
   ═══════════════════════════════════════════════════════════════════ */
import React from 'react';
import { ROOMS, ROOM_TO_CRON_TEAM, statusExplanation, activityIcon } from '@/lib/map/rooms';
import type { BriefingData, CronItem } from '@/lib/map/rooms';

interface ChatMessage { role: string; content: string; created_at: number }

interface TeamBriefingPopupProps {
  popupOpen: boolean;
  popupLoading: boolean;
  briefing: BriefingData | null;
  isMobile: boolean;
  cronData: CronItem[];
  closePopup: () => void;
  chatPanelOpen: boolean;
  setChatPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
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
  popupOpen, popupLoading, briefing, isMobile, cronData, closePopup,
  chatPanelOpen, setChatPanelOpen, chatMessages, chatLoading,
  chatInput, setChatInput, chatResp, sendMessage, chatEndRef,
}: TeamBriefingPopupProps) {
  if (!popupOpen) return null;
  return (
    <div
      onClick={closePopup}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,6,16,0.92)',
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : '92vw',
          maxWidth: isMobile ? '100%' : 680,
          height: isMobile ? '100%' : 'auto',
          maxHeight: isMobile ? '100%' : '92vh',
          background: isMobile ? '#0c0f1e' : 'linear-gradient(160deg, #0e1225 0%, #090c18 100%)',
          borderRadius: isMobile ? 0 : 22,
          border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isMobile ? 'none' : '0 0 0 1px rgba(255,255,255,0.02), 0 32px 100px rgba(0,0,0,0.95)',
          overflowY: 'auto',
          padding: isMobile ? '16px 16px 36px' : '28px 32px',
          color: '#e6edf3',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {popupLoading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#8b949e' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <div style={{ fontSize: 14, color: '#6b7280', letterSpacing: 0.5 }}>브리핑 로딩 중...</div>
            <div style={{ marginTop: 16, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', width: 100, margin: '16px auto 0' }}>
              <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg, transparent, #58a6ff, transparent)' }} />
            </div>
          </div>
        ) : briefing ? (() => {
          const room = ROOMS.find(r => r.entityId === briefing.id || r.id === briefing.id);
          const teamColorHex = room?.teamColor || '#58a6ff';
          return (
            <>
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
                  }}>{briefing.summary}</div>
                </div>
              )}

              {/* ① 리소스 KPI 시각화 — summary 텍스트에서 % 수치 파싱 */}
              {briefing.summary && (() => {
                type MetricItem = { label: string; value: number; color: string; icon: string };
                const metrics: MetricItem[] = [];
                const diskM = briefing.summary.match(/디스크\s*(\d+)%/);
                if (diskM) {
                  const v = parseInt(diskM[1]);
                  metrics.push({ label: '디스크 사용률', value: v, icon: '💾',
                    color: v >= 90 ? '#f85149' : v >= 70 ? '#d29922' : '#3fb950' });
                }
                const memM = briefing.summary.match(/메모리\s*(\d+)%/);
                if (memM) {
                  const v = parseInt(memM[1]);
                  metrics.push({ label: '메모리 사용률', value: v, icon: '🧠',
                    color: v >= 90 ? '#f85149' : v >= 70 ? '#d29922' : '#3fb950' });
                }
                const cpuM = briefing.summary.match(/CPU\s*(\d+)%/i);
                if (cpuM) {
                  const v = parseInt(cpuM[1]);
                  metrics.push({ label: 'CPU 사용률', value: v, icon: '⚡',
                    color: v >= 90 ? '#f85149' : v >= 70 ? '#d29922' : '#3fb950' });
                }
                if (metrics.length === 0) return null;
                return (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                      🖥️ 리소스 현황
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {metrics.map((m, i) => (
                        <div key={i} style={{
                          padding: '12px 14px', borderRadius: 12,
                          background: `linear-gradient(135deg, ${m.color}0d 0%, rgba(255,255,255,0.02) 100%)`,
                          border: `1px solid ${m.color}22`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 12, color: '#b8c2d8', fontWeight: 600 }}>{m.icon} {m.label}</span>
                            <span style={{ fontSize: 18, fontWeight: 900, color: m.color, letterSpacing: -0.5 }}>{m.value}%</span>
                          </div>
                          <div style={{ height: 7, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${m.value}%`, borderRadius: 4,
                              background: `linear-gradient(90deg, ${m.color}70, ${m.color})`,
                              transition: 'width 0.8s ease',
                            }} />
                          </div>
                          <div style={{ fontSize: 10, color: '#4a5370', marginTop: 5 }}>
                            {m.value < 70 ? '✓ 정상 범위' : m.value < 90 ? '⚠ 주의 필요' : '🚨 위험'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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
                        return (
                          <div key={i} style={{
                            padding: '10px 13px',
                            background: isFail ? 'rgba(248,81,73,0.07)' : `linear-gradient(135deg, ${actColor}09 0%, rgba(255,255,255,0.02) 100%)`,
                            border: `1px solid ${actColor}18`,
                            borderLeft: `3px solid ${actColor}90`,
                            borderRadius: 10,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, flexShrink: 0 }}>{activityIcon(g.result)}</span>
                              <span style={{ color: '#6e7681', fontFamily: 'monospace', fontSize: 10, flexShrink: 0 }}>
                                {(g.latestTime || '').slice(11, 16)}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#c9d1d9', fontSize: 12, fontWeight: 600, flex: 1 }}>
                                {g.task}
                              </span>
                              {g.count > 1 && (
                                <span style={{
                                  flexShrink: 0, fontSize: 10, fontWeight: 700, color: actColor,
                                  background: actColor + '18', border: `1px solid ${actColor}30`,
                                  borderRadius: 10, padding: '1px 7px',
                                }}>×{g.count}</span>
                              )}
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
                      {deduped.slice(0, 4).map((u, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 12px', borderRadius: 9,
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                        }}>
                          <span style={{ fontSize: 12, color: '#b8c2d8', fontWeight: 500 }}>{u.taskKo || u.task}</span>
                          <span style={{ fontSize: 11, color: '#5a6480', fontFamily: 'monospace', flexShrink: 0, marginLeft: 8 }}>{u.time}</span>
                        </div>
                      ))}
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
                  <pre style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 10, padding: 14, fontSize: 11,
                    color: '#8b949e', whiteSpace: 'pre-wrap',
                    maxHeight: 130, overflowY: 'auto',
                    lineHeight: 1.6, margin: 0,
                  }}>
                    {briefing.lastBoardMinutes || briefing.boardMinutes?.content || ''}
                  </pre>
                </div>
              )}

              {/* 팀장 AI 질문 버튼 (인라인 채팅 → 접을 수 있는 버튼으로 대체) */}
              <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#484f58' }}>
                  {briefing.schedule ? `다음 실행: ${briefing.schedule}` : ''}
                </span>
                <button
                  onClick={() => { setChatPanelOpen(v => !v); }}
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
              {chatPanelOpen && (
                <div style={{ marginTop: 12 }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                    padding: 12, maxHeight: 200, overflowY: 'auto', marginBottom: 8,
                    minHeight: chatMessages.length > 0 ? 80 : 48,
                  }}>
                    {chatMessages.length === 0 && (
                      <div style={{ fontSize: 12, color: '#484f58', textAlign: 'center', padding: 10 }}>
                        {briefing.name}에게 질문해보세요
                      </div>
                    )}
                    {chatMessages.map((m, i) => (
                      <div key={i} style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8,
                      }}>
                        {m.role !== 'user' && (
                          <span style={{ fontSize: 10, color: '#6e7681', marginBottom: 2, marginLeft: 4 }}>
                            {briefing.emoji} {briefing.name}
                          </span>
                        )}
                        <div style={{
                          maxWidth: '85%', padding: '8px 12px',
                          borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                          background: m.role === 'user' ? 'linear-gradient(135deg, #238636, #1a6b2a)' : 'rgba(255,255,255,0.07)', color: '#e6edf3',
                        }}>{m.content}</div>
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
              )}
            </>
          );
        })() : (
          <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1F3E2;</div>
            <div style={{ fontSize: 13 }}>현재 데이터를 수집하고 있어요</div>
          </div>
        )}

      </div>
    </div>
  );
}
