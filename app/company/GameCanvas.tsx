'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ── 상수 ─────────────────────────────────────────────────────────────────────
const TILE = 32;
const MAP_COLS = 22;
const MAP_ROWS = 22;

const ROOMS = [
  { id: 'council', name: 'CEO실', emoji: '👔', x: 1, y: 1, w: 4, h: 4 },
  { id: 'infra', name: '인프라팀', emoji: '🖥️', x: 6, y: 1, w: 4, h: 4 },
  { id: 'trend', name: '정보팀', emoji: '📰', x: 11, y: 1, w: 4, h: 4 },
  { id: 'finance', name: '재무팀', emoji: '📊', x: 16, y: 1, w: 4, h: 4 },
  { id: 'record', name: '기록팀', emoji: '📁', x: 1, y: 8, w: 4, h: 4 },
  { id: 'security', name: '감사팀', emoji: '🔒', x: 6, y: 8, w: 4, h: 4 },
  { id: 'academy', name: '학습팀', emoji: '📚', x: 11, y: 8, w: 4, h: 4 },
  { id: 'brand', name: '브랜드팀', emoji: '🎨', x: 16, y: 8, w: 4, h: 4 },
  { id: 'standup', name: '스탠드업', emoji: '🎤', x: 1, y: 15, w: 4, h: 4 },
  { id: 'career', name: '커리어팀', emoji: '💼', x: 6, y: 15, w: 4, h: 4 },
  { id: 'recon', name: '정찰팀', emoji: '🔍', x: 11, y: 15, w: 4, h: 4 },
  { id: 'ceo-digest', name: 'CEO Digest', emoji: '🏢', x: 16, y: 15, w: 4, h: 4 },
];

const STATUS_HEX: Record<string, string> = { GREEN: '#3fb950', YELLOW: '#d29922', RED: '#f85149' };

// ── 타입 ─────────────────────────────────────────────────────────────────────
interface BriefingData {
  id: string; name: string; emoji: string; role: string; status: string;
  summary: string; schedule: string;
  stats?: { total: number; success: number; failed: number; rate: number };
  recentActivity?: Array<{ time: string; task: string; result: string; message: string }>;
  boardMinutes?: { date: string; content: string } | null;
}

