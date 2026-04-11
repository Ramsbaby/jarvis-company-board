'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

// ── 타입 ─────────────────────────────────────────────────────────────────────
interface EntitySummary {
  id: string;
  type: 'team-lead' | 'system-metric';
  name: string;
  avatar?: string;
  icon?: string;
}

interface RecentActivity {
  time: string;
  task: string;
  result: string;
  message: string;
}

interface BriefingData {
  type: string;
  id: string;
  name: string;
  title?: string;
  avatar?: string;
  icon?: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
  summary: string;
  schedule?: string;
  description?: string;
  recentActivity?: RecentActivity[];
  recentEvents?: RecentActivity[];
  metrics?: Record<string, number>;
  currentValue?: Record<string, unknown>;
  upcoming?: Array<{ time: string; task: string }>;
  lastBoardMinutes?: string | null;
  alerts?: string[];
  discordChannel?: string;
}

// ── 오피스 배치 ──────────────────────────────────────────────────────────────
const OFFICE_LAYOUT = {
  executive: ['ceo', 'infra-lead', 'trend-lead', 'audit-lead'],
  team: ['record-lead', 'career-lead', 'brand-lead', 'academy-lead'],
  serverRoom: ['cron-engine', 'discord-bot', 'disk-storage', 'circuit-breaker', 'rag-memory', 'dev-queue'],
};

const STATUS_COLOR = { GREEN: '#3fb950', YELLOW: '#d29922', RED: '#f85149' };
const STATUS_BG = { GREEN: 'rgba(63,185,80,0.1)', YELLOW: 'rgba(210,153,34,0.1)', RED: 'rgba(248,81,73,0.1)' };
const STATUS_LABEL_KR = { GREEN: '정상', YELLOW: '주의', RED: '이상' };