// ── React 컴포넌트 ──────────────────────────────────────────────────────────
export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<unknown>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [chatResp, setChatResp] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const openBriefingRef = useRef<(id: string) => void>(() => {});

  const openBriefing = useCallback(async (teamId: string) => {
    setPanelOpen(true);
    setBriefing(null);
    setChatResp('');
    try {
      const res = await fetch(`/api/entity/${teamId}/briefing`);
      if (!res.ok) throw new Error();
      setBriefing(await res.json() as BriefingData);
    } catch { setBriefing(null); }
  }, []);

  openBriefingRef.current = openBriefing;

  const closeBriefing = () => { setPanelOpen(false); setBriefing(null); setChatResp(''); };

  // Phaser 초기화 (동적 import)
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    let game: { destroy: (b: boolean) => void } | null = null;

    (async () => {
      const Phaser = await import('phaser');

      const STATUS_COLORS: Record<string, number> = { GREEN: 0x3fb950, YELLOW: 0xd29922, RED: 0xf85149 };

      class OfficeScene extends Phaser.Scene {
        player!: Phaser.GameObjects.Arc;
        playerEmoji!: Phaser.GameObjects.Text;
        cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
        wasd!: Record<string, Phaser.Input.Keyboard.Key>;
        npcs: Array<{ room: typeof ROOMS[0]; led: Phaser.GameObjects.Arc; statusText: Phaser.GameObjects.Text; cx: number; cy: number }> = [];
        nearbyNpc: typeof this.npcs[0] | null = null;
        interactPrompt!: Phaser.GameObjects.Text;
        isMoving = false;
        gridX = 10; gridY = 6;

        constructor() { super({ key: 'OfficeScene' }); }

        create() {
          const mapW = MAP_COLS * TILE, mapH = MAP_ROWS * TILE;
          this.add.rectangle(mapW / 2, mapH / 2, mapW, mapH, 0x161b22);
          for (const y of [6.5, 13.5]) this.add.rectangle(mapW / 2, y * TILE, mapW - TILE * 2, TILE * 2, 0x21262d);
          this.add.text(mapW / 2, TILE * 0.3, '🏢 JARVIS COMPANY HQ', { fontSize: '14px', fontFamily: 'monospace', color: '#58a6ff' }).setOrigin(0.5);

          for (const room of ROOMS) {
            const x = room.x * TILE, y = room.y * TILE, w = room.w * TILE, h = room.h * TILE;
            this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x0d1117);
            this.add.graphics().lineStyle(2, 0x30363d).strokeRect(x, y, w, h);
            this.add.text(x + w / 2, y + 8, `${room.emoji} ${room.name}`, { fontSize: '10px', fontFamily: 'monospace', color: '#8b949e' }).setOrigin(0.5, 0);
            const cx = (room.x + room.w / 2) * TILE, cy = (room.y + room.h / 2 + 0.5) * TILE;
            const npc = this.add.circle(cx, cy, 12, 0x8b949e).setInteractive();
            this.add.text(cx, cy, room.emoji, { fontSize: '16px' }).setOrigin(0.5);
            const led = this.add.circle(cx + 14, cy - 14, 4, STATUS_COLORS.GREEN);
            const statusText = this.add.text(cx, cy + 18, '...', { fontSize: '8px', fontFamily: 'monospace', color: '#8b949e' }).setOrigin(0.5);
            npc.on('pointerdown', () => openBriefingRef.current(room.id));
            this.npcs.push({ room, led, statusText, cx, cy });
          }

          this.player = this.add.circle(this.gridX * TILE + TILE / 2, this.gridY * TILE + TILE / 2, 10, 0x58a6ff).setDepth(10);
          this.playerEmoji = this.add.text(0, 0, '🧑', { fontSize: '18px' }).setOrigin(0.5).setDepth(11);
          this.interactPrompt = this.add.text(0, 0, '', { fontSize: '11px', fontFamily: 'monospace', color: '#ffffff', backgroundColor: '#30363d', padding: { x: 6, y: 3 } }).setOrigin(0.5).setVisible(false).setDepth(100);

          if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.wasd = this.input.keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
            this.input.keyboard.on('keydown-E', () => { if (this.nearbyNpc) openBriefingRef.current(this.nearbyNpc.room.id); });
            this.input.keyboard.on('keydown-SPACE', () => { if (this.nearbyNpc) openBriefingRef.current(this.nearbyNpc.room.id); });
          }

          this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
          this.cameras.main.setBounds(0, 0, mapW, mapH);
          this.add.text(8, this.scale.height - 24, '[←↑↓→/WASD] 이동  [E/Space] 대화  [ESC] 닫기', { fontSize: '11px', fontFamily: 'monospace', color: '#8b949e' }).setScrollFactor(0).setDepth(200);

          this.loadData();
          this.time.addEvent({ delay: 15000, callback: () => this.loadData(), loop: true });
        }

        update() {
          if (!this.cursors || this.isMoving) return;
          let dx = 0, dy = 0;
          if (this.cursors.left.isDown || this.wasd?.A?.isDown) dx = -1;
          else if (this.cursors.right.isDown || this.wasd?.D?.isDown) dx = 1;
          else if (this.cursors.up.isDown || this.wasd?.W?.isDown) dy = -1;
          else if (this.cursors.down.isDown || this.wasd?.S?.isDown) dy = 1;
          if (dx === 0 && dy === 0) { this.checkProximity(); return; }
          const nx = this.gridX + dx, ny = this.gridY + dy;
          if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) return;
          this.gridX = nx; this.gridY = ny; this.isMoving = true;
          this.tweens.add({
            targets: this.player, x: nx * TILE + TILE / 2, y: ny * TILE + TILE / 2, duration: 100,
            onUpdate: () => { this.playerEmoji.setPosition(this.player.x, this.player.y); },
            onComplete: () => { this.isMoving = false; this.checkProximity(); },
          });
        }

        checkProximity() {
          let closest: typeof this.npcs[0] | null = null, minDist = Infinity;
          for (const npc of this.npcs) {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.cx, npc.cy);
            if (dist < TILE * 3 && dist < minDist) { closest = npc; minDist = dist; }
          }
          this.nearbyNpc = closest;
          if (closest) {
            this.interactPrompt.setText(`[E] ${closest.room.name}`).setPosition(closest.cx, closest.cy - 28).setVisible(true);
          } else {
            this.interactPrompt.setVisible(false);
          }
        }

        async loadData() {
          try {
            const res = await fetch('/api/agent-live');
            if (!res.ok) return;
            const data = await res.json();
            const teams = Object.fromEntries((data.teams || []).map((t: { teamId: string }) => [t.teamId, t]));
            for (const npc of this.npcs) {
              const d = teams[npc.room.id] as { status?: string; lastTask?: string } | undefined;
              if (!d) continue;
              const st = d.status === 'success' ? 'GREEN' : d.status === 'failed' ? 'RED' : 'YELLOW';
              npc.led.setFillStyle(STATUS_COLORS[st] || STATUS_COLORS.GREEN);
              let label = d.lastTask || 'idle';
              if (label.length > 14) label = label.slice(0, 13) + '…';
              npc.statusText.setText(label);
            }
          } catch { /* retry */ }
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        width: containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
        backgroundColor: '#0d1117',
        pixelArt: true,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [OfficeScene],
      });
      gameRef.current = game;
    })();

    return () => { if (game) game.destroy(true); gameRef.current = null; };
  }, []);  

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeBriefing(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sendBtw = async () => {
    if (!chatMsg.trim() || !briefing) return;
    setChatLoading(true); setChatResp('');
    const msg = chatMsg; setChatMsg('');
    try {
      // TODO: office server /api/chat 연동
      setChatResp(`[메시지 전송됨] "${msg}" → ${briefing.name}`);
    } catch { setChatResp('응답 실패'); }
    setChatLoading(false);
  };

  const stColor = (s: string) => STATUS_HEX[s] || STATUS_HEX.GREEN;
  const stLabel = (s: string) => s === 'GREEN' ? '정상' : s === 'YELLOW' ? '주의' : '이상';
  const resColor = (r: string) => r === 'SUCCESS' ? '#3fb950' : r === 'FAILED' ? '#f85149' : '#d29922';

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: '-apple-system, sans-serif' }}>
      <div ref={containerRef} style={{ flex: 1 }} />

      {/* 브리핑 패널 */}
      <div style={{
        width: panelOpen ? 380 : 0, overflow: 'hidden', transition: 'width 0.3s ease',
        borderLeft: panelOpen ? '1px solid #30363d' : 'none', background: '#161b22', overflowY: 'auto',
      }}>
        {briefing && (
          <div style={{ padding: '16px 20px', minWidth: 360 }}>
            <button onClick={closeBriefing} style={{ float: 'right', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 16 }}>✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 36 }}>{briefing.emoji}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{briefing.name}</div>
                <div style={{ fontSize: 12, color: '#8b949e' }}>{briefing.role}</div>
                <div style={{ fontSize: 11, color: '#8b949e' }}>📅 {briefing.schedule}</div>
              </div>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 16,
              fontSize: 12, fontWeight: 600, background: stColor(briefing.status) + '18',
              color: stColor(briefing.status), border: `1px solid ${stColor(briefing.status)}`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: stColor(briefing.status) }} />
              {stLabel(briefing.status)}
            </span>

            <Sec title="📌 현재 상태"><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{briefing.summary}</p></Sec>

            {briefing.stats && (
              <Sec title="📊 24시간 지표">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <Kpi label="성공률" value={`${briefing.stats.rate}%`} />
                  <Kpi label="성공" value={String(briefing.stats.success)} color="#3fb950" />
                  <Kpi label="실패" value={String(briefing.stats.failed)} color="#f85149" />
                </div>
              </Sec>
            )}

            {(briefing.recentActivity?.length ?? 0) > 0 && (
              <Sec title="📋 최근 활동">
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {briefing.recentActivity!.slice(0, 10).map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 0', fontSize: 11, borderBottom: '1px solid #21262d' }}>
                      <span style={{ color: '#8b949e', minWidth: 38 }}>{a.time?.slice(11, 16)}</span>
                      <span style={{ color: resColor(a.result), fontWeight: 600, minWidth: 50 }}>{a.result}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.task}</span>
                    </div>
                  ))}
                </div>
              </Sec>
            )}

            {briefing.boardMinutes && (
              <Sec title={`📝 최근 보고 (${briefing.boardMinutes.date})`}>
                <pre style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: 10, fontSize: 10, color: '#8b949e', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
                  {briefing.boardMinutes.content}
                </pre>
              </Sec>
            )}

            <Sec title="💬 /btw 말걸기">
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendBtw()} placeholder={`${briefing.name}에게...`}
                  style={{ flex: 1, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '6px 10px', color: '#e6edf3', fontSize: 12, outline: 'none' }} />
                <button onClick={sendBtw} disabled={chatLoading} style={{ background: '#238636', border: 'none', borderRadius: 6, padding: '6px 14px', color: '#fff', fontSize: 12, cursor: 'pointer', opacity: chatLoading ? 0.5 : 1 }}>전송</button>
              </div>
              {chatResp && <div style={{ marginTop: 8, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>{chatResp}</div>}
            </Sec>
          </div>
        )}
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 16 }}><h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#8b949e' }}>{title}</h3>{children}</div>;
}
function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: 6, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#8b949e' }}>{label}</div><div style={{ fontSize: 16, fontWeight: 700, color: color || '#e6edf3' }}>{value}</div></div>;
}