export default function CompanyPage() {
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, BriefingData>>({});
  const [now, setNow] = useState(new Date());

  // 시간 업데이트
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 엔티티 목록 로드 (POST로 목록 가져오기)
  useEffect(() => {
    fetch('/api/entity/_/briefing', { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: { entities: EntitySummary[] }) => setEntities(d.entities))
      .catch(() => {
        // fallback: 하드코딩 엔티티
        setEntities([
          { id: 'ceo', type: 'team-lead', name: 'CEO (정우)', avatar: '👔' },
          { id: 'infra-lead', type: 'team-lead', name: '인프라팀장', avatar: '⚙️' },
          { id: 'trend-lead', type: 'team-lead', name: '정보팀장', avatar: '📡' },
          { id: 'audit-lead', type: 'team-lead', name: '감사팀장', avatar: '🔍' },
          { id: 'record-lead', type: 'team-lead', name: '기록팀장', avatar: '🗄️' },
          { id: 'career-lead', type: 'team-lead', name: '커리어팀장', avatar: '🚀' },
          { id: 'brand-lead', type: 'team-lead', name: '브랜드팀장', avatar: '📣' },
          { id: 'academy-lead', type: 'team-lead', name: '학습팀장', avatar: '📚' },
          { id: 'cron-engine', type: 'system-metric', name: '크론 엔진', icon: '📊' },
          { id: 'discord-bot', type: 'system-metric', name: 'Discord 봇', icon: '🤖' },
          { id: 'disk-storage', type: 'system-metric', name: '디스크', icon: '💾' },
          { id: 'circuit-breaker', type: 'system-metric', name: '서킷 브레이커', icon: '🛡️' },
          { id: 'rag-memory', type: 'system-metric', name: 'RAG 기억', icon: '🧠' },
          { id: 'dev-queue', type: 'system-metric', name: '개발 큐', icon: '📋' },
        ]);
      });
  }, []);

  // 모든 엔티티 상태 주기적 로드 (30초)
  const fetchAllStatuses = useCallback(async () => {
    const ids = [...OFFICE_LAYOUT.executive, ...OFFICE_LAYOUT.team, ...OFFICE_LAYOUT.serverRoom];
    const results: Record<string, BriefingData> = {};
    await Promise.allSettled(
      ids.map(async id => {
        try {
          const res = await fetch(`/api/entity/${id}/briefing`);
          if (!res.ok) return;
          results[id] = await res.json() as BriefingData;
        } catch { /* skip */ }
      })
    );
    if (Object.keys(results).length > 0) setStatuses(prev => ({ ...prev, ...results }));
  }, []);

  useEffect(() => {
    fetchAllStatuses();
    const t = setInterval(fetchAllStatuses, 30_000);
    return () => clearInterval(t);
  }, [fetchAllStatuses]);

  // 엔티티 클릭 → 브리핑 패널
  const openBriefing = async (id: string) => {
    setLoading(true);
    setPanelOpen(true);
    try {
      const res = await fetch(`/api/entity/${id}/briefing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as BriefingData;
      setBriefing(data);
    } catch {
      setBriefing(null);
    }
    setLoading(false);
  };

  const closeBriefing = () => { setPanelOpen(false); setBriefing(null); };

  // 엔티티 찾기 헬퍼
  const findEntity = (id: string) => entities.find(e => e.id === id);

  // ── 렌더링 ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117', color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* 헤더 */}
      <header style={{
        padding: '16px 24px', borderBottom: '1px solid #21262d',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ color: '#8b949e', textDecoration: 'none', fontSize: 14 }}>← Board</Link>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🏢 Jarvis Company</h1>
        </div>
        <div style={{ color: '#8b949e', fontSize: 14 }}>
          {now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit' })} KST
        </div>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 57px)' }}>
        {/* 메인 오피스 플로어 */}
        <main style={{
          flex: 1, padding: 24, overflowY: 'auto',
          transition: 'margin-right 0.3s ease',
          marginRight: panelOpen ? 400 : 0,
        }}>
          {/* 임원실 */}
          <Section title="🏛️ 임원실" subtitle="CEO & 핵심 팀장">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {OFFICE_LAYOUT.executive.map(id => (
                <DeskCard key={id} id={id} entity={findEntity(id)} status={statuses[id]} onClick={() => openBriefing(id)} />
              ))}
            </div>
          </Section>

          {/* 팀 오피스 */}
          <Section title="🏢 팀 오피스" subtitle="전문 팀장">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {OFFICE_LAYOUT.team.map(id => (
                <DeskCard key={id} id={id} entity={findEntity(id)} status={statuses[id]} onClick={() => openBriefing(id)} />
              ))}
            </div>
          </Section>

          {/* 서버룸 */}
          <Section title="🖥️ 서버룸" subtitle="시스템 메트릭">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {OFFICE_LAYOUT.serverRoom.map(id => (
                <DeskCard key={id} id={id} entity={findEntity(id)} status={statuses[id]} onClick={() => openBriefing(id)} />
              ))}
            </div>
          </Section>
        </main>

        {/* 브리핑 패널 */}
        <aside style={{
          position: 'fixed', right: 0, top: 57, bottom: 0, width: 400,
          background: '#161b22', borderLeft: '1px solid #21262d',
          transform: panelOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          overflowY: 'auto', zIndex: 10,
        }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>로딩 중...</div>
          ) : briefing ? (
            <BriefingPanel data={briefing} onClose={closeBriefing} />
          ) : panelOpen ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>데이터를 불러올 수 없습니다</div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

// ── 섹션 컴포넌트 ────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#e6edf3' }}>{title}</h2>
        <span style={{ fontSize: 12, color: '#8b949e' }}>{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

// ── 데스크 카드 ──────────────────────────────────────────────────────────────
function DeskCard({ id, entity, status, onClick }: {
  id: string;
  entity?: EntitySummary;
  status?: BriefingData;
  onClick: () => void;
}) {
  const name = entity?.name || id;
  const display = entity?.avatar || entity?.icon || '❓';
  const loaded = !!status;
  const st = status?.status || 'GREEN';
  const summary = status?.summary || '상태 확인 중...';

  return (
    <button
      onClick={onClick}
      style={{
        background: loaded ? STATUS_BG[st] : 'rgba(139,148,158,0.05)',
        border: `1px solid ${loaded ? STATUS_COLOR[st] + '33' : '#30363d'}`,
        borderRadius: 12,
        padding: '16px 12px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.2s ease',
        position: 'relative',
        opacity: loaded ? 1 : 0.7,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = STATUS_COLOR[st];
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = `${STATUS_COLOR[st]}33`;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      title={summary}
    >
      {/* 상태 LED */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        width: 8, height: 8, borderRadius: '50%',
        background: loaded ? STATUS_COLOR[st] : '#484f58',
        boxShadow: loaded ? `0 0 6px ${STATUS_COLOR[st]}` : 'none',
      }} />

      {/* 아바타 */}
      <div style={{ fontSize: 32, marginBottom: 8 }}>{display}</div>

      {/* 이름 */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>
        {name.length > 10 ? name.slice(0, 9) + '…' : name}
      </div>

      {/* 1줄 요약 */}
      <div style={{
        fontSize: 11, color: '#8b949e',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {summary.length > 20 ? summary.slice(0, 19) + '…' : summary}
      </div>
    </button>
  );
}

// ── 브리핑 패널 ──────────────────────────────────────────────────────────────
function BriefingPanel({ data, onClose }: { data: BriefingData; onClose: () => void }) {
  const st = data.status;
  const activities = data.recentActivity || data.recentEvents || [];

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* 닫기 버튼 */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 12, right: 12,
        background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18,
      }}>✕</button>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 40 }}>{data.avatar || data.icon}</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3' }}>{data.name}</div>
          <div style={{ fontSize: 13, color: '#8b949e' }}>{data.title || data.description}</div>
          {data.schedule && <div style={{ fontSize: 12, color: '#8b949e' }}>📅 {data.schedule}</div>}
        </div>
      </div>

      {/* 상태 배지 */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderRadius: 20,
        background: STATUS_BG[st], border: `1px solid ${STATUS_COLOR[st]}`,
        marginBottom: 20,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[st] }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: STATUS_COLOR[st] }}>{STATUS_LABEL_KR[st]}</span>
      </div>

      {/* 현재 상태 요약 */}
      <PanelSection title="📌 현재 상태">
        <p style={{ margin: 0, fontSize: 14, color: '#e6edf3', lineHeight: 1.6 }}>{data.summary}</p>
      </PanelSection>

      {/* 핵심 지표 */}
      {data.metrics && Object.keys(data.metrics).length > 0 && (
        <PanelSection title="📊 핵심 지표">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Object.entries(data.metrics).map(([key, val]) => (
              <div key={key} style={{
                background: '#0d1117', borderRadius: 8, padding: '8px 12px',
                border: '1px solid #21262d',
              }}>
                <div style={{ fontSize: 11, color: '#8b949e' }}>{formatMetricLabel(key)}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3' }}>
                  {typeof val === 'number' && key.includes('Rate') ? `${val}%` : val}
                </div>
              </div>
            ))}
          </div>
        </PanelSection>
      )}

      {/* 경고 */}
      {data.alerts && data.alerts.length > 0 && (
        <PanelSection title="🚨 경고">
          {data.alerts.map((alert, i) => (
            <div key={i} style={{
              background: 'rgba(248,81,73,0.1)', border: '1px solid #f8514933',
              borderRadius: 8, padding: '8px 12px', marginBottom: 6,
              fontSize: 13, color: '#f85149',
            }}>{alert}</div>
          ))}
        </PanelSection>
      )}

      {/* 최근 활동 */}
      {activities.length > 0 && (
        <PanelSection title="📋 최근 활동">
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {activities.map((a, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, padding: '6px 0',
                borderBottom: i < activities.length - 1 ? '1px solid #21262d' : 'none',
                fontSize: 13,
              }}>
                <span style={{ color: '#8b949e', whiteSpace: 'nowrap', minWidth: 50 }}>
                  {(a.time || '').slice(11, 16)}
                </span>
                <span style={{ color: resultColor(a.result), fontWeight: 600, minWidth: 50 }}>
                  {a.result}
                </span>
                <span style={{ color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.task || (a as { event?: string }).event}
                </span>
              </div>
            ))}
          </div>
        </PanelSection>
      )}

      {/* 예정 작업 */}
      {data.upcoming && data.upcoming.length > 0 && (
        <PanelSection title="🔮 예정 작업">
          {data.upcoming.map((u, i) => (
            <div key={i} style={{ fontSize: 13, padding: '4px 0', color: '#e6edf3' }}>
              <span style={{ color: '#8b949e' }}>{u.time}</span>{' '}
              <span>{u.task}</span>
            </div>
          ))}
        </PanelSection>
      )}

      {/* 최근 보드 회의록 */}
      {data.lastBoardMinutes && (
        <PanelSection title="📝 최근 보고">
          <pre style={{
            background: '#0d1117', borderRadius: 8, padding: 12,
            fontSize: 12, color: '#8b949e', whiteSpace: 'pre-wrap',
            maxHeight: 150, overflowY: 'auto', border: '1px solid #21262d',
          }}>{data.lastBoardMinutes}</pre>
        </PanelSection>
      )}

      {/* 말걸기 (Discord 채널) */}
      {data.discordChannel && (
        <PanelSection title="💬 말걸기">
          <MessageSender channel={data.discordChannel} entityName={data.name} />
        </PanelSection>
      )}
    </div>
  );
}

// ── 패널 섹션 ────────────────────────────────────────────────────────────────
function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#8b949e' }}>{title}</h3>
      {children}
    </div>
  );
}

// ── 말걸기 (Discord 전송) ────────────────────────────────────────────────────
function MessageSender({ channel, entityName }: { channel: string; entityName: string }) {
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!msg.trim()) return;
    try {
      const res = await fetch('/api/relay-discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, message: `[Company] ${entityName}에게: ${msg}` }),
      });
      if (res.ok) {
        setSent(true);
        setMsg('');
        setTimeout(() => setSent(false), 3000);
      }
    } catch { /* skip */ }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={`${entityName}에게 메시지...`}
          style={{
            flex: 1, background: '#0d1117', border: '1px solid #21262d',
            borderRadius: 8, padding: '8px 12px', color: '#e6edf3', fontSize: 13,
            outline: 'none',
          }}
        />
        <button onClick={send} style={{
          background: '#238636', border: 'none', borderRadius: 8,
          padding: '8px 16px', color: '#fff', fontSize: 13, cursor: 'pointer',
        }}>전송</button>
      </div>
      {sent && <div style={{ fontSize: 12, color: '#3fb950', marginTop: 6 }}>✅ 메시지 전송됨</div>}
    </div>
  );
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function resultColor(result: string): string {
  if (result === 'SUCCESS') return '#3fb950';
  if (result === 'FAILED') return '#f85149';
  if (result === 'SKIPPED') return '#d29922';
  if (result === 'RUNNING') return '#58a6ff';
  return '#8b949e';
}

function formatMetricLabel(key: string): string {
  const map: Record<string, string> = {
    cronSuccessRate: '크론 성공률',
    totalToday: '오늘 실행',
    failedToday: '오늘 실패',
    activeTasks: '활성 태스크',
  };
  return map[key] || key;
}
